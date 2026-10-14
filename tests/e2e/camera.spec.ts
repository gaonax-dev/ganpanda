import { expect, test } from '@playwright/test';
import { openOwnedProject } from './helpers';

type Pt = [number, number];
async function loadSample(page: import('@playwright/test').Page) {
  const dataUrl = await page.evaluate(async () => {
    const path = '/src/lib/sim/sample.ts';
    const { makeSamplePhoto } = await import(/* @vite-ignore */ path);
    return makeSamplePhoto().toDataURL('image/png') as string;
  });
  await page.getByTestId('photo-input').setInputFiles({ name: '매장.png', mimeType: 'image/png', buffer: Buffer.from(dataUrl.split(',')[1], 'base64') });
  await page.getByTestId('photo-zone').waitFor();
  await expect(page.getByTestId('sync-status')).toHaveAttribute('data-status', 'online');
}
/** 샘플 벽(9000×6000mm) 위 mm → 사진 px */
const wallToPx = (page: import('@playwright/test').Page, pts: Pt[]) => page.evaluate(async (pts) => {
  const path = '/src/lib/sim/sample.ts';
  const { SAMPLE } = await import(/* @vite-ignore */ path);
  const hp = '/src/lib/core/homography.ts';
  const { applyHomography, solveHomography } = await import(/* @vite-ignore */ hp);
  const H = solveHomography([[0, SAMPLE.wallH], [SAMPLE.wallW, SAMPLE.wallH], [SAMPLE.wallW, 0], [0, 0]], SAMPLE.corners);
  return pts.map((p) => applyHomography(H, p as [number, number]) as [number, number]);
}, pts);

test('카메라 설정: 축 선 두 쌍 + 원점 + 기준 길이 → 사인물 치수 추정이 10% 안, 실사 보기에 쓰인다', async ({ page, request }) => {
  await openOwnedProject(page, request);
  await loadSample(page);
  await expect(page.getByTestId('camera-status')).toHaveAttribute('data-status', 'none');
  // 치수 없는 창문 영역만 있음 → 카메라 없이는 추정 불가
  const winId = await page.evaluate(async () => {
    const path = '/src/lib/sim/sample.ts';
    const { SAMPLE } = await import(/* @vite-ignore */ path);
    const hp = '/src/lib/core/homography.ts';
    const { applyHomography, solveHomography } = await import(/* @vite-ignore */ hp);
    const H = solveHomography([[0, SAMPLE.wallH], [SAMPLE.wallW, SAMPLE.wallH], [SAMPLE.wallW, 0], [0, 0]], SAMPLE.corners);
    const rect = (x: number, y: number, w: number, h: number) => [[x, y + h], [x + w, y + h], [x + w, y], [x, y]].map((p) => applyHomography(H, p as [number, number]));
    const app = (window as unknown as { __ganpanda: { project: { allPhotos(): { id: string }[]; addObject(o: unknown): string } } }).__ganpanda;
    return app.project.addObject({ photoId: app.project.allPhotos()[0].id, name: '창', shape: 'rect', quad: rect(600, 4950, 1500, 850), sheetIds: [] });
  });

  await page.getByTestId('camera-open').click();
  const dlg = page.getByTestId('camera-dialog');
  await expect(dlg).toBeVisible();
  await expect(dlg.getByTestId('camera-handle')).toHaveCount(4 * 2 + 1 + 2);
  // 사진의 직선에서 자동 제안 → 선이 바뀐다
  const before = await page.evaluate(() => JSON.stringify((window as unknown as { __ganpanda: { cameraDraft: unknown } }).__ganpanda.cameraDraft));
  await dlg.getByTestId('camera-propose').click();
  await expect.poll(() => page.evaluate(() => JSON.stringify((window as unknown as { __ganpanda: { cameraDraft: unknown } }).__ganpanda.cameraDraft)), { timeout: 15_000 }).not.toBe(before);

  // 정확한 값으로: 띠 위·아래(가로), 문 좌·우(세로), 원점 = 벽 좌하단, 기준 = 문 폭 1000
  const [bandTL, bandTR, bandBL, bandBR, doorTL, doorBL, doorTR, doorBR, origin] = await wallToPx(page, [[0, 4700], [9000, 4700], [0, 3700], [9000, 3700], [4000, 2900], [4000, 0], [5000, 2900], [5000, 0], [0, 0]]);
  await page.evaluate(({ bandTL, bandTR, bandBL, bandBR, doorTL, doorBL, doorTR, doorBR, origin }) => {
    const app = (window as unknown as { __ganpanda: { cameraDraft: unknown } }).__ganpanda;
    app.cameraDraft = { x: [{ a: bandTL, b: bandTR }, { a: bandBL, b: bandBR }], y: [{ a: doorTL, b: doorBL }, { a: doorTR, b: doorBR }], origin, ref: { a: doorBL, b: doorBR, axis: 'x', mm: 1000 }, principal: 'center' };
  }, { bandTL, bandTR, bandBL, bandBR, doorTL, doorBL, doorTR, doorBR, origin });
  await expect(dlg.getByTestId('camera-result')).toContainText('초점거리');
  await dlg.getByTestId('camera-apply').click();
  await expect(dlg).toHaveCount(0);
  await expect(page.getByTestId('camera-status')).toHaveAttribute('data-status', 'set');

  // 창문 추정 1500×850 의 10% 안
  await page.evaluate((id) => (window as unknown as { __ganpanda: { selectObject(id: string): void } }).__ganpanda.selectObject(id), winId);
  await page.getByTestId('object-settings-open').click();
  const w = Number((await page.getByTestId('width-mm').getAttribute('placeholder'))!.replace(/[^\d]/g, ''));
  const h = Number((await page.getByTestId('height-mm').getAttribute('placeholder'))!.replace(/[^\d]/g, ''));
  expect(Math.abs(w - 1500) / 1500).toBeLessThan(0.1);
  expect(Math.abs(h - 850) / 850).toBeLessThan(0.1);
  await page.getByTestId('close-object-settings').click();

  // 실사 보기가 카메라를 쓴다
  await page.getByTestId('render-open').click();
  await expect(page.getByTestId('render-dialog')).toContainText('카메라 설정');
  await page.getByTestId('close-render').click();

  // 지우기 → 설정 없음, 추정도 사라짐
  await page.getByTestId('camera-clear').click();
  await expect(page.getByTestId('camera-status')).toHaveAttribute('data-status', 'none');
});

test('카메라 창에서 핸들을 끌면 설정이 바뀌고, 선 쌍이 평행하면 경고한다', async ({ page, request }) => {
  await openOwnedProject(page, request);
  await loadSample(page);
  await page.getByTestId('camera-open').click();
  const dlg = page.getByTestId('camera-dialog');
  const handle = dlg.locator('[data-testid="camera-handle"][data-key="x0a"]');
  const b = (await handle.boundingBox())!;
  const scale = Number(await dlg.getByTestId('camera-svg').getAttribute('data-scale'));
  const before = await page.evaluate(() => (window as unknown as { __ganpanda: { cameraDraft: { x: { a: [number, number] }[] } } }).__ganpanda.cameraDraft.x[0].a);
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2 + 40 * scale, b.y + b.height / 2 + 20 * scale, { steps: 5 });
  await page.mouse.up();
  const after = await page.evaluate(() => (window as unknown as { __ganpanda: { cameraDraft: { x: { a: [number, number] }[] } } }).__ganpanda.cameraDraft.x[0].a);
  expect(Math.abs(after[0] - (before[0] + 40))).toBeLessThanOrEqual(2);
  expect(Math.abs(after[1] - (before[1] + 20))).toBeLessThanOrEqual(2);
  // 기본 배치는 가로 선 두 개가 평행 → 경고가 보인다
  await expect(dlg.getByTestId('camera-warning').first()).toContainText('평행');
  await dlg.getByTestId('camera-ref-mm').fill('900');
  await page.keyboard.press('Escape');
  await expect(dlg).toHaveCount(0);
});
