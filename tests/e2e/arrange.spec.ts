// 사진 보드 카드 정렬 (2026-10-20 사용자: "사진보드의 사인물 카드를 자동으로 정렬하고 싶다 … 사진 배열 이동 버튼을 선택하면 카드 배열 활성화하고 전체 아웃라인 표시 상단에 위치 재정렬 …
// 상단 버튼에 카드 간격 + - 도 추가" → "사진의 구도대로 평면화 하고 여기에서 축이 다른 경우도 평면으로 펴서 카드가 정렬되게")
import { expect, test, type Page } from '@playwright/test';
import { openOwnedProject } from './helpers';

type Pt = [number, number];
async function loadSample(page: Page) {
  const dataUrl = await page.evaluate(async () => { const path = '/src/lib/sim/sample.ts'; const { makeSamplePhoto } = await import(/* @vite-ignore */ path); return makeSamplePhoto().toDataURL('image/png') as string; });
  await page.getByTestId('photo-input').setInputFiles({ name: '매장.png', mimeType: 'image/png', buffer: Buffer.from(dataUrl.split(',')[1], 'base64') });
  await page.getByTestId('photo-zone').first().waitFor();
  await expect(page.getByTestId('sync-status')).toHaveAttribute('data-status', 'online');
}
const wallToPx = (page: Page, pts: Pt[]) => page.evaluate(async (pts) => {
  const sp = '/src/lib/sim/sample.ts'; const { SAMPLE } = await import(/* @vite-ignore */ sp);
  const hp = '/src/lib/core/homography.ts'; const { applyHomography, solveHomography } = await import(/* @vite-ignore */ hp);
  const H = solveHomography([[0, SAMPLE.wallH], [SAMPLE.wallW, SAMPLE.wallH], [SAMPLE.wallW, 0], [0, 0]], SAMPLE.corners);
  return pts.map((p) => applyHomography(H, p as [number, number]) as [number, number]);
}, pts);
const rectOnWall = (page: Page, x: number, y: number, w: number, h: number) => wallToPx(page, [[x, y + h], [x + w, y + h], [x + w, y], [x, y]]);
async function setCamera(page: Page) {
  const [bandTL, bandTR, bandBL, bandBR, doorTL, doorBL, doorTR, doorBR, origin, wallBR] = await wallToPx(page, [[0, 4700], [9000, 4700], [0, 3700], [9000, 3700], [4000, 2900], [4000, 0], [5000, 2900], [5000, 0], [0, 0], [9000, 0]]);
  await page.evaluate((c) => {
    const app = (window as unknown as { __ganpanda: { photos: { id: string }[]; project: { updatePhoto(id: string, p: unknown): void } } }).__ganpanda;
    app.project.updatePhoto(app.photos[0].id, { camera: { x: [{ a: c.bandTL, b: c.bandTR }, { a: c.bandBL, b: c.bandBR }], y: [{ a: c.doorTL, b: c.doorBL }, { a: c.doorTR, b: c.doorBR }], origin: c.origin, ref: { axis: 'x', point: c.wallBR, mm: 9000 }, axes: { first: '+x', second: '+z' }, principal: 'center' } });
  }, { bandTL, bandTR, bandBL, bandBR, doorTL, doorBL, doorTR, doorBR, origin, wallBR });
  await expect(page.getByTestId('camera-level')).toHaveAttribute('data-level', '3');
}
/** 벽(x)에 직각으로 붙은 판(돌출 간판)의 사진 외곽선: 높이 y0~y0+h, 벽에서 out0~out0+w */
const sideQuad = (page: Page, x: number, y0: number, h: number, out0: number, w: number) => page.evaluate(async (a) => {
  const cp = '/src/lib/core/camera.ts'; const { solveCamera } = await import(/* @vite-ignore */ cp);
  const fp = '/src/lib/core/faces.ts'; const { outSign } = await import(/* @vite-ignore */ fp);
  const hp = '/src/lib/core/homography.ts'; const { projectPoint } = await import(/* @vite-ignore */ hp);
  const ph = (window as unknown as { __ganpanda: { photos: { camera: unknown; w: number; h: number }[] } }).__ganpanda.photos[0];
  const pose = solveCamera(ph.camera, ph.w, ph.h).pose, n = outSign(pose);
  const P3 = (x: number, y: number, o: number) => projectPoint(pose, [x, y, o * n]) as Pt;
  const nt = P3(a.x, a.y0 + a.h, a.out0), nb = P3(a.x, a.y0, a.out0), ft = P3(a.x, a.y0 + a.h, a.out0 + a.w), fb = P3(a.x, a.y0, a.out0 + a.w);
  return nt[0] < ft[0] ? [nt, ft, fb, nb] : [ft, nt, nb, fb];
}, { x, y0, h, out0, w });
const listOf = (page: Page) => page.evaluate(() => Object.fromEntries((window as unknown as { __ganpanda: { objects: { name: string; listX?: number; listY?: number }[] } }).__ganpanda.objects.map((o) => [o.name, [o.listX, o.listY]])));

test('✥ 를 누르면 카드 배열(전체 외곽선·재정렬·간격), [재정렬] = 카드가 사진 속 사인물 자리 그대로(사진 바로 아래 같은 배치) — 간격 ± 는 그 간격으로 다시, 카드는 자유롭게', async ({ page, request }) => {
  // 2026-10-20 사용자: "사진보드의 사진과 사인물 배치 그리고 카드 정렬을 비교해 최대한 같은 위치로 인식되도록 구성해줘"
  await openOwnedProject(page, request);
  await loadSample(page);
  await setCamera(page);
  const band = await rectOnWall(page, 0, 3700, 9000, 1000);
  const door = await rectOnWall(page, 4000, 0, 1000, 2900);
  const side = await sideQuad(page, 300, 1000, 900, 0, 1200);
  await loadSample(page); // 두 번째 사진 (오른쪽에 이어 붙는다)
  await expect(page.getByTestId('photo-zone')).toHaveCount(2);
  await page.evaluate((q) => {
    const a = (window as unknown as { __ganpanda: { photos: { id: string; x: number }[]; project: { addObject(o: unknown): string } } }).__ganpanda;
    const [p1, p2] = [...a.photos].sort((x, y) => x.x - y.x);
    a.project.addObject({ photoId: p1.id, name: '띠', shape: 'rect', quad: q.band, sheetIds: [], widthMm: 9000, heightMm: 1000, listX: 5000, listY: 9000 });
    a.project.addObject({ photoId: p1.id, name: '문', shape: 'rect', quad: q.door, sheetIds: [], widthMm: 1000, heightMm: 2900, listX: 0, listY: 0 });
    a.project.addObject({ photoId: p1.id, name: '돌출', shape: 'rect', quad: q.side, sheetIds: [], widthMm: 1200, heightMm: 900 });
    a.project.addObject({ photoId: p2.id, name: '둘째', shape: 'rect', quad: q.door, sheetIds: [], widthMm: 800, heightMm: 800 });
  }, { band, door, side });
  await expect(page.getByTestId('board-card')).toHaveCount(4);
  await expect(page.getByTestId('flat-outline')).toHaveCount(0);
  // ✥ 를 누르면(끌지 않고) 배열 모드
  await page.getByTestId('zoom-fit').click();
  await page.waitForTimeout(300);
  const mv = (await page.getByTestId('flat-move').boundingBox())!;
  await page.mouse.click(mv.x + mv.width / 2, mv.y + mv.height / 2);
  await expect(page.getByTestId('flat-outline')).toBeVisible();
  await expect(page.getByTestId('flat-gap-value')).toHaveText('600');
  await page.getByTestId('flat-rearrange').click();
  await page.getByTestId('zoom-fit').click();
  await page.waitForTimeout(300);
  // 화면에서 사인물(사진 위)과 그 카드(사진 아래)를 비교
  const boxes = () => page.evaluate(() => {
    const a = (window as unknown as { __ganpanda: { objects: { id: string; name: string }[] } }).__ganpanda;
    const out: Record<string, { sign: number[]; card: number[] }> = {};
    for (const o of a.objects) {
      const s = document.querySelector(`[data-testid="photo-zone"] polygon[data-testid="sign-shape"][data-id="${o.id}"]`)?.getBoundingClientRect();
      const c = document.querySelector(`[data-testid="board-card"][data-id="${o.id}"]`)?.getBoundingClientRect();
      if (s && c) out[o.name] = { sign: [s.x + s.width / 2, s.y + s.height / 2], card: [c.x + c.width / 2, c.y, c.width] };
    }
    return out;
  });
  let B = await boxes();
  const zones = await page.getByTestId('photo-zone').evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return [r.x, r.x + r.width]; }).sort((p, q) => p[0] - q[0]));
  const photoW = zones[0][1] - zones[0][0];
  for (const n of ['띠', '문']) expect(Math.abs(B[n].card[0] - B[n].sign[0])).toBeLessThan(photoW * 0.08); // 사인물 가운데 아래에 카드 가운데
  expect(B['띠'].card[1]).toBeLessThan(B['문'].card[1]); // 위 사인물은 위
  expect(B['돌출'].card[0]).toBeLessThan(B['문'].card[0]); // 왼쪽 사인물은 왼쪽
  expect(B['둘째'].card[0]).toBeGreaterThan(zones[1][0]); // 둘째 사진의 카드는 그 사진 아래
  expect(B['둘째'].card[0]).toBeLessThan(zones[1][1]);
  // 간격 + → 700, 그 간격으로 다시
  await page.getByTestId('flat-gap-up').click();
  await expect(page.getByTestId('flat-gap-value')).toHaveText('700');
  // 카드는 자유롭게 옮긴다 → 다시 [재정렬]하면 그 자리로
  const before = (await listOf(page))['문'];
  await page.evaluate(() => { const a = (window as unknown as { __ganpanda: { objects: { id: string; name: string }[]; project: { updateObject(id: string, p: unknown): void } } }).__ganpanda; a.project.updateObject(a.objects.find((o) => o.name === '문')!.id, { listX: 20000, listY: 20000 }); });
  expect((await listOf(page))['문']).toEqual([20000, 20000]);
  await page.getByTestId('flat-rearrange').click();
  expect((await listOf(page))['문']).toEqual(before);
  // 완료 → 외곽선·단추 사라짐
  await page.getByTestId('flat-arrange-done').click();
  await expect(page.getByTestId('flat-outline')).toHaveCount(0);
  await expect(page.getByTestId('flat-rearrange')).toHaveCount(0);
});
