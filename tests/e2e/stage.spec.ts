import { expect, test } from '@playwright/test';
import { openOwnedProject, uploadPhoto } from './helpers';

/** 합성 건물 사진 + 띠 영역(치수 입력 → 3D 벽면 있음) */
async function setup(page: import('@playwright/test').Page, request: import('@playwright/test').APIRequestContext) {
  await openOwnedProject(page, request);
  const dataUrl = await page.evaluate(async () => { const path = '/src/lib/sim/sample.ts'; const { makeSamplePhoto } = await import(/* @vite-ignore */ path); return makeSamplePhoto().toDataURL('image/png') as string; });
  await page.getByTestId('photo-input').setInputFiles({ name: '매장.png', mimeType: 'image/png', buffer: Buffer.from(dataUrl.split(',')[1], 'base64') });
  await page.getByTestId('photo-zone').waitFor();
  await expect(page.getByTestId('sync-status')).toHaveAttribute('data-status', 'online');
  await page.evaluate(async () => {
    const sp = '/src/lib/sim/sample.ts';
    const { SAMPLE } = await import(/* @vite-ignore */ sp);
    const hp = '/src/lib/core/homography.ts';
    const { applyHomography, solveHomography } = await import(/* @vite-ignore */ hp);
    const H = solveHomography([[0, SAMPLE.wallH], [SAMPLE.wallW, SAMPLE.wallH], [SAMPLE.wallW, 0], [0, 0]], SAMPLE.corners);
    const rect = (x: number, y: number, w: number, h: number) => [[x, y + h], [x + w, y + h], [x + w, y], [x, y]].map((p) => applyHomography(H, p as [number, number]));
    const app = (window as unknown as { __ganpanda: { project: { allPhotos(): { id: string }[]; addObject(o: unknown): string } } }).__ganpanda;
    const photoId = app.project.allPhotos()[0].id;
    app.project.addObject({ photoId, name: '띠', shape: 'rect', quad: rect(0, 3700, 9000, 1000), sheetIds: [], widthMm: 9000, heightMm: 1000, productId: 'board-flex', text: '간판다' });
  });
}

test('3D 단계: 사진 위에 합성 결과가 겹치고 영역 편집은 숨는다, 내용이 바뀌면 다시 그리고, 원본으로 돌아오면 사라진다', async ({ page, request }) => {
  await setup(page, request);
  await page.getByTestId('stage-2d').click(); // 2D 탭 (2026-10-22 작업 탭 실측·2D·3D·디자인·리스트)
  await expect(page.getByTestId('photo-overlay')).toHaveCount(0);
  await expect(page.getByTestId('sign-shape')).toHaveCount(1);
  // 단계 원본 / 2D / 3D (2026-10-17 "2d가 현재 보여주는 형식이고 원본은 실측만"): 기본 2D 에는 바탕이 그려지고, 원본은 외곽선·치수만
  await expect(page.getByTestId('stage-2d')).toHaveClass(/on/);
  await expect(page.getByTestId('sign-fill')).toHaveCount(1);
  expect(await page.getByTestId('sign-fill').evaluate((e) => getComputedStyle(e).backgroundColor)).toBe('rgb(255, 248, 230)'); // 후렉스 기본 바탕
  await page.getByTestId('view-board').click();
  await expect(page.getByTestId('sign-fill')).toHaveCount(0);
  await expect(page.getByTestId('sign-shape')).toHaveCount(1);
  await page.getByTestId('stage-2d').click();
  await expect(page.getByTestId('stage-2d')).toHaveClass(/on/);
  await expect(page.getByTestId('sign-fill')).toHaveCount(1);
  await page.getByTestId('stage-3d').click();
  // 3D 에서는 그리기·존·자동 도구가 흐려지고(비활성), 선택·핀·사진 추가는 그대로 (2026-10-17 "3d에서는 툴바에서 작동하지 않는 기능이 있다")
  for (const t of ['tool-rect', 'tool-zone']) await expect(page.getByTestId(t)).toBeDisabled();
  await expect(page.getByTestId('tool-select')).toBeEnabled();
  const overlay = page.getByTestId('photo-overlay');
  await expect(overlay).toHaveCount(1, { timeout: 30_000 });
  await expect(overlay).toHaveAttribute('src', /^data:image\/png/);
  const first = await overlay.getAttribute('src');
  // 영역은 보이지 않게(투명) 남아 눌러 고를 수 있다 — 라벨은 숨김
  expect(await page.getByTestId('sign-shape').evaluate((e) => getComputedStyle(e).stroke)).toMatch(/rgba\(0, 0, 0, 0\)|transparent/);
  // 사인물 내용이 바뀌면 그 사진만 다시 합성
  await page.evaluate(() => { const app = (window as unknown as { __ganpanda: { objects: { id: string }[]; project: { updateObject(id: string, p: unknown): void } } }).__ganpanda; app.project.updateObject(app.objects[0].id, { text: '카페' }); });
  await expect.poll(() => page.getByTestId('photo-overlay').getAttribute('src'), { timeout: 30_000 }).not.toBe(first);
  // 정면도(구성 요소 글자 위치·크기)가 바뀌어도 다시 합성 (2026-10-17 사용자: "3d가 아직 정면도의 변경을 따르지 않는다")
  const second = await overlay.getAttribute('src');
  await page.evaluate(() => { const app = (window as unknown as { __ganpanda: { objects: { id: string }[]; project: { updateObject(id: string, p: unknown): void } } }).__ganpanda; app.project.updateObject(app.objects[0].id, { parts: [{ id: 'c', kind: 'channel', type: 'ch-front', options: {}, items: [{ id: 't', kind: 'text', text: '카페', x: 0, y: 0, h: 300 }] }] }); });
  await expect.poll(() => page.getByTestId('photo-overlay').getAttribute('src'), { timeout: 30_000 }).not.toBe(second);
  const third = await overlay.getAttribute('src');
  await page.evaluate(() => { const app = (window as unknown as { __ganpanda: { objects: { id: string }[]; project: { updateObject(id: string, p: unknown): void } } }).__ganpanda; app.project.updateObject(app.objects[0].id, { parts: [{ id: 'c', kind: 'channel', type: 'ch-front', options: {}, items: [{ id: 't', kind: 'text', text: '카페', x: -900, y: 0, h: 450 }] }] }); });
  await expect.poll(() => page.getByTestId('photo-overlay').getAttribute('src'), { timeout: 30_000 }).not.toBe(third);
  // 렌더링 버튼은 사진마다 그대로 (디자인 포함 최종 합성 창)
  await expect(page.getByTestId('render-open')).toContainText('렌더링');
  await page.getByTestId('view-board').click();
  await expect(page.getByTestId('photo-overlay')).toHaveCount(0);
  await expect(page.getByTestId('sign-shape')).toHaveCount(1);
  await expect(page.getByTestId('tool-rect')).toBeEnabled();
});

test('[실측] 단추에 가로·세로를 아직 넣지 않은 사인물 수가 보인다 — 다 넣으면 사라진다 (2026-10-21 "실측타이틀에 미실측 수량 넣어줘 가로 세로 미입력수")', async ({ page, request }) => {
  await openOwnedProject(page, request);
  await uploadPhoto(page);
  const ids = await page.evaluate(() => {
    const a = (window as unknown as { __ganpanda: { photos: { id: string }[]; project: { addObject(o: unknown): string; linkObject(id: string, to: string): void } } }).__ganpanda;
    const pid = a.photos[0].id;
    a.project.addObject({ photoId: pid, name: '측정됨', shape: 'rect', quad: [[100, 100], [400, 100], [400, 300], [100, 300]], sheetIds: [], widthMm: 3000, heightMm: 600 });
    const h = a.project.addObject({ photoId: pid, name: '가로만', shape: 'rect', quad: [[500, 100], [800, 100], [800, 300], [500, 300]], sheetIds: [], widthMm: 1000 });
    const n = a.project.addObject({ photoId: pid, name: '없음', shape: 'rect', quad: [[900, 100], [1200, 100], [1200, 300], [900, 300]], sheetIds: [] });
    const c = a.project.addObject({ photoId: pid, name: '연결본', shape: 'rect', quad: [[100, 400], [400, 400], [400, 600], [100, 600]], sheetIds: [] });
    a.project.linkObject(c, n); // 연결된 영역은 같은 사인물 — 따로 세지 않는다
    return { h, n };
  });
  const badge = page.getByTestId('unmeasured-count');
  await expect(badge).toHaveText('2');
  await expect(page.getByTestId('view-board')).toHaveAttribute('title', /미실측 2/); // 실측 = 사진보드 탭 (2026-10-22)
  await page.evaluate(({ h }) => (window as unknown as { __ganpanda: { project: { updateObject(id: string, p: unknown): void } } }).__ganpanda.project.updateObject(h, { heightMm: 200 }), ids);
  await expect(badge).toHaveText('1');
  await page.evaluate(({ n }) => (window as unknown as { __ganpanda: { project: { updateObject(id: string, p: unknown): void } } }).__ganpanda.project.updateObject(n, { widthMm: 500, heightMm: 500 }), ids);
  await expect(badge).toHaveCount(0);
});

// 2026-10-27 사용자: "3d 랜더링보다 실시간이 더 빠르지 않나?" → "확대할때 이상해 화면에서 가운데 있는 사진의 3d만 실시간"
test('3D 단계: 화면 가운데 사진은 실시간 3D — 보이는 부분만 화면 해상도로, 확대해도 그림이 화면보다 커지지 않는다', async ({ page, request }) => {
  await setup(page, request);
  await page.getByTestId('stage-3d').click();
  const live = page.getByTestId('live-3d');
  await expect(live).toHaveAttribute('data-shown', 'true', { timeout: 30_000 });
  const photoId = await page.evaluate(() => (window as unknown as { __ganpanda: { photos: { id: string }[] } }).__ganpanda.photos[0].id);
  await expect(live).toHaveAttribute('data-photo', photoId);
  const canvasSize = () => live.locator('canvas').evaluate((c: HTMLCanvasElement) => ({ w: c.width, h: c.height, cw: c.clientWidth }));
  const board = (await page.getByTestId('board-canvas').boundingBox())!;
  const dpr = await page.evaluate(() => Math.min(devicePixelRatio, 2));
  // 화면에 보이는 사진 크기와 같은 화면 픽셀
  const img = (await page.getByTestId('photo-img').boundingBox())!;
  const lb = (await live.boundingBox())!;
  expect(Math.abs(lb.width - Math.min(img.width, board.width))).toBeLessThan(3);
  // 크게 확대 → 보이는 조각만, 그림은 화면 크기를 넘지 않는다
  await page.mouse.move(img.x + img.width / 2, img.y + img.height * 0.6);
  for (let i = 0; i < 6; i++) { await page.keyboard.down('Control'); await page.mouse.wheel(0, -400); await page.keyboard.up('Control'); }
  await expect(live).toHaveAttribute('data-shown', 'true');
  await page.waitForTimeout(300);
  const c = await canvasSize();
  expect(c.w).toBeLessThanOrEqual(Math.ceil(board.width * dpr) + 2);
  expect(c.h).toBeLessThanOrEqual(Math.ceil(board.height * dpr) + 2);
  const z = (await live.boundingBox())!;
  expect(z.width).toBeLessThanOrEqual(board.width + 2);
  // 내용을 바꾸면 그 사진의 실시간 장면을 바로 다시 짓는다 (그림 만들기 차례를 기다리지 않음)
  const before = Number(await live.getAttribute('data-builds'));
  await page.evaluate(() => { const a = (window as unknown as { __ganpanda: { objects: { id: string }[]; project: { updateObject(id: string, p: unknown): void } } }).__ganpanda; a.project.updateObject(a.objects[0].id, { text: '간판다 카페' }); });
  await expect.poll(async () => Number(await live.getAttribute('data-builds')), { timeout: 5000 }).toBeGreaterThan(before);
  await expect(live).toHaveAttribute('data-shown', 'true');
  // 원본으로 돌아가면 사라진다
  await page.getByTestId('stage-2d').click();
  await expect(live).toHaveCount(0);
});

// 2026-10-28 사용자: "아이폰에서 사진 이동하면 처음 로딩처럼 빈화면 스피너 돌다가 다시 정상된다" — 휴대폰 메모리 초과로 페이지가 다시 열렸다
test.describe('휴대폰 3D 메모리', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  test('휴대폰 실시간 3D 는 가볍게(MSAA 없음 · 배율 1.5 · 배경은 줄인 사본), 합성 그림 3D 화면은 다 만들면 놓는다, 3D 화면을 잃으면 합성 그림으로', async ({ page, request }) => {
    await setup(page, request);
    await page.getByTestId('stage-3d').tap();
    const live = page.getByTestId('live-3d');
    await expect(live).toHaveAttribute('data-shown', 'true', { timeout: 30_000 });
    await expect(live).toHaveAttribute('data-light', 'true');
    const dpr = await page.evaluate(() => devicePixelRatio);
    const c = await live.locator('canvas').evaluate((el: HTMLCanvasElement) => ({ w: el.width, cw: el.clientWidth }));
    expect(c.w).toBeLessThanOrEqual(Math.ceil(c.cw * Math.min(dpr, 1.5)) + 1);
    // 합성 그림용 3D 화면(숨은 곳)은 놓았다 — 화면 안 WebGL 캔버스는 실시간 하나뿐
    await expect.poll(() => page.evaluate(() => document.querySelectorAll('canvas').length)).toBe(1);
    // 3D 화면을 잃으면 실시간을 접고 합성 그림이 보인다
    await live.locator('canvas').evaluate((el: HTMLCanvasElement) => (el.getContext('webgl2') as WebGL2RenderingContext).getExtension('WEBGL_lose_context')!.loseContext());
    await expect(live).toHaveAttribute('data-lost', 'true');
    await expect(live).toHaveAttribute('data-shown', 'false');
    await expect(page.getByTestId('photo-overlay')).toHaveCount(1);
  });
});

