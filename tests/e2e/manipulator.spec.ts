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

test('매니퓰레이터: 원근 축 X·Y·Z 화살표 / 회전 고리 3개 / 크기 손잡이 8개. X 로 끌면 외곽선이 벽을 따라 원근대로 옮겨진다 (멀어지면 작아짐)', async ({ page, request }) => {
  // 2026-10-15 사용자: "크기는 각면 중앙과 꼭지에 있어야 한다. 로테이트는 3면 모두에", "메니폴레이터는 원근의 값을 기준으로 작동해야한다"
  await openOwnedProject(page, request);
  await loadSample(page);
  await setCamera(page);
  const id = await addSign(page, await rectOnWall(page, 1000, 3800, 3000, 800));
  await expect(page.getByTestId('gizmo')).toBeVisible();
  // 모드: 이동(기본) → 회전 → 크기, 모드마다 손잡이가 다르다
  await expect(page.getByTestId('gizmo')).toHaveAttribute('data-mode', 'move');
  for (const t of ['gizmo-x', 'gizmo-y', 'gizmo-z', 'gizmo-move']) await expect(page.getByTestId(t)).toHaveCount(1);
  await expect(page.getByTestId('gizmo-rot-x')).toHaveCount(0);
  await page.getByTestId('gizmo-mode-rotate').dispatchEvent('pointerdown', { button: 0 });
  for (const t of ['gizmo-rot-x', 'gizmo-rot-y', 'gizmo-rot-z', 'gizmo-ring-x', 'gizmo-ring-y', 'gizmo-ring-z']) await expect(page.getByTestId(t)).toHaveCount(1);
  await page.getByTestId('gizmo-mode-scale').dispatchEvent('pointerdown', { button: 0 });
  await expect(page.getByTestId('gizmo').locator('[data-testid^="gizmo-size-"]')).toHaveCount(8);
  await expect(page.getByTestId('sign-handle')).toHaveCount(0); // 크기 모드에선 꼭짓점 손잡이 대신 크기 손잡이
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
});

test('매니퓰레이터 자리 = 외곽선 대각선 교점 (새로 그린 사인물도)', async ({ page, request }) => {
  // 2026-10-15 사용자: "새로 생성하는 사인물툴의 메니폴레이터가 엉뚱한곳에 나타나"
  await openOwnedProject(page, request);
  await loadSample(page);
  await setCamera(page);
  // 사진에 그냥 그린 사각형(벽 원근과 다름)
  const id = await addSign(page, [[500, 120], [760, 140], [770, 260], [490, 250]]);
  const q = await quadOf(page, id);
  const at = await page.evaluate(async (q) => { const mp = '/src/lib/core/manipulator.ts'; const { quadCenter } = await import(/* @vite-ignore */ mp); return quadCenter(q) as Pt; }, q);
  const c = (await page.getByTestId('gizmo-move').boundingBox())!;
  const z = await page.evaluate(() => { const svg = document.querySelector('[data-testid="photo-zone"] svg') as SVGSVGElement; const m = svg.getScreenCTM()!; return { a: m.a, e: m.e, d: m.d, f: m.f }; });
  expect(Math.abs(c.x + c.width / 2 - (z.a * at[0] + z.e))).toBeLessThan(2);
  expect(Math.abs(c.y + c.height / 2 - (z.d * at[1] + z.f))).toBeLessThan(2);
});

test('원근 매니퓰레이터: 손으로 비튼 외곽선은 [⊞ 원근에 맞추기]만 뜨고(점선 제안 없음), 누르면 설정한 원근의 직사각형이 된다', async ({ page, request }) => {
  await openOwnedProject(page, request);
  await loadSample(page);
  await setCamera(page);
  const q = await rectOnWall(page, 1000, 3800, 3000, 800);
  const hand: Pt[] = [[q[0][0], q[0][1] - 30], q[1], [q[2][0] + 25, q[2][1]], q[3]];
  const id = await addSign(page, hand);
  const guide = page.getByTestId('persp-guide');
  await expect(guide).toBeVisible();
  expect(Number(await guide.getAttribute('data-skew'))).toBeGreaterThan(3);
  await expect(guide.locator('polygon')).toHaveCount(0); // 2026-10-15 "너무 복잡해": 맞춘 모양 점선은 그리지 않는다
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

const fieldOf = (page: Page, id: string, k: string) => page.evaluate(({ id, k }) => ((window as unknown as { __ganpanda: { objects: Record<string, unknown>[] } }).__ganpanda.objects.find((o) => o.id === id)![k] ?? null), { id, k });
/** 원근 설정의 카메라로 본, 벽(x)에 직각으로 붙은 판의 사진 외곽선 (높이 y0~y0+h, 벽에서 out0~out0+w) */
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

test('크기 모드(외곽선만): 노란 꼭짓점 손잡이는 비율 유지, 흰 변 가운데 손잡이는 가로·세로 따로, 반대쪽 변은 그대로', async ({ page, request }) => {
  // 2026-10-15 사용자: "크기는 각면 중앙과 꼭지에 있어야 한다", "크기는 외곽선만"
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
  await drag(page, 'gizmo-size-1_1', 40, -15);
  const [w1, h1] = await side();
  expect(w1).toBeGreaterThan(w0 * 1.1);
  expect(w1 / h1).toBeCloseTo(w0 / h0, 1); // 시작 외곽선은 합성 사진에서 그려 카메라 직사각형과 0.3% 정도 다르다
  await drag(page, 'gizmo-size-1_0', 30, 0);
  const [w2, h2] = await side();
  expect(w2).toBeGreaterThan(w1);
  expect(Math.abs(h2 - h1)).toBeLessThan(1);
  // 왼쪽 변 가운데: 오른쪽 변(TR·BR)은 그대로
  const q2 = await quadOf(page, id);
  await drag(page, 'gizmo-size--1_0', -30, 0);
  const q3 = await quadOf(page, id);
  expect(Math.hypot(q3[1][0] - q2[1][0], q3[1][1] - q2[1][1])).toBeLessThan(1.5);
  expect(q3[0][0]).toBeLessThan(q2[0][0] - 5);
  // 아래 변 가운데: 세로만
  await drag(page, 'gizmo-size-0_-1', 0, 20);
  const [, h4] = await side();
  expect(h4).toBeGreaterThan(h2 + 10);
});

test('원근 설정이 없는 사진: 박스 회전 고리·평면 판이 없다 (원근 축이 없으므로). 크기 손잡이 8개는 있다', async ({ page, request }) => {
  await openOwnedProject(page, request);
  await loadSample(page);
  await addSign(page, await rectOnWall(page, 1500, 3800, 2000, 800));
  await expect(page.getByTestId('gizmo')).toBeVisible();
  await page.getByTestId('gizmo-mode-rotate').dispatchEvent('pointerdown', { button: 0 });
  await expect(page.getByTestId('gizmo-rotate')).toHaveCount(1);
  await expect(page.getByTestId('gizmo-rot-x')).toHaveCount(0);
  await page.getByTestId('gizmo-mode-move').dispatchEvent('pointerdown', { button: 0 });
  await expect(page.getByTestId('face-axes')).toHaveCount(0);
  await page.getByTestId('gizmo-mode-scale').dispatchEvent('pointerdown', { button: 0 });
  await expect(page.getByTestId('gizmo').locator('[data-testid^="gizmo-size-"]')).toHaveCount(8);
});

test('박스 방향을 바꾼 사인물도 3D 단계에서 그려진다', async ({ page, request }) => {
  await openOwnedProject(page, request);
  await loadSample(page);
  await setCamera(page);
  const id = await addSign(page, await rectOnWall(page, 1500, 3800, 2000, 800));
  await page.getByTestId('face-x').dispatchEvent('pointerdown', { button: 0 });
  await expect.poll(() => fieldOf(page, id, 'faceAxis')).toBe('x');
  await page.getByTestId('stage-3d').click();
  await expect(page.getByTestId('photo-overlay')).toHaveAttribute('src', /^data:image\/png/, { timeout: 30_000 });
});

test('상자 가이드: 두께 있는 사인물은 고르면 입체 상자가 보인다(자홍 점선 제안 상자는 없음). 시트는 없음. 버튼은 아이콘', async ({ page, request }) => {
  await openOwnedProject(page, request);
  await loadSample(page);
  await setCamera(page);
  const q = await rectOnWall(page, 1000, 3800, 3000, 800);
  const id = await addSign(page, q);
  const box = page.getByTestId('box-guide');
  await expect(box).toHaveCount(1);
  expect(await box.locator('line.edge').count()).toBe(12);
  await expect(page.getByTestId('box-guide-target')).toHaveCount(0); // 원근에 맞음
  // 손으로 비튼 외곽선이어도 제안 상자는 없다 (2026-10-15 사용자: "너무 복잡해")
  const hand: Pt[] = [[q[0][0], q[0][1] - 30], q[1], [q[2][0] + 25, q[2][1]], q[3]];
  await page.evaluate(({ id, hand }) => (window as unknown as { __ganpanda: { project: { updateObject(id: string, p: unknown): void } } }).__ganpanda.project.updateObject(id, { quad: hand }), { id, hand });
  await expect(page.getByTestId('persp-align')).toHaveCount(1);
  await expect(page.getByTestId('box-guide-target')).toHaveCount(0);
  // 시트(두께 없음)는 상자 없음
  await page.evaluate((id) => (window as unknown as { __ganpanda: { project: { updateObject(id: string, p: unknown): void } } }).__ganpanda.project.updateObject(id, { productId: undefined, sheetIds: ['sh-cut'] }), id);
  await expect(page.getByTestId('box-guide')).toHaveCount(0);
  // 아이콘 버튼에는 설명(title)
  await page.getByTestId('gizmo-mode-rotate').dispatchEvent('pointerdown', { button: 0 });
  await expect(page.getByTestId('gizmo-rot-z').locator('title')).toHaveText(/박스/);
  await expect(page.getByTestId('gizmo-mode-move').locator('title')).toHaveText('이동 (W)');
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

test('돌출 간판 면에 그린 외곽선: 박스는 벽 가로(X) 방향으로 자동, 외곽선은 그대로이고 맞추기 제안은 없다', async ({ page, request }) => {
  // 2026-10-15 사용자: "간판처럼 해줘 너무 복잡해. 구도를 보고 면 방향을 인식할 수 있잖아"
  await openOwnedProject(page, request);
  await loadSample(page);
  await setCamera(page);
  const q = await sideQuad(page, 300, 3000, 900, 0, 1200);
  const id = await addSign(page, q);
  await expect(page.getByTestId('gizmo')).toHaveAttribute('data-box', 'x');
  await expect(page.getByTestId('persp-align')).toHaveCount(0);
  expect(await quadOf(page, id)).toEqual(q);
});

test('X·Y·Z 단추·회전 고리는 박스 방향만 바꾼다: 외곽선·사인물 크기는 그대로, 상자만 그 방향. 켜진 판을 다시 누르면 자동', async ({ page, request }) => {
  // 2026-10-15 사용자: "정면을 바꾸면 박스 구조만 변경되고 원 사인물은 형태를 유지해야한다", "사인물사각툴은 3d가 아니다… 따라다니는 박스만 3d이다", "박스만 회전하고 크기는 외곽선만"
  await openOwnedProject(page, request);
  await loadSample(page);
  await setCamera(page);
  const q = await rectOnWall(page, 1000, 3800, 3000, 800);
  const id = await addSign(page, q);
  const g = page.getByTestId('gizmo'), face = page.getByTestId('box-guide').locator('polygon.face');
  await expect(g).toHaveAttribute('data-box', 'y');
  await expect(page.getByTestId('face-y')).toHaveAttribute('data-on', 'true');
  // 2026-10-15 사용자: "사인물 정면을 선택하는 것 move일때 하단에 x,y,z 단추로 선택하게 사각은 보이지 않는다" — 판 대신 모드 단추 아래 X·Y·Z 단추
  await expect(page.getByTestId('face-axes').locator('polygon')).toHaveCount(0);
  for (const a of ['x', 'y', 'z']) await expect(page.getByTestId(`face-${a}`).locator('text')).toHaveText(a.toUpperCase());
  const mode = (await page.getByTestId('gizmo-mode-move').boundingBox())!, fy = (await page.getByTestId('face-y').boundingBox())!;
  expect(fy.y).toBeGreaterThan(mode.y + mode.height - 1); // 모드 단추 아래
  await page.getByTestId('gizmo-mode-rotate').dispatchEvent('pointerdown', { button: 0 });
  await expect(page.getByTestId('face-axes')).toHaveCount(0); // 이동 모드에서만
  await page.getByTestId('gizmo-mode-move').dispatchEvent('pointerdown', { button: 0 });
  const boxY = await face.getAttribute('points');
  // X 판: 박스가 벽 가로로 — 외곽선 그대로, 상자만 바뀜
  await page.getByTestId('face-x').dispatchEvent('pointerdown', { button: 0 });
  await expect.poll(() => fieldOf(page, id, 'faceAxis')).toBe('x');
  await expect(g).toHaveAttribute('data-box', 'x');
  expect(await quadOf(page, id)).toEqual(q);
  await expect(face).not.toHaveAttribute('points', boxY!);
  // 켜진 X 판을 다시 누르면 자동(Y)
  await page.getByTestId('face-x').dispatchEvent('pointerdown', { button: 0 });
  await expect.poll(() => fieldOf(page, id, 'faceAxis')).toBeNull();
  await expect(face).toHaveAttribute('points', boxY!);
  // Z 고리로 박스를 돌린다 — 외곽선은 그대로, 방향은 축 사이(none)
  await page.getByTestId('gizmo-mode-rotate').dispatchEvent('pointerdown', { button: 0 });
  await drag(page, 'gizmo-rot-z', 12, 6);
  await expect.poll(() => fieldOf(page, id, 'boxDir')).not.toBeNull();
  expect(await quadOf(page, id)).toEqual(q);
  await expect(face).not.toHaveAttribute('points', boxY!);
  await page.getByTestId('gizmo-mode-move').dispatchEvent('pointerdown', { button: 0 });
  await expect(g).toHaveAttribute('data-box', 'none');
});

test('QWER: Q 선택 도구, W 이동, E 회전, R 크기 (매니퓰레이터 모드). 사각 영역은 T', async ({ page, request }) => {
  // 2026-10-15 사용자: "qwer 선택,이동,회전,크기"
  await openOwnedProject(page, request);
  await loadSample(page);
  await setCamera(page);
  await addSign(page, await rectOnWall(page, 1000, 3800, 3000, 800));
  const g = page.getByTestId('gizmo');
  await page.keyboard.press('e'); await expect(g).toHaveAttribute('data-mode', 'rotate');
  await page.keyboard.press('r'); await expect(g).toHaveAttribute('data-mode', 'scale');
  await page.keyboard.press('w'); await expect(g).toHaveAttribute('data-mode', 'move');
  await expect(page.getByTestId('gizmo-mode-rotate').locator('title')).toHaveText('회전 (E)');
  await page.keyboard.press('t'); await expect(page.getByTestId('tool-rect')).toHaveClass(/on/);
  await page.keyboard.press('q'); await expect(page.getByTestId('tool-select')).toHaveClass(/on/);
});
