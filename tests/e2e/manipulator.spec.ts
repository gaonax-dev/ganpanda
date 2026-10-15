import { expect, test, type Page } from '@playwright/test';
import { openOwnedProject } from './helpers';

type Pt = [number, number];
async function loadSample(page: Page) {
  const dataUrl = await page.evaluate(async () => { const path = '/src/lib/sim/sample.ts'; const { makeSamplePhoto } = await import(/* @vite-ignore */ path); return makeSamplePhoto().toDataURL('image/png') as string; });
  await page.getByTestId('photo-input').setInputFiles({ name: '매장.png', mimeType: 'image/png', buffer: Buffer.from(dataUrl.split(',')[1], 'base64') });
  await page.getByTestId('photo-zone').waitFor();
  await expect(page.getByTestId('sync-status')).toHaveAttribute('data-status', 'online');
}
/** 샘플 벽(9000×6000mm) 위 mm → 사진 px */
const wallToPx = (page: Page, pts: Pt[]) => page.evaluate(async (pts) => {
  const sp = '/src/lib/sim/sample.ts'; const { SAMPLE } = await import(/* @vite-ignore */ sp);
  const hp = '/src/lib/core/homography.ts'; const { applyHomography, solveHomography } = await import(/* @vite-ignore */ hp);
  const H = solveHomography([[0, SAMPLE.wallH], [SAMPLE.wallW, SAMPLE.wallH], [SAMPLE.wallW, 0], [0, 0]], SAMPLE.corners);
  return pts.map((p) => applyHomography(H, p as [number, number]) as [number, number]);
}, pts);
const rectOnWall = async (page: Page, x: number, y: number, w: number, h: number) => wallToPx(page, [[x, y + h], [x + w, y + h], [x + w, y], [x, y]]);
const quadOf = (page: Page, id: string) => page.evaluate((id) => (window as unknown as { __ganpanda: { objects: { id: string; quad: Pt[] }[] } }).__ganpanda.objects.find((o) => o.id === id)!.quad, id);
async function addSign(page: Page, quad: Pt[]) {
  return page.evaluate((quad) => {
    const app = (window as unknown as { __ganpanda: { photos: { id: string }[]; project: { addObject(o: unknown): string }; selectObject(id: string): void } }).__ganpanda;
    const id = app.project.addObject({ photoId: app.photos[0].id, name: '띠', shape: 'rect', quad, sheetIds: [], productId: 'board-flex', widthMm: 4000, heightMm: 900 });
    app.selectObject(id);
    return id;
  }, quad);
}
async function drag(page: Page, testid: string, dx: number, dy: number) {
  const h = page.getByTestId(testid);
  const b = (await h.boundingBox())!;
  const x = b.x + b.width / 2, y = b.y + b.height / 2;
  await page.mouse.move(x, y); await page.mouse.down();
  await page.mouse.move(x + dx / 2, y + dy / 2); await page.mouse.move(x + dx, y + dy); await page.mouse.up();
}
/** 샘플 벽에 맞춘 원근 설정 (띠 위·아래 가로 선, 문 좌·우 높이 선, 원점 = 벽 좌하단, 기준 = 9000mm) */
async function setCamera(page: Page) {
  const [bandTL, bandTR, bandBL, bandBR, doorTL, doorBL, doorTR, doorBR, origin, wallBR] = await wallToPx(page, [[0, 4700], [9000, 4700], [0, 3700], [9000, 3700], [4000, 2900], [4000, 0], [5000, 2900], [5000, 0], [0, 0], [9000, 0]]);
  await page.evaluate((c) => {
    const app = (window as unknown as { __ganpanda: { photos: { id: string }[]; project: { updatePhoto(id: string, p: unknown): void } } }).__ganpanda;
    app.project.updatePhoto(app.photos[0].id, { camera: { x: [{ a: c.bandTL, b: c.bandTR }, { a: c.bandBL, b: c.bandBR }], y: [{ a: c.doorTL, b: c.doorBL }, { a: c.doorTR, b: c.doorBR }], origin: c.origin, ref: { axis: 'x', point: c.wallBR, mm: 9000 }, axes: { first: '+x', second: '+z' }, principal: 'center' } });
  }, { bandTL, bandTR, bandBL, bandBR, doorTL, doorBL, doorTR, doorBR, origin, wallBR });
  await expect(page.getByTestId('camera-open')).toHaveAttribute('data-status', 'set');
}

test('매니퓰레이터: 고르면 3축 화살표·회전 고리·크기 손잡이가 뜨고, X 로 끌면 벽을 따라 원근대로 옮겨진다 (멀어지면 작아짐)', async ({ page, request }) => {
  await openOwnedProject(page, request);
  await loadSample(page);
  await setCamera(page);
  const id = await addSign(page, await rectOnWall(page, 1000, 3800, 3000, 800));
  await expect(page.getByTestId('gizmo')).toBeVisible();
  for (const t of ['gizmo-x', 'gizmo-z', 'gizmo-move', 'gizmo-rotate', 'gizmo-width', 'gizmo-height']) await expect(page.getByTestId(t)).toHaveCount(1);
  await expect(page.getByTestId('persp-guide')).toHaveCount(0); // 원근 직사각형이면 원근 매니퓰레이터는 안 뜸
  const before = await quadOf(page, id);
  await drag(page, 'gizmo-x', 120, 30); // 세로 성분은 무시
  const after = await quadOf(page, id);
  expect(after[0][0]).toBeGreaterThan(before[0][0] + 20);
  // 사진의 벽은 오른쪽이 가까워(샘플: 오른쪽 변이 더 김) 오른쪽으로 옮기면 세로가 길어진다 — 원근을 따름
  const hgt = (q: Pt[]) => Math.hypot(q[0][0] - q[3][0], q[0][1] - q[3][1]);
  expect(hgt(after)).not.toBeCloseTo(hgt(before), 0);
  // 옮긴 뒤에도 원근 직사각형 그대로 (원근 매니퓰레이터 없음)
  await expect(page.getByTestId('persp-guide')).toHaveCount(0);
  // 회전 고리로 돌리면 기울어진다 → 축에서 조금 기울면 원근 매니퓰레이터가 [원근에 맞추기] 제안
  await drag(page, 'gizmo-rotate', 0, 12);
  await expect(page.getByTestId('persp-guide')).toBeVisible();
  await page.getByTestId('persp-align').dispatchEvent('pointerdown', { button: 0 });
  await expect(page.getByTestId('persp-guide')).toHaveCount(0);
});

test('원근 매니퓰레이터: 손으로 비튼 외곽선은 맞춘 모양(점선)과 [원근에 맞추기]가 뜨고, 누르면 설정한 원근의 직사각형이 된다', async ({ page, request }) => {
  await openOwnedProject(page, request);
  await loadSample(page);
  await setCamera(page);
  const q = await rectOnWall(page, 1000, 3800, 3000, 800);
  const hand: Pt[] = [[q[0][0], q[0][1] - 30], q[1], [q[2][0] + 25, q[2][1]], q[3]];
  const id = await addSign(page, hand);
  const guide = page.getByTestId('persp-guide');
  await expect(guide).toBeVisible();
  expect(Number(await guide.getAttribute('data-skew'))).toBeGreaterThan(3);
  await page.getByTestId('persp-align').dispatchEvent('pointerdown', { button: 0 });
  await expect(guide).toHaveCount(0);
  const fixed = await quadOf(page, id);
  expect(fixed).not.toEqual(hand);
});

test('원근 설정이 없는 사진에서도 매니퓰레이터로 옮긴다 (사인물 자신의 면 기준), 원근 매니퓰레이터는 원근을 맞춘 뒤에', async ({ page, request }) => {
  await openOwnedProject(page, request);
  await loadSample(page);
  const id = await addSign(page, await rectOnWall(page, 1000, 3800, 3000, 800));
  await expect(page.getByTestId('gizmo')).toBeVisible();
  const before = await quadOf(page, id);
  await drag(page, 'gizmo-move', 40, -20);
  expect((await quadOf(page, id))[0]).not.toEqual(before[0]);
  await expect(page.getByTestId('persp-guide')).toHaveCount(0);
});

test('3D 단계: 사인물을 눌러 고르면 매니퓰레이터가 뜨고, 옮기면 그 사진의 3D 가 다시 그려진다', async ({ page, request }) => {
  await openOwnedProject(page, request);
  await loadSample(page);
  await setCamera(page);
  const id = await addSign(page, await rectOnWall(page, 1000, 3800, 3000, 800));
  await page.evaluate(() => (window as unknown as { __ganpanda: { selectObject(id: string | null): void } }).__ganpanda.selectObject(null));
  await page.getByTestId('stage-3d').click();
  const overlay = page.getByTestId('photo-overlay');
  await expect(overlay).toHaveCount(1, { timeout: 30_000 });
  const first = await overlay.getAttribute('src');
  await expect(page.getByTestId('gizmo')).toHaveCount(0);
  // 합성 그림 위에서 사인물 자리를 누르면 고른다
  const shape = page.getByTestId('sign-shape');
  const b = (await shape.boundingBox())!;
  await page.mouse.click(b.x + b.width * 0.3, b.y + b.height / 2);
  await expect(page.getByTestId('gizmo')).toBeVisible();
  const before = await quadOf(page, id);
  await drag(page, 'gizmo-x', 100, 0);
  expect((await quadOf(page, id))[0][0]).toBeGreaterThan(before[0][0]);
  await expect.poll(() => overlay.getAttribute('src'), { timeout: 30_000 }).not.toBe(first);
});
