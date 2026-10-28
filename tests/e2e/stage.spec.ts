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
  await expect(overlay).toHaveAttribute('src', /^(blob:|data:image)/); // 기기에 저장된 3D 그림 (2026-10-29)
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
  // 2026-10-28 "3d에서 사진이 새로 3d랜더링이 되려는 시점에 리프레시된다" — 휴대폰은 3D 화면(WebGL)을 하나만: 합성 그림을 따로 만들지 않고 가운데 사진만 실시간
  test('휴대폰은 3D 화면 하나만 — 실시간(가볍게)만, 합성 그림은 실시간 화면에서 떠서, 3D 화면을 잃으면 사진·저장된 그림 그대로', async ({ page, request }) => {
    await setup(page, request);
    let maxCanvases = 0;
    await page.exposeFunction('__countCanvas', (n: number) => { maxCanvases = Math.max(maxCanvases, n); });
    await page.evaluate(() => { const w = window as unknown as { __countCanvas(n: number): void }; setInterval(() => w.__countCanvas(document.querySelectorAll('canvas').length), 50); });
    await page.getByTestId('stage-3d').tap();
    const live = page.getByTestId('live-3d');
    await expect(live).toHaveAttribute('data-shown', 'true', { timeout: 30_000 });
    await expect(live).toHaveAttribute('data-light', 'true');
    const dpr = await page.evaluate(() => devicePixelRatio);
    const c = await live.locator('canvas').evaluate((el: HTMLCanvasElement) => ({ w: el.width }));
    const bw = (await page.getByTestId('board-canvas').boundingBox())!.width;
    expect(c.w).toBeLessThanOrEqual(Math.ceil(bw * Math.min(dpr, 1.5)) + 1); // 그림판 = 보드 화면 크기 × 배율 1.5 까지
    await page.waitForTimeout(1500);
    expect(maxCanvases).toBe(1); // 실시간 하나뿐 — 합성 그림용 3D 화면을 만들었다 버리지 않는다
    await expect(page.getByTestId('photo-overlay')).toHaveCount(1, { timeout: 10_000 }); // 저장된 그림은 실시간 화면에서 떠서 (2026-10-29)
    expect(maxCanvases).toBe(1);
    // 3D 화면을 잃으면 실시간을 접고 사진 그대로
    await live.locator('canvas').evaluate((el: HTMLCanvasElement) => (el.getContext('webgl2') as WebGL2RenderingContext).getExtension('WEBGL_lose_context')!.loseContext());
    await expect(live).toHaveAttribute('data-lost', 'true');
    await expect(live).toHaveAttribute('data-shown', 'false');
    await expect(page.getByTestId('photo-img')).toBeVisible();
  });
});

// 2026-10-28 사용자: "핀볼 … 화면 이동하면서 3d랜더링 에러 확인해줘 옆에 사진 간판도 난립하고 있어" — 이동 중 가운데 사진이 바뀌면
// 앞 사진의 장면 짓기가 끝나기 전에 다음 사진을 같은 3D 화면에 짓기 시작해 사진·사인물이 섞였다
test('3D 단계: 화면을 이리저리 옮겨 가운데 사진이 빠르게 바뀌어도 실시간 장면은 지금 사진의 사진·사인물만', async ({ page, request }) => {
  await setup(page, request);
  // 두 번째 사진(같은 건물 사진) + 사인물 2개
  await page.evaluate(async () => {
    const app = (window as unknown as { __ganpanda: { project: { allPhotos(): { id: string; assetId: string; w: number; h: number; name: string; x: number; y: number; width: number }[]; addPhoto(p: unknown): string; addObject(o: unknown): string; objects(): { photoId: string; quad: unknown; widthMm: number; heightMm: number }[] } } }).__ganpanda;
    const a = app.project.allPhotos()[0];
    const id = app.project.addPhoto({ ...a, id: undefined, name: '둘째', x: a.x + a.width + 200 });
    const o = (window as unknown as { __ganpanda: { objects: { photoId: string; quad: unknown; widthMm: number; heightMm: number }[] } }).__ganpanda.objects[0];
    for (const t of ['둘째 간판 1', '둘째 간판 2']) app.project.addObject({ ...o, id: undefined, photoId: id, text: t, name: t });
  });
  await page.getByTestId('zoom-fit').click();
  await page.getByTestId('stage-3d').click();
  const live = page.getByTestId('live-3d');
  await expect(live).toHaveAttribute('data-shown', 'true', { timeout: 30_000 });
  const zones = page.getByTestId('photo-zone');
  await expect(zones).toHaveCount(2);
  // 두 사진을 번갈아 화면 가운데로 — 기다리지 않고 여러 번 (CPU 를 느리게 해 장면 짓기가 겹치게)
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 6 });
  const c = (await page.getByTestId('board-canvas').boundingBox())!;
  for (let k = 0; k < 6; k++) {
    const z = (await zones.nth(k % 2).boundingBox())!;
    const dx = c.x + c.width / 2 - (z.x + z.width / 2);
    await page.mouse.move(c.x + c.width / 2, c.y + 40); await page.mouse.down(); await page.mouse.move(c.x + c.width / 2 + dx, c.y + 40, { steps: 2 }); await page.mouse.up();
    await page.waitForTimeout(60);
  }
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  await expect(live).toHaveAttribute('data-shown', 'true', { timeout: 20_000 });
  await page.waitForTimeout(1500);
  const photo = await live.getAttribute('data-photo');
  await expect(live).toHaveAttribute('data-scene-photo', photo!);
  const want = await page.evaluate((pid) => (window as unknown as { __ganpanda: { objects: { photoId: string }[] } }).__ganpanda.objects.filter((o) => o.photoId === pid).length, photo);
  await expect(live).toHaveAttribute('data-scene-signs', String(want));
});

// 2026-10-28 사용자: "3d가 실시간으로 랜더링 보이느게 어려운건가?" → "진행해봐"
test('3D 단계 실시간: 화면을 끄는 동안에도 3D 가 계속 보이고, 확대해도 그림판을 다시 만들지 않으며, 다시 가운데로 온 사진은 장면을 다시 짓지 않는다', async ({ page, request }) => {
  await setup(page, request);
  await page.evaluate(() => {
    const app = (window as unknown as { __ganpanda: { project: { allPhotos(): { id: string; x: number; width: number }[]; addPhoto(p: unknown): string; addObject(o: unknown): string }; objects: unknown[] } }).__ganpanda;
    const a = app.project.allPhotos()[0];
    const id = app.project.addPhoto({ ...a, id: undefined, name: '둘째', x: a.x + a.width + 200 });
    app.project.addObject({ ...(app.objects[0] as object), id: undefined, photoId: id, text: '둘째', name: '둘째' });
  });
  await page.getByTestId('zoom-fit').click();
  await page.getByTestId('stage-3d').click();
  const live = page.getByTestId('live-3d');
  await expect(live).toHaveAttribute('data-shown', 'true', { timeout: 30_000 });
  const zones = page.getByTestId('photo-zone');
  // 첫 사진을 가운데로 크게
  const z0 = (await zones.nth(0).boundingBox())!;
  await page.mouse.move(z0.x + z0.width / 2, z0.y + z0.height / 2);
  for (let i = 0; i < 2; i++) { await page.keyboard.down('Control'); await page.mouse.wheel(0, -300); await page.keyboard.up('Control'); }
  await expect(live).toHaveAttribute('data-shown', 'true', { timeout: 15_000 });
  const first = await live.getAttribute('data-photo');
  const size = () => live.locator('canvas').evaluate((el: HTMLCanvasElement) => `${el.width}x${el.height}`);
  const sz0 = await size();
  // 끄는 중(손을 떼지 않은 채)에도 보인다
  const c = (await page.getByTestId('board-canvas').boundingBox())!;
  await page.mouse.move(c.x + c.width / 2, c.y + c.height / 2); await page.mouse.down();
  await page.mouse.move(c.x + c.width / 2 - 40, c.y + c.height / 2, { steps: 4 });
  await expect(live).toHaveAttribute('data-shown', 'true');
  await page.mouse.move(c.x + c.width / 2 - 80, c.y + c.height / 2, { steps: 4 });
  await expect(live).toHaveAttribute('data-shown', 'true');
  await page.mouse.up();
  // 확대해도 그림판 크기는 그대로 (다시 만들지 않는다)
  await page.keyboard.down('Control'); await page.mouse.wheel(0, -300); await page.keyboard.up('Control');
  await page.waitForTimeout(300);
  expect(await size()).toBe(sz0);
  // 둘째 사진을 가운데로 → 새로 짓고, 다시 첫 사진으로 → 기억한 장면 (짓기 수 그대로)
  await page.getByTestId('zoom-fit').click();
  const center = async (n: number) => {
    const z = (await zones.nth(n).boundingBox())!;
    await page.mouse.move(c.x + c.width / 2, c.y + 30); await page.mouse.down();
    await page.mouse.move(c.x + c.width / 2 + (c.x + c.width / 2 - (z.x + z.width / 2)), c.y + 30, { steps: 5 }); await page.mouse.up();
  };
  await center(1);
  await expect.poll(async () => (await live.getAttribute('data-photo')) !== first && (await live.getAttribute('data-shown')) === 'true', { timeout: 15_000 }).toBe(true);
  const builds = Number(await live.getAttribute('data-builds'));
  await center(0);
  await expect(live).toHaveAttribute('data-photo', first!);
  await expect(live).toHaveAttribute('data-shown', 'true');
  expect(Number(await live.getAttribute('data-builds'))).toBe(builds);
  await expect(live).toHaveAttribute('data-scene-photo', first!);
});

