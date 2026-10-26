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

test('✥ 를 누르면 카드 배열(전체 외곽선·재정렬·간격), [재정렬] = 사진과 같은 비율(카드 가운데 = 사진 속 사인물 가운데, 사진 묶음은 그 사진 아래, ✥ 는 기본 자리) — 간격 ± 는 그 간격으로 다시, 카드는 자유롭게', async ({ page, request }) => {
  // 2026-10-22 사용자: "자동정렬은 피봇 기본 위치에 놓는다. 그리고 사진과 같은 비율로 사진과 비슷하게 정렬해준다" (2026-10-20 그리드는 대체됨)
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
  await expect(page.getByTestId('flat-gap-value')).toHaveText('100'); // 기본 100 (2026-10-24 "재정렬 간격 기본값 100으로 하고 50단위로")
  // 축척을 정해 뒀으면 재정렬해도 그대로 (2026-10-25 "재정렬에서 이전 설정의 확대 비율이 사라지고 줄어드는데 기존에 설정한 비율 유지하고 재정렬" — 2026-10-22 "사진과 같은 비율로 되돌림"은 대체됨)
  await page.evaluate(() => (window as unknown as { __ganpanda: { updateSettings(p: unknown): void } }).__ganpanda.updateSettings({ flatOffset: { x: 500, y: 300 }, flatScale: 0.6 }));
  await page.getByTestId('flat-rearrange').click();
  expect(await page.evaluate(() => (window as unknown as { __ganpanda: { settings: { flatOffset?: unknown } } }).__ganpanda.settings.flatOffset)).toEqual({ x: 0, y: 0 }); // ✥ 기본 자리
  expect(await page.evaluate(() => (window as unknown as { __ganpanda: { settings: { flatScale?: number } } }).__ganpanda.settings.flatScale)).toBe(0.6); // 정한 축척 유지
  // 축척을 정한 적이 없으면 사진과 같은 비율로 저장 (2026-10-22 스크린샷: 572% 에서 카드가 흩어졌다)
  await page.evaluate(() => (window as unknown as { __ganpanda: { updateSettings(p: unknown): void } }).__ganpanda.updateSettings({ flatScale: null }));
  await page.getByTestId('flat-rearrange').click();
  expect(await page.evaluate(() => (window as unknown as { __ganpanda: { settings: { flatScale?: number } } }).__ganpanda.settings.flatScale)).toBeLessThan(0.6);
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
  for (const n of ['띠', '문', '돌출']) { expect(B[n].card[0]).toBeGreaterThan(zones[0][0] - photoW * 0.05); expect(B[n].card[0]).toBeLessThan(zones[0][1] + photoW * 0.5); } // 첫 사진 묶음은 첫 사진 아래에서 시작
  expect(B['띠'].card[1]).toBeLessThan(B['문'].card[1]); // 위 사인물은 위
  expect(B['돌출'].card[0]).toBeLessThan(B['문'].card[0]); // 왼쪽 사인물은 왼쪽
  expect(B['둘째'].card[0]).toBeGreaterThan(zones[1][0]); // 둘째 사진의 카드는 그 사진 아래
  expect(B['둘째'].card[0]).toBeLessThan(zones[1][1]);
  // 간격 + → 700, 그 간격으로 다시
  await page.getByTestId('flat-gap-up').click();
  await expect(page.getByTestId('flat-gap-value')).toHaveText('150'); // + 한 번 = 50
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

test('연결된 사인물(⇄)의 카드는 가장 정면에서 찍힌 사진 아래로 — 사선 사진에서 먼저 그렸어도 (2026-10-21 핀볼 "사인물 정면뷰 카드정렬 문제점")', async ({ page, request }) => {
  await openOwnedProject(page, request);
  await loadSample(page);
  await loadSample(page);
  await expect(page.getByTestId('photo-zone')).toHaveCount(2);
  await page.evaluate(() => {
    const a = (window as unknown as { __ganpanda: { photos: { id: string; x: number }[]; project: { addObject(o: unknown): string; linkObject(id: string, to: string): void }; arrangeFlatCards(): void; editBoundary(): void } }).__ganpanda;
    const [p1, p2] = [...a.photos].sort((x, y) => x.x - y.x);
    // 첫 사진(사선)에서 먼저 그린 원본 — 비뚤어진 외곽선
    const m = a.project.addObject({ photoId: p1.id, name: '문시트', shape: 'rect', quad: [[300, 300], [420, 330], [420, 600], [300, 640]], sheetIds: [], widthMm: 870, heightMm: 2010 });
    // 둘째 사진(정면)의 같은 사인물 — 바른 직사각형
    const c = a.project.addObject({ photoId: p2.id, name: '문시트 정면', shape: 'rect', quad: [[900, 300], [1100, 300], [1100, 760], [900, 760]], sheetIds: [] });
    a.project.linkObject(c, m);
    a.editBoundary();
    a.arrangeFlatCards();
  });
  await page.getByTestId('zoom-fit').click();
  await page.waitForTimeout(300);
  const zones = await page.getByTestId('photo-zone').evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return [r.x, r.x + r.width]; }).sort((p, q) => p[0] - q[0]));
  const card = (await page.getByTestId('board-card').boundingBox())!;
  expect(card.x).toBeGreaterThanOrEqual(zones[1][0] - 2); // 둘째(정면) 사진 아래
  expect(card.x).toBeLessThan(zones[1][1]);
});

// 2026-10-26 사용자: "재정렬에서 사진과 사진소속 [카드]들의 간격 너무 크다. 그리고 내가 원한건 사진카드 크기 유지인데 단순 대지 크기만 유지 되었다"
// → 카드는 정해 둔 축척(크기) 그대로, 자리는 화면에서 사진 속 간격 그대로(겹치면 최대 1.5배) — 축척을 키워도 카드 사이·사진과 카드 사이가 같이 벌어지지 않는다
test('축척을 키워 둔 채 재정렬: 카드 크기는 그대로, 카드 사이는 사진 속 간격, 카드 묶음은 사진 바로 아래에서 시작', async ({ page, request }) => {
  await openOwnedProject(page, request);
  await loadSample(page);
  await setCamera(page);
  const L = await rectOnWall(page, 0, 3000, 1000, 1000);
  const R = await rectOnWall(page, 7000, 3000, 1000, 1000);
  await page.evaluate((q) => {
    const a = (window as unknown as { __ganpanda: { photos: { id: string }[]; project: { addObject(o: unknown): string } } }).__ganpanda;
    a.project.addObject({ photoId: a.photos[0].id, name: '왼', shape: 'rect', quad: q.L, sheetIds: [], widthMm: 1000, heightMm: 1000 });
    a.project.addObject({ photoId: a.photos[0].id, name: '오', shape: 'rect', quad: q.R, sheetIds: [], widthMm: 1000, heightMm: 1000 });
  }, { L, R });
  await expect(page.getByTestId('board-card')).toHaveCount(2);
  const k0 = await page.evaluate(() => (window as unknown as { __ganpanda: { flatScale: number } }).__ganpanda.flatScale);
  await page.evaluate((k) => (window as unknown as { __ganpanda: { updateSettings(p: unknown): void } }).__ganpanda.updateSettings({ flatScale: k * 2 }), k0); // 카드를 두 배로 키워 둠
  await page.evaluate(() => (window as unknown as { __ganpanda: { arrangeFlatCards(): void } }).__ganpanda.arrangeFlatCards());
  await page.getByTestId('zoom-fit').click();
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => (window as unknown as { __ganpanda: { settings: { flatScale?: number } } }).__ganpanda.settings.flatScale)).toBeCloseTo(k0 * 2, 6);
  const m = await page.evaluate(() => {
    const a = (window as unknown as { __ganpanda: { objects: { id: string; name: string }[] } }).__ganpanda;
    const r = (sel: string) => document.querySelector(sel)!.getBoundingClientRect();
    const o = (n: string) => a.objects.find((x) => x.name === n)!.id;
    const z = r('[data-testid="photo-zone"]');
    const s = (n: string) => r(`[data-testid="photo-zone"] polygon[data-testid="sign-shape"][data-id="${o(n)}"]`);
    const c = (n: string) => r(`[data-testid="board-card"][data-id="${o(n)}"]`);
    return { photoBottom: z.bottom, photoH: z.height, signGap: s('오').x + s('오').width / 2 - (s('왼').x + s('왼').width / 2), cardGap: c('오').x + c('오').width / 2 - (c('왼').x + c('왼').width / 2), cardTop: Math.min(c('왼').y, c('오').y), signW: s('왼').width, cardW: c('왼').width };
  });
  expect(m.cardW).toBeGreaterThan(m.signW * 1.5); // 키운 크기 그대로 (사진 속보다 크다)
  expect(m.cardGap / m.signGap).toBeGreaterThan(0.9); // 카드 사이 = 사진 속 간격 (겹치지 않으면 넓히지 않음)
  expect(m.cardGap / m.signGap).toBeLessThan(1.55);
  expect(m.cardTop - m.photoBottom).toBeLessThan(m.photoH * 0.35); // 사진 바로 아래 (사진 속 높이만큼 내려가지 않음)
});
