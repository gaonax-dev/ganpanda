// 치수 블록 안전장치 (2026-11-05 사용자: "두 가지 안전장치 모두 적용해줘") — 원근과 안 맞는 블록은 표시하고 기준에서 뺀다
/* eslint-disable @typescript-eslint/no-explicit-any */
import { expect, test, type Page } from '@playwright/test';
import { openOwnedProject } from './helpers';

type Pt = [number, number];
async function loadSample(page: Page) {
  const dataUrl = await page.evaluate(async () => { const path = '/src/lib/sim/sample.ts'; const { makeSamplePhoto } = await import(/* @vite-ignore */ path); return makeSamplePhoto().toDataURL('image/png') as string; });
  await page.getByTestId('photo-input').setInputFiles({ name: '매장.png', mimeType: 'image/png', buffer: Buffer.from(dataUrl.split(',')[1], 'base64') });
  await page.getByTestId('photo-zone').first().waitFor();
}
const wallToPx = (page: Page, pts: Pt[]) => page.evaluate(async (pts) => {
  const sp = '/src/lib/sim/sample.ts'; const { SAMPLE } = await import(/* @vite-ignore */ sp);
  const hp = '/src/lib/core/homography.ts'; const { applyHomography, solveHomography } = await import(/* @vite-ignore */ hp);
  const H = solveHomography([[0, SAMPLE.wallH], [SAMPLE.wallW, SAMPLE.wallH], [SAMPLE.wallW, 0], [0, 0]], SAMPLE.corners);
  return pts.map((p) => applyHomography(H, p as [number, number]) as [number, number]);
}, pts);
const rectOnWall = (page: Page, x: number, y: number, w: number, h: number) => wallToPx(page, [[x, y + h], [x + w, y + h], [x + w, y], [x, y]]);

test('원근과 안 맞는 블록(넣은 가로·세로 비율이 원근으로 잰 비율과 30% 넘게 다름)은 "원근과 안 맞음" 표시, 치수 추정의 기준에서 빠진다', async ({ page, request }) => {
  await openOwnedProject(page, request, '블록 안전장치');
  await loadSample(page);
  const [bandTL, bandTR, bandBL, bandBR, doorTL, doorBL, doorTR, doorBR, origin, wallBR] = await wallToPx(page, [[0, 4700], [9000, 4700], [0, 3700], [9000, 3700], [4000, 2900], [4000, 0], [5000, 2900], [5000, 0], [0, 0], [9000, 0]]);
  await page.evaluate((c) => {
    const g = (window as any).__ganpanda;
    g.project.updatePhoto(g.photos[0].id, { camera: { x: [{ a: c.bandTL, b: c.bandTR }, { a: c.bandBL, b: c.bandBR }], y: [{ a: c.doorTL, b: c.doorBL }, { a: c.doorTR, b: c.doorBR }], origin: c.origin, ref: { axis: 'x', point: c.wallBR, mm: 9000 }, axes: { first: '+x', second: '+z' }, principal: 'center' } });
  }, { bandTL, bandTR, bandBL, bandBR, doorTL, doorBL, doorTR, doorBR, origin, wallBR });
  await expect(page.getByTestId('camera-level')).toHaveAttribute('data-level', '3');
  const bq = await rectOnWall(page, 500, 500, 2000, 1000); // 벽 위 2000×1000 블록
  const sq = await rectOnWall(page, 5500, 500, 1000, 1000); // 벽 위 1000×1000 사인물
  const sid = await page.evaluate(({ bq, sq }) => {
    const g = (window as any).__ganpanda;
    g.project.updatePhoto(g.photos[0].id, { blocks: [{ q: bq, w: 4000, h: 2000 }] }); // 실제의 두 배로 입력 (비율은 맞음) → 사인물도 두 배
    return g.project.addObject({ photoId: g.photos[0].id, name: '사인', shape: 'rect', quad: sq, sheetIds: [] });
  }, { bq, sq });
  const estW = () => page.evaluate((id) => (window as any).__ganpanda.measures.get(id)?.estimate?.widthMm ?? 0, sid);
  await expect.poll(estW).toBeGreaterThan(1900); // 블록 기준 (≈2000)
  await expect(page.getByTestId('block-size')).not.toHaveAttribute('data-mismatch', '1');
  // 비율이 3배 다른 치수 → 원근과 안 맞음: 표시하고 기준에서 뺀다 → 원근만으로 (≈1000)
  await page.evaluate(() => { const g = (window as any).__ganpanda; g.project.updatePhoto(g.photos[0].id, { blocks: [{ ...g.photos[0].blocks[0], w: 6000, h: 1000 }] }); });
  await expect(page.getByTestId('block-size')).toHaveAttribute('data-mismatch', '1');
  await expect(page.getByTestId('block-size')).toContainText('원근과 안 맞음');
  await expect(page.locator('[data-testid="size-block"][data-index="0"]')).toHaveAttribute('data-mismatch', '1');
  await expect.poll(estW).toBeLessThan(1100);
  expect(await estW()).toBeGreaterThan(900);
  await page.evaluate(() => { const g = (window as any).__ganpanda; g.selectBlock(g.photos[0].id, 0); });
  await expect(page.getByTestId('block-mismatch')).toBeVisible();
});
