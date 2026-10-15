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
  // 모드: 이동(기본) → 회전 → 크기, 모드마다 손잡이가 다르다
  await expect(page.getByTestId('gizmo')).toHaveAttribute('data-mode', 'move');
  for (const t of ['gizmo-x', 'gizmo-z', 'gizmo-move']) await expect(page.getByTestId(t)).toHaveCount(1);
  await expect(page.getByTestId('gizmo-rotate')).toHaveCount(0);
  await page.getByTestId('gizmo-mode-rotate').dispatchEvent('pointerdown', { button: 0 });
  for (const t of ['gizmo-rotate', 'gizmo-turn', 'gizmo-perp']) await expect(page.getByTestId(t)).toHaveCount(1);
  await page.getByTestId('gizmo-mode-scale').dispatchEvent('pointerdown', { button: 0 });
  for (const t of ['gizmo-width', 'gizmo-height', 'gizmo-scale']) await expect(page.getByTestId(t)).toHaveCount(1);
  await page.getByTestId('gizmo-mode-move').dispatchEvent('pointerdown', { button: 0 });
  // 작게: X 화살표가 화면에서 약 48px
  const c = (await page.getByTestId('gizmo-move').boundingBox())!, xh = (await page.getByTestId('gizmo-x').boundingBox())!;
  const lenPx = Math.hypot(xh.x + xh.width / 2 - (c.x + c.width / 2), xh.y + xh.height / 2 - (c.y + c.height / 2));
  expect(lenPx).toBeGreaterThan(35); expect(lenPx).toBeLessThan(65);
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
  await page.getByTestId('gizmo-mode-rotate').dispatchEvent('pointerdown', { button: 0 });
  await drag(page, 'gizmo-rotate', 0, 8);
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
  // 3D 그림 위에서도 항상 보이고 눌린다: 손잡이 자리의 맨 위 요소가 손잡이, 선마다 어두운 테두리
  for (const t of ['gizmo-x', 'gizmo-z', 'gizmo-move']) {
    const top = await page.getByTestId(t).evaluate((el) => { const r = el.getBoundingClientRect(); return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)?.getAttribute('data-testid'); });
    expect(top).toBe(t);
  }
  expect(await page.getByTestId('gizmo').locator('.halo').count()).toBeGreaterThanOrEqual(2);
  const before = await quadOf(page, id);
  await drag(page, 'gizmo-x', 100, 0);
  expect((await quadOf(page, id))[0][0]).toBeGreaterThan(before[0][0]);
  await expect.poll(() => overlay.getAttribute('src'), { timeout: 30_000 }).not.toBe(first);
});

const turnOf = (page: Page, id: string) => page.evaluate((id) => (window as unknown as { __ganpanda: { objects: { id: string; turn?: { deg: number; hinge: string } }[] } }).__ganpanda.objects.find((o) => o.id === id)!.turn ?? null, id);

test('3단계 벽에서 돌려 세우기: [⟂ 벽에 직각] → 90°(경첩 변은 그대로), 경첩 바꾸기, 초록 손잡이로 각도, [벽에 붙이기]로 원래대로', async ({ page, request }) => {
  await openOwnedProject(page, request);
  await loadSample(page);
  await setCamera(page);
  const flat = await rectOnWall(page, 1500, 3800, 2000, 800);
  const id = await addSign(page, flat);
  await page.getByTestId('gizmo-mode-rotate').dispatchEvent('pointerdown', { button: 0 });
  await expect(page.getByTestId('gizmo-turn')).toHaveCount(1);
  await page.getByTestId('gizmo-perp').dispatchEvent('pointerdown', { button: 0 });
  await expect.poll(() => turnOf(page, id)).toEqual({ deg: 90, hinge: 'left' });
  const q90 = await quadOf(page, id);
  // 왼쪽 변(경첩)은 그대로, 먼 변은 벽에서 나와 다른 자리
  expect(Math.hypot(q90[0][0] - flat[0][0], q90[0][1] - flat[0][1])).toBeLessThan(1);
  expect(Math.hypot(q90[3][0] - flat[3][0], q90[3][1] - flat[3][1])).toBeLessThan(1);
  expect(Math.hypot(q90[1][0] - flat[1][0], q90[1][1] - flat[1][1])).toBeGreaterThan(20);
  const g = page.getByTestId('gizmo');
  await expect(g).toHaveAttribute('data-turn', '90');
  await expect(page.getByTestId('sign-handle')).toHaveCount(0); // 돌린 사인물은 꼭짓점 편집 대신 매니퓰레이터
  await expect(page.getByTestId('persp-guide')).toHaveCount(0);
  // 경첩 바꾸기 → 오른쪽 변이 벽에 붙는다
  await page.getByTestId('gizmo-hinge').dispatchEvent('pointerdown', { button: 0 });
  await expect.poll(() => turnOf(page, id)).toEqual({ deg: 90, hinge: 'right' });
  const qr = await quadOf(page, id);
  // 먼 변은 풀린 카메라로 다시 계산되므로(합성 사진은 카메라와 조금 다름) 경첩 변만큼 정확하지는 않다
  expect(Math.hypot(qr[1][0] - flat[1][0], qr[1][1] - flat[1][1])).toBeLessThan(15);
  // 초록 손잡이를 끌어 각도를 줄인다
  await drag(page, 'gizmo-turn', -60, 0);
  const t = await turnOf(page, id);
  expect(t === null || t.deg < 90).toBe(true);
  // 벽에 붙이기 → turn 없음, 외곽선은 벽 위 직사각형
  if (t) {
    await page.getByTestId('gizmo-flat').dispatchEvent('pointerdown', { button: 0 });
    await expect.poll(() => turnOf(page, id)).toBeNull();
  }
  await expect(page.getByTestId('gizmo-perp')).toHaveCount(1);
});

test('크기 모드: 노란 모서리 손잡이는 비율 유지, 흰 손잡이는 가로·세로 따로', async ({ page, request }) => {
  await openOwnedProject(page, request);
  await loadSample(page);
  await setCamera(page);
  const id = await addSign(page, await rectOnWall(page, 1000, 3800, 2000, 800));
  await page.getByTestId('gizmo-mode-scale').dispatchEvent('pointerdown', { button: 0 });
  // 벽 위 크기(mm)로 잰다 — 사진 px 비율은 원근 때문에 자리마다 다르다
  const wallSize = () => page.evaluate(async (id) => {
    const mp = '/src/lib/core/manipulator.ts'; const { frameOf } = await import(/* @vite-ignore */ mp);
    const wp = '/src/lib/core/wallPlane.ts'; const { wallPlaneOf } = await import(/* @vite-ignore */ wp);
    const app = (window as unknown as { __ganpanda: { photos: { id: string }[]; calibrations: Map<string, unknown>; objects: { id: string; quad: Pt[] }[] } }).__ganpanda;
    const plane = wallPlaneOf([], app.calibrations.get(app.photos[0].id));
    const f = frameOf(plane, app.objects.find((o) => o.id === id)!.quad);
    return [f.w, f.h] as [number, number];
  }, id);
  const side = async () => wallSize();
  const [w0, h0] = await side();
  await drag(page, 'gizmo-scale', 40, -15);
  const [w1, h1] = await side();
  expect(w1).toBeGreaterThan(w0 * 1.1);
  expect(w1 / h1).toBeCloseTo(w0 / h0, 1); // 시작 외곽선은 합성 사진에서 그려 카메라 직사각형과 0.3% 정도 다르다
  await drag(page, 'gizmo-width', 30, 0);
  const [w2, h2] = await side();
  expect(w2).toBeGreaterThan(w1);
  expect(Math.abs(h2 - h1)).toBeLessThan(1);
});

test('원근 설정이 없는 사진에는 돌려 세우기 손잡이가 없다 (카메라가 있어야 정확)', async ({ page, request }) => {
  await openOwnedProject(page, request);
  await loadSample(page);
  await addSign(page, await rectOnWall(page, 1500, 3800, 2000, 800));
  await expect(page.getByTestId('gizmo')).toBeVisible();
  await page.getByTestId('gizmo-mode-rotate').dispatchEvent('pointerdown', { button: 0 });
  await expect(page.getByTestId('gizmo-rotate')).toHaveCount(1);
  await expect(page.getByTestId('gizmo-turn')).toHaveCount(0);
  await expect(page.getByTestId('gizmo-perp')).toHaveCount(0);
});

test('직각으로 세운 사인물도 3D 단계에서 그려진다', async ({ page, request }) => {
  await openOwnedProject(page, request);
  await loadSample(page);
  await setCamera(page);
  const id = await addSign(page, await rectOnWall(page, 1500, 3800, 2000, 800));
  await page.getByTestId('gizmo-mode-rotate').dispatchEvent('pointerdown', { button: 0 });
  await page.getByTestId('gizmo-perp').dispatchEvent('pointerdown', { button: 0 });
  await expect.poll(() => turnOf(page, id)).not.toBeNull();
  await page.getByTestId('stage-3d').click();
  await expect(page.getByTestId('photo-overlay')).toHaveAttribute('src', /^data:image\/png/, { timeout: 30_000 });
});

test('원근 격자: 고르면 사인물 둘레에 면의 축대로 격자, X 를 끄는 동안 가로선이 진해진다. 버튼은 아이콘(설명은 마우스를 올리면)', async ({ page, request }) => {
  await openOwnedProject(page, request);
  await loadSample(page);
  await setCamera(page);
  await addSign(page, await rectOnWall(page, 1000, 3800, 3000, 800));
  const grid = page.getByTestId('persp-grid');
  await expect(grid).toHaveCount(1);
  expect(Number(await grid.getAttribute('data-step'))).toBeGreaterThan(0);
  expect(await grid.locator('line.gx').count()).toBeGreaterThan(2);
  expect(await grid.locator('line.gz').count()).toBeGreaterThan(2);
  // 끄는 동안 X 방향(가로선) 강조
  const h = (await page.getByTestId('gizmo-x').boundingBox())!;
  await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2); await page.mouse.down();
  await page.mouse.move(h.x + h.width / 2 + 20, h.y + h.height / 2);
  expect(await grid.locator('line.gx.hot').count()).toBeGreaterThan(0);
  expect(await grid.locator('line.gz.hot').count()).toBe(0);
  await page.mouse.up();
  // 아이콘 버튼에는 설명(title)이 있다
  await page.getByTestId('gizmo-mode-rotate').dispatchEvent('pointerdown', { button: 0 });
  await expect(page.getByTestId('gizmo-perp').locator('title')).toHaveText(/직각/);
  await expect(page.getByTestId('gizmo-mode-move').locator('title')).toHaveText('이동');
});

test('매니퓰레이터 기본 크기는 설정에서 조절 (기기에 기억)', async ({ page, request }) => {
  await openOwnedProject(page, request);
  await loadSample(page);
  await setCamera(page);
  await addSign(page, await rectOnWall(page, 1000, 3800, 3000, 800));
  const arrow = async () => { const c = (await page.getByTestId('gizmo-move').boundingBox())!, x = (await page.getByTestId('gizmo-x').boundingBox())!; return Math.hypot(x.x + x.width / 2 - (c.x + c.width / 2), x.y + x.height / 2 - (c.y + c.height / 2)); };
  const before = await arrow();
  await page.getByTestId('open-settings').click();
  await page.getByTestId('gizmo-size').fill('96');
  await page.getByTestId('close-settings').click();
  const after = await arrow();
  expect(after / before).toBeGreaterThan(1.7);
  expect(await page.evaluate(() => localStorage.getItem('ganpanda.gizmoSize'))).toBe('96');
});
