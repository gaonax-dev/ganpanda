import { expect, test } from '@playwright/test';
import { clearAutoCamera, openOwnedProject } from './helpers';

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
  await clearAutoCamera(page); // 손으로 맞추는 흐름 (등록 즉시 자동 원근은 따로 시험)
  await expect(page.getByTestId('camera-open')).toHaveAttribute('data-status', 'none');
  await expect(page.getByTestId('camera-overlay')).toHaveCount(0);
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
  await expect(dlg.getByTestId('camera-handle')).toHaveCount(4 * 2 + 1 + 2); // 축 선 끝점 8 + 원점 + 기준 선분 양 끝 (2026-10-18 시작도 끌 수 있게)
  // 사진의 직선에서 자동 제안 → 선이 바뀐다
  const before = await page.evaluate(() => JSON.stringify((window as unknown as { __ganpanda: { cameraDraft: unknown } }).__ganpanda.cameraDraft));
  // 자동 제안은 언제나 가로 쌍 → +X, 세로 쌍 → +Z (실내/실외 옵션 제거, 2026-10-18)
  await expect(dlg.getByTestId('camera-auto-axes')).toHaveCount(0);
  await dlg.getByTestId('camera-propose').click();
  await expect.poll(() => page.evaluate(() => JSON.stringify((window as unknown as { __ganpanda: { cameraDraft: unknown } }).__ganpanda.cameraDraft)), { timeout: 15_000 }).not.toBe(before);
  const axesOf = () => page.evaluate(() => (window as unknown as { __ganpanda: { cameraDraft: { axes?: { first: string; second: string } } } }).__ganpanda.cameraDraft.axes);
  expect(await axesOf()).toEqual({ first: '+x', second: '+z' });
  // 축 선 설정을 바꿔 두면 자동 제안이 그 축을 지킨다 (2026-10-18 사용자: "설정에 x, y 설정하고 자동으로 측정하면 x, z로 변경되어 결과가 나온다. 설정의 자동에서 따르게")
  await dlg.getByTestId('camera-axis-2').selectOption('+y');
  expect(await axesOf()).toEqual({ first: '+x', second: '+y' });
  await dlg.getByTestId('camera-propose').click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __ganpanda: { cameraBusy: boolean } }).__ganpanda.cameraBusy), { timeout: 15_000 }).toBe(false);
  expect(await axesOf()).toEqual({ first: '+x', second: '+y' });
  await dlg.getByTestId('camera-axis-2').selectOption('+z');

  // 정확한 값으로: 띠 위·아래(가로), 문 좌·우(세로), 원점 = 벽 좌하단, 기준 = 문 폭 1000
  const [bandTL, bandTR, bandBL, bandBR, doorTL, doorBL, doorTR, doorBR, origin, wallBR] = await wallToPx(page, [[0, 4700], [9000, 4700], [0, 3700], [9000, 3700], [4000, 2900], [4000, 0], [5000, 2900], [5000, 0], [0, 0], [9000, 0]]);
  await page.evaluate(({ bandTL, bandTR, bandBL, bandBR, doorTL, doorBL, doorTR, doorBR, origin, wallBR }) => {
    const app = (window as unknown as { __ganpanda: { cameraDraft: unknown } }).__ganpanda;
    // 기준 길이 = 중심선 하나(X)의 길이
    app.cameraDraft = { x: [{ a: bandTL, b: bandTR }, { a: bandBL, b: bandBR }], y: [{ a: doorTL, b: doorBL }, { a: doorTR, b: doorBR }], origin, ref: { axis: 'x', point: wallBR, mm: 9000 }, principal: 'center' }; // X 중심선 길이 = 원점(벽 좌하단)부터 벽 우하단까지 9000mm
  }, { bandTL, bandTR, bandBL, bandBR, doorTL, doorBL, doorTR, doorBR, origin, wallBR });
  await expect(dlg.getByTestId('camera-result')).toContainText('초점거리');
  await expect(dlg.getByTestId('camera-ref-axis')).toHaveValue('x');
  await expect(dlg.getByTestId('camera-ref-line')).toHaveAttribute('data-axis', 'x'); // X 축 위 기준 선분
  await expect(dlg.locator('[data-testid="camera-center-line"][data-axis="x"]')).toHaveCount(0); // 길이가 있는 축은 방향바 없음 (2026-10-18)
  await expect(dlg.locator('[data-testid="camera-center-line"][data-axis="z"]')).toHaveCount(1);
  await expect(dlg.locator('[data-testid="camera-handle"][data-key="rb"]')).toHaveCount(1); // 양 끝 핸들
  // 기준 축은 목록에서만 바꾼다 — 사진의 중심선을 눌러도 바뀌지 않는다 (2026-10-18 사용자: "방향막대를 클릭하면 변경되는데 이거 제거")
  await dlg.locator('[data-testid="camera-center-line"][data-axis="z"]').dispatchEvent('pointerdown', { bubbles: true, pointerId: 1 });
  await expect(dlg.getByTestId('camera-ref-axis')).toHaveValue('x');
  await dlg.getByTestId('camera-ref-axis').selectOption('z');
  await expect(dlg.getByTestId('camera-ref-axis')).toHaveValue('z');
  await expect(dlg.getByTestId('camera-ref-line')).toHaveAttribute('data-axis', 'z');
  await expect(dlg.locator('[data-testid="camera-center-line"][data-axis="x"]')).toHaveCount(1);
  await dlg.getByTestId('camera-ref-axis').selectOption('x');
  await expect(dlg.getByTestId('camera-ref-axis')).toHaveValue('x');
  // 기준 길이 핸들은 원점을 지나 −쪽으로도 간다 (2026-10-18 사용자: "길이 막대는 방향의 −영역 +영역 모두 이동 가능해야해")
  {
    const o = (await dlg.locator('[data-testid="camera-handle"][data-key="o"]').boundingBox())!;
    const r = (await dlg.locator('[data-testid="camera-handle"][data-key="rb"]').boundingBox())!;
    const ox = o.x + o.width / 2, oy = o.y + o.height / 2, rx = r.x + r.width / 2, ry = r.y + r.height / 2;
    await page.mouse.move(rx, ry); await page.mouse.down();
    const tx = ox - (rx - ox) * 0.2, ty = oy - (ry - oy) * 0.2;
    for (let i = 1; i <= 6; i++) await page.mouse.move(rx + (tx - rx) * i / 6, ry + (ty - ry) * i / 6);
    await page.mouse.up();
    const draftOf = () => page.evaluate(() => (window as unknown as { __ganpanda: { cameraDraft: { origin: number[]; ref: { from: number[]; to: number[] } } } }).__ganpanda.cameraDraft);
    const ref = await draftOf();
    expect(ref.ref.to[0]).toBeLessThan(ref.origin[0]); // 원점 왼쪽(−X)
    const r2 = (await dlg.locator('[data-testid="camera-handle"][data-key="rb"]').boundingBox())!;
    expect(r2.x + r2.width / 2).toBeLessThan(ox);
    await expect(dlg.getByTestId('camera-result')).toContainText('초점거리'); // 여전히 풀린다
    // 선분을 잡아 끌면 길이(두 끝 사이) 그대로 축을 따라 전체 이동 (2026-10-18 사용자: "길이 라인을 잡으면 길이 전체이동")
    const h = (await dlg.getByTestId('camera-ref-hit').boundingBox())!;
    const hx = h.x + h.width / 2, hy = h.y + h.height / 2;
    await page.mouse.move(hx, hy); await page.mouse.down();
    for (let i = 1; i <= 5; i++) await page.mouse.move(hx + 40 * i, hy);
    await page.mouse.up();
    const moved = await draftOf();
    const len = (r: { from: number[]; to: number[] }) => Math.hypot(r.to[0] - r.from[0], r.to[1] - r.from[1]);
    expect(len(moved.ref)).toBeCloseTo(len(ref.ref), 0);
    expect(moved.ref.from[0]).toBeGreaterThan(ref.ref.from[0] + 50);
    expect(moved.ref.to[0]).toBeGreaterThan(ref.ref.to[0] + 50);
  }
  await page.evaluate((wallBR) => { const app = (window as unknown as { __ganpanda: { cameraDraft: { ref: unknown } } }).__ganpanda; app.cameraDraft = { ...app.cameraDraft, ref: { axis: 'x', point: wallBR, mm: 9000 } }; }, wallBR);
  await expect(dlg.getByTestId('camera-3d')).toBeVisible(); // fSpy 처럼 3D 격자·축이 사진에 겹쳐 보인다
  await dlg.getByTestId('camera-apply').click();
  await expect(dlg).toHaveCount(0);
  await expect(page.getByTestId('camera-open')).toHaveAttribute('data-status', 'set');
  await expect(page.getByTestId('camera-overlay')).toHaveCount(1); // 사진 위에 원근 선이 보인다

  // 창문 추정 1500×850 의 10% 안
  await page.evaluate((id) => (window as unknown as { __ganpanda: { selectObject(id: string): void } }).__ganpanda.selectObject(id), winId);
  await page.getByTestId('object-settings-open').click();
  const w = Number((await page.getByTestId('width-mm').getAttribute('placeholder'))!.replace(/[^\d]/g, ''));
  const h = Number((await page.getByTestId('height-mm').getAttribute('placeholder'))!.replace(/[^\d]/g, ''));
  expect(Math.abs(w - 1500) / 1500).toBeLessThan(0.1);
  expect(Math.abs(h - 850) / 850).toBeLessThan(0.1);
  await page.getByTestId('close-object-settings').click();

  // 실사 보기가 카메라를 쓴다 (패널이 사진 머리 바를 가리지 않게 선택 해제)
  await page.evaluate(() => (window as unknown as { __ganpanda: { selectObject(id: string | null): void } }).__ganpanda.selectObject(null));
  await page.getByTestId('render-open').click();
  await expect(page.getByTestId('render-dialog')).toContainText('원근 맞추기');
  await page.getByTestId('close-render').click();

  // 지우기 → 설정 없음, 추정도 사라짐
  await page.getByTestId('camera-open').click();
  await page.getByTestId('camera-clear').click();
  await expect(page.getByTestId('camera-dialog')).toHaveCount(0);
  await expect(page.getByTestId('camera-open')).toHaveAttribute('data-status', 'none');
});

test('카메라 창에서 핸들을 끌면 설정이 바뀌고, 선 쌍이 평행하면 경고한다', async ({ page, request }) => {
  await openOwnedProject(page, request);
  await loadSample(page);
  await clearAutoCamera(page);
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
  // fSpy 식: 원점을 끌면 카메라 위치가 실시간으로 바뀌고, 화각이 표시된다
  await expect(dlg.getByTestId('camera-fov')).toContainText('화각');
  const posBefore = await dlg.getByTestId('camera-position').textContent();
  const refOf = () => page.evaluate(() => (window as unknown as { __ganpanda: { cameraDraft: { ref: { from: [number, number]; to: [number, number] } } } }).__ganpanda.cameraDraft.ref);
  const refBefore = await refOf();
  const oh = dlg.locator('[data-testid="camera-handle"][data-key="o"]');
  const ob = (await oh.boundingBox())!;
  await page.mouse.move(ob.x + ob.width / 2, ob.y + ob.height / 2);
  await page.mouse.down();
  await page.mouse.move(ob.x + ob.width / 2 + 60 * scale, ob.y + ob.height / 2, { steps: 4 });
  await page.mouse.up();
  await expect(dlg.getByTestId('camera-position')).not.toHaveText(posBefore!);
  // 기준 길이 선분(양 끝)은 피봇과 같이 이동
  const refAfter = await refOf();
  expect(Math.abs(refAfter.from[0] - (refBefore.from[0] + 60))).toBeLessThanOrEqual(3);
  expect(Math.abs(refAfter.to[0] - (refBefore.to[0] + 60))).toBeLessThanOrEqual(3);
  // 축 선택·리버스: 첫 쌍을 −X 로 하면 거울상 경고, 둘째 쌍은 자동으로 Y 유지
  await dlg.getByTestId('camera-axis-1').selectOption('-x');
  await expect(dlg.getByTestId('camera-axis-2')).toHaveValue('+z');
  await expect(dlg.getByTestId('camera-warning').filter({ hasText: '거울상' })).toHaveCount(1);
  await dlg.getByTestId('camera-axis-1').selectOption('+z');
  await expect(dlg.getByTestId('camera-axis-2')).toHaveValue('+x');
  await dlg.getByTestId('camera-axis-1').selectOption('+y'); // 세로(깊이): 다른 축(+X)과 겹치지 않으니 둘째는 그대로
  await expect(dlg.getByTestId('camera-axis-2')).toHaveValue('+x');
  await dlg.getByTestId('camera-axis-2').selectOption('+z'); // 옆면 벽 = 세로 + 높이
  await expect(dlg.getByTestId('camera-warning').filter({ hasText: '같은 축' })).toHaveCount(0);
  await dlg.getByTestId('camera-ref-mm').fill('900');
  await page.keyboard.press('Escape');
  await expect(dlg).toHaveCount(0);
});

test('돋보기는 Shift 를 누른 동안만 보인다', async ({ page, request }) => {
  await openOwnedProject(page, request);
  await loadSample(page);
  await page.getByTestId('camera-open').click();
  const dlg = page.getByTestId('camera-dialog');
  const h = dlg.locator('[data-testid="camera-handle"][data-key="x0a"]');
  const b = (await h.boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2 + 15, b.y + b.height / 2 + 5, { steps: 3 });
  await expect(dlg.locator('canvas.loupe')).toHaveCount(0); // 보통 끌기: 돋보기 없음
  await page.keyboard.down('Shift');
  await page.mouse.move(b.x + b.width / 2 + 25, b.y + b.height / 2 + 8, { steps: 3 });
  await expect(dlg.locator('canvas.loupe')).toHaveCount(1); // Shift: 돋보기
  await page.keyboard.up('Shift');
  await expect(dlg.locator('canvas.loupe')).toHaveCount(0);
  await page.mouse.up();
});

// 2026-10-19 사용자: "원근 -> 원근자동매칭 옆에 옵션버튼(네모두개겹친 아이콘)으로" → "크기를 지정하고 원근에 맞게 그려진 사인물의 코너에 중심점을 주고 사인물 길이를 사용해 표준 길이도 지정 자동으로 매칭"
test('사진 머리글 [원근 자동 매칭]: 크기를 넣은 사인물로 원근을 맞추고(코너 = 원점, 가로 = 기준 길이), 옆의 옵션(네모 두 개)이 창을 연다', async ({ page, request }) => {
  await openOwnedProject(page, request);
  await loadSample(page);
  await expect(page.getByTestId('camera-open').locator('svg rect')).toHaveCount(2); // 네모 두 개 겹친 아이콘
  // 문(벽 4000~5000 × 0~2900mm)에 맞게 그린 사인물 1000×2900, 그리고 크기 없는 띠(벽 0~9000 × 3700~4700)
  const [dTL, dTR, dBR, dBL, bTL, bTR, bBR, bBL] = await wallToPx(page, [[4000, 2900], [5000, 2900], [5000, 0], [4000, 0], [0, 4700], [9000, 4700], [9000, 3700], [0, 3700]]);
  await page.evaluate(({ dTL, dTR, dBR, dBL, bTL, bTR, bBR, bBL }) => {
    const app = (window as unknown as { __ganpanda: { photos: { id: string }[]; project: { addObject(o: unknown): string } } }).__ganpanda;
    const pid = app.photos[0].id;
    app.project.addObject({ photoId: pid, name: '문', shape: 'rect', quad: [dTL, dTR, dBR, dBL], sheetIds: [], widthMm: 1000, heightMm: 2900 });
    app.project.addObject({ photoId: pid, name: '띠', shape: 'rect', quad: [bTL, bTR, bBR, bBL], sheetIds: [] });
  }, { dTL, dTR, dBR, dBL, bTL, bTR, bBR, bBL });
  await page.getByTestId('camera-auto').click();
  await expect(page.getByTestId('camera-open')).toHaveAttribute('data-status', 'set');
  await expect(page.getByTestId('camera-dialog')).toHaveCount(0); // 창은 열리지 않는다
  const cam = await page.evaluate(() => (window as unknown as { __ganpanda: { photos: { camera?: { origin: number[]; ref: { mm: number; from: number[] }; axes: unknown } }[] } }).__ganpanda.photos[0].camera!);
  expect(cam.axes).toEqual({ first: '+x', second: '+z' });
  expect(cam.ref.mm).toBe(1000);
  expect(Math.hypot(cam.origin[0] - dBL[0], cam.origin[1] - dBL[1])).toBeLessThan(1); // 원점 = 사인물 왼쪽 아래 코너
  // 그 원근으로 크기 없는 띠의 가로가 실제(9000mm)에 가깝게 추정된다
  await expect.poll(() => page.evaluate(() => { const a = (window as unknown as { __ganpanda: { objects: { name: string }[]; sizeOf(o: unknown): { w: number } | null } }).__ganpanda; return a.sizeOf(a.objects.find((o) => o.name === '띠')!)?.w ?? 0; })).toBeGreaterThan(8100);
  expect(await page.evaluate(() => { const a = (window as unknown as { __ganpanda: { objects: { name: string }[]; sizeOf(o: unknown): { w: number } | null } }).__ganpanda; return a.sizeOf(a.objects.find((o) => o.name === '띠')!)!.w; })).toBeLessThan(9900);
  await page.getByTestId('camera-open').click();
  await expect(page.getByTestId('camera-dialog')).toBeVisible();
});

test('사진을 올리면 바로 원근을 자동으로 잡고(효과), 사인물 치수가 라인·비율과 맞으면 조용히 길이로 — 완성도만 오르고 경고 없음. 사람이 맞춘 원근·지운 원근은 손대지 않는다 (2026-10-19)', async ({ page, request }) => {
  type Cam = { origin: number[]; ref?: { mm: number; from: number[] }; auto?: boolean };
  const camOf = () => page.evaluate(() => (window as unknown as { __ganpanda: { photos: { camera?: Cam }[] } }).__ganpanda.photos[0].camera ?? null);
  await openOwnedProject(page, request);
  await loadSample(page);
  // 등록 즉시: 읽는 효과 → 원근을 잡음(축 선이 빛나며 그려짐). 기준 길이는 아직 없다
  await expect(page.getByTestId('camera-fx')).toHaveAttribute('data-kind', 'found', { timeout: 15_000 });
  await expect(page.getByTestId('camera-open')).toHaveAttribute('data-status', 'set');
  const c0 = (await camOf())!;
  expect(c0.auto).toBe(true);
  expect(c0.ref).toBeUndefined();
  await expect(page.getByTestId('camera-fx')).toHaveCount(0, { timeout: 5000 }); // 효과는 잠깐
  await expect(page.getByTestId('camera-level')).toHaveAttribute('data-level', '1'); // 축만
  // 문(벽 4000~5000 × 0~2900mm)에 맞게 그린 사인물 — 그리고 나서 치수를 넣는다
  const [dTL, dTR, dBR, dBL, bTL, bTR, bBR, bBL] = await wallToPx(page, [[4000, 2900], [5000, 2900], [5000, 0], [4000, 0], [0, 4700], [9000, 4700], [9000, 3700], [0, 3700]]);
  const ids = await page.evaluate(({ dTL, dTR, dBR, dBL, bTL, bTR, bBR, bBL }) => {
    const app = (window as unknown as { __ganpanda: { photos: { id: string }[]; project: { addObject(o: unknown): string } } }).__ganpanda;
    const pid = app.photos[0].id;
    return [app.project.addObject({ photoId: pid, name: '문', shape: 'rect', quad: [dTL, dTR, dBR, dBL], sheetIds: [] }), app.project.addObject({ photoId: pid, name: '띠', shape: 'rect', quad: [bTL, bTR, bBR, bBL], sheetIds: [] })];
  }, { dTL, dTR, dBR, dBL, bTL, bTR, bBR, bBL });
  const setSize = (id: string, w: number, h: number) => page.evaluate(({ id, w, h }) => (window as unknown as { __ganpanda: { project: { updateObject(id: string, p: unknown): void } } }).__ganpanda.project.updateObject(id, { widthMm: w, heightMm: h }), { id, w, h });
  await setSize(ids[0], 1000, 2900);
  // 근사치 → 원점 = 문 왼쪽 아래, 기준 길이 = 1000mm. 조용히(효과·안내 없이) — AI 축과 실측이 맞으니 완성도 3
  await expect.poll(async () => (await camOf())?.ref?.mm, { timeout: 5000 }).toBe(1000);
  await expect(page.getByTestId('camera-fx')).toHaveCount(0);
  await expect(page.getByTestId('camera-level')).toHaveAttribute('data-level', '3');
  // 완성되면 화면 기준으로 잠깐 안내 (2026-10-20 "원근 완성될때 대부분 외곽에 표시된 완성을 확인하지 못한다. 화면 기준으로 휘발성 안내")
  const done = page.getByTestId('perspective-done');
  await expect(done).toBeVisible();
  await expect(done).toContainText('원근 완성');
  await expect(done).toContainText('테스트 매장_img_1');
  const vb = (await done.boundingBox())!;
  expect(vb.y).toBeLessThan(200); // 화면 위쪽 (사진이 어디 있든)
  expect(await done.evaluate((el) => getComputedStyle(el).pointerEvents)).toBe('none'); // 누르기를 막지 않는다
  await expect(done).toHaveCount(0, { timeout: 6000 }); // 휘발성
  const c1 = (await camOf())!;
  expect(Math.hypot(c1.origin[0] - dBL[0], c1.origin[1] - dBL[1])).toBeLessThan(1);
  expect(c1.auto).toBe(true);
  // 그 원근으로 크기 없는 띠의 가로가 실제(9000mm) 가까이
  const bandW = () => page.evaluate(() => { const a = (window as unknown as { __ganpanda: { objects: { name: string }[]; sizeOf(o: unknown): { w: number } | null } }).__ganpanda; return a.sizeOf(a.objects.find((o) => o.name === '띠')!)?.w ?? 0; });
  expect(Math.abs((await bandW()) - 9000) / 9000).toBeLessThan(0.12);
  // 근사치가 아닌 치수(띠 9000×3000 — 실제 9000×1000)는 반영하지 않고, 경고도 없다 (경고 옵션을 켜도)
  await page.evaluate(() => (window as unknown as { __ganpanda: { setWarnMeasure(v: boolean): void } }).__ganpanda.setWarnMeasure(true));
  await setSize(ids[1], 9000, 3000);
  await page.waitForTimeout(1200);
  expect((await camOf())!.ref!.mm).toBe(1000);
  await expect(page.getByTestId('sign-warning-icon')).toHaveCount(0);
  await expect(page.getByTestId('camera-level')).toHaveAttribute('data-level', '3'); // 문이 이미 확인하고 있어 안 맞는 띠로 갈아엎지 않는다
  // 띠를 맞는 치수로 고치면 기준이 띠로
  await setSize(ids[1], 9000, 1000);
  await expect(page.getByTestId('camera-level')).toHaveAttribute('data-level', '3');
  await expect.poll(async () => (await camOf())?.ref?.mm, { timeout: 5000 }).toBe(9000); // 기준 길이는 마지막으로 맞춘 사인물(띠)로
  // 사람이 원근 창에서 적용하면 자동이 아니게 되고, 그 뒤 치수는 원근을 바꾸지 않는다
  await page.getByTestId('camera-open').click();
  await page.getByTestId('camera-apply').click();
  expect((await camOf())!.auto).toBeUndefined();
  await setSize(ids[0], 1200, 3480);
  await page.waitForTimeout(1200);
  expect((await camOf())!.ref!.mm).toBe(9000);
  // 원근을 지우면 자동도 꺼져 치수가 들어와도 다시 만들지 않는다
  await page.getByTestId('camera-open').click();
  await page.getByTestId('camera-clear').click();
  await expect(page.getByTestId('camera-open')).toHaveAttribute('data-status', 'none');
  await setSize(ids[0], 1000, 2900);
  await page.waitForTimeout(1200);
  expect(await camOf()).toBeNull();
});

test('AI 가 원근 선을 잘못 잡았어도, 실측 치수를 넣은 사인물이 원근을 다시 잡아 완성한다 (2026-10-19 "실재 치수를 넣었는데 원근이 완성되지 않는다")', async ({ page, request }) => {
  type Cam = { x: { a: number[]; b: number[] }[]; ref?: { mm: number }; auto?: boolean };
  const camOf = () => page.evaluate(() => (window as unknown as { __ganpanda: { photos: { camera?: Cam }[] } }).__ganpanda.photos[0].camera ?? null);
  await openOwnedProject(page, request);
  await loadSample(page);
  await expect(page.getByTestId('camera-level')).toHaveAttribute('data-level', '1', { timeout: 15_000 });
  // AI 가 엉뚱한 선(벽과 15° 어긋난 가로 선)을 잡은 상황을 만든다
  const [a0, a1, b0, b1, d0, d1, e0, e1] = await wallToPx(page, [[0, 4700], [9000, 4700], [0, 3700], [9000, 3700], [4000, 2900], [4000, 0], [5000, 2900], [5000, 0]]);
  await page.evaluate((c) => {
    const app = (window as unknown as { __ganpanda: { photos: { id: string }[]; project: { updatePhoto(id: string, p: unknown): void } } }).__ganpanda;
    const tilt = (p: number[], q: number[]) => { const m = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2], r = (15 * Math.PI) / 180; const t = (v: number[]) => [m[0] + (v[0] - m[0]) * Math.cos(r) - (v[1] - m[1]) * Math.sin(r), m[1] + (v[0] - m[0]) * Math.sin(r) + (v[1] - m[1]) * Math.cos(r)]; return { a: t(p), b: t(q) }; };
    app.project.updatePhoto(app.photos[0].id, { camera: { x: [tilt(c.a0, c.a1), tilt(c.b0, c.b1)], y: [{ a: c.d0, b: c.d1 }, { a: c.e0, b: c.e1 }], origin: c.d1, axes: { first: '+x', second: '+z' }, principal: 'center', auto: true } });
  }, { a0, a1, b0, b1, d0, d1, e0, e1 });
  const wrongX = (await camOf())!.x;
  // 문에 맞게 그린 사인물에 실측 1000×2900
  const [dTL, dTR, dBR, dBL] = await wallToPx(page, [[4000, 2900], [5000, 2900], [5000, 0], [4000, 0]]);
  const id = await page.evaluate((q) => { const a = (window as unknown as { __ganpanda: { photos: { id: string }[]; project: { addObject(o: unknown): string } } }).__ganpanda; return a.project.addObject({ photoId: a.photos[0].id, name: '문', shape: 'rect', quad: q, sheetIds: [] }); }, [dTL, dTR, dBR, dBL]);
  await page.evaluate((id) => (window as unknown as { __ganpanda: { project: { updateObject(id: string, p: unknown): void } } }).__ganpanda.project.updateObject(id, { widthMm: 1000, heightMm: 2900 }), id);
  await expect.poll(async () => (await camOf())?.ref?.mm, { timeout: 5000 }).toBe(1000);
  expect((await camOf())!.x).not.toEqual(wrongX); // 틀린 AI 선을 버리고 사인물로
  expect((await camOf())!.auto).toBe(true);
  await expect(page.getByTestId('camera-level')).toHaveAttribute('data-level', '3');
});

test('실측 사인물의 좌우 변이 거의 평행해 화각이 틀려도, 가로세로 비율로 화각을 맞춰 완성된다 (2026-10-20 "실측을 넣었는데 원근완성이 뜨지 않는다" — 실제 프로젝트 외곽선)', async ({ page, request }) => {
  await openOwnedProject(page, request);
  await loadSample(page);
  await expect(page.getByTestId('camera-level')).toHaveAttribute('data-level', '1', { timeout: 15_000 });
  // 실제 사진(3200×2400)의 외곽선을 이 사진 크기로 줄여 쓴다
  const id = await page.evaluate(() => {
    const a = (window as unknown as { __ganpanda: { photos: { id: string; w: number }[]; project: { addObject(o: unknown): string; updatePhoto(id: string, p: unknown): void }; editBoundary(): void } }).__ganpanda;
    const k = a.photos[0].w / 3200;
    const q = [[917, 224], [1615, 469], [1636, 1213], [933, 1179]].map(([x, y]) => [x * k, y * k]);
    // 전 버전이 남긴 상태: 사인물 외곽선으로 잡혔지만 화각이 틀려 2 에 머문 자동 원근
    a.project.updatePhoto(a.photos[0].id, { camera: { x: [{ a: q[0], b: q[1] }, { a: q[3], b: q[2] }], y: [{ a: q[3], b: q[0] }, { a: q[2], b: q[1] }], axes: { first: '+x', second: '+z' }, origin: q[3], ref: { axis: 'x', from: q[3], to: q[2], mm: 600 }, principal: 'center', auto: true } });
    const id = a.project.addObject({ photoId: a.photos[0].id, name: '실측', shape: 'rect', quad: q, sheetIds: [], widthMm: 600, heightMm: 600 });
    a.editBoundary();
    return id;
  });
  await expect(page.getByTestId('camera-level')).toHaveAttribute('data-level', '2');
  // 실측을 다시 넣으면 화각까지 맞춰 완성 + 화면 안내
  await page.evaluate((id) => { const a = (window as unknown as { __ganpanda: { project: { updateObject(id: string, p: unknown): void } } }).__ganpanda; a.project.updateObject(id, { widthMm: 601 }); a.project.updateObject(id, { widthMm: 600 }); }, id);
  await expect(page.getByTestId('camera-level')).toHaveAttribute('data-level', '3', { timeout: 5000 });
  await expect(page.getByTestId('perspective-done')).toBeVisible();
  // 원근 자동 매칭 단추로도 같은 결과
  await page.getByTestId('camera-auto').click();
  await expect(page.getByTestId('camera-level')).toHaveAttribute('data-level', '3');
});
