import { expect, test } from '@playwright/test';
import { apiCreateInvite, makePhoto, openInvited, openOwnedProject } from './helpers';

/** 합성 건물 사진 + 파사드 띠 영역(9000×1000, 전광 채널 "간판다") */
async function setup(page: import('@playwright/test').Page, request: import('@playwright/test').APIRequestContext) {
  const r = await openOwnedProject(page, request);
  const dataUrl = await page.evaluate(async () => {
    const path = '/src/lib/sim/sample.ts';
    const { makeSamplePhoto } = await import(/* @vite-ignore */ path);
    return makeSamplePhoto().toDataURL('image/png') as string;
  });
  await page.getByTestId('photo-input').setInputFiles({ name: '매장.png', mimeType: 'image/png', buffer: Buffer.from(dataUrl.split(',')[1], 'base64') });
  await page.getByTestId('photo-zone').waitFor();
  await expect(page.getByTestId('sync-status')).toHaveAttribute('data-status', 'online');
  const center = await page.evaluate(async () => {
    const path = '/src/lib/sim/sample.ts';
    const { SAMPLE } = await import(/* @vite-ignore */ path);
    const hp = '/src/lib/core/homography.ts';
    const { applyHomography, solveHomography } = await import(/* @vite-ignore */ hp);
    const H = solveHomography([[0, SAMPLE.wallH], [SAMPLE.wallW, SAMPLE.wallH], [SAMPLE.wallW, 0], [0, 0]], SAMPLE.corners);
    const rect = (x: number, y: number, w: number, h: number) => [[x, y + h], [x + w, y + h], [x + w, y], [x, y]].map((p) => applyHomography(H, p as [number, number]));
    const app = (window as unknown as { __ganpanda: { project: { allPhotos(): { id: string }[]; addObject(o: unknown): string } } }).__ganpanda;
    const photoId = app.project.allPhotos()[0].id;
    app.project.addObject({ photoId, name: '띠', shape: 'rect', quad: rect(0, 3700, 9000, 1000), sheetIds: [], widthMm: 9000, heightMm: 1000, productId: 'ch-front', text: '간판다' });
    return applyHomography(H, [4500, 4200]) as [number, number];
  });
  return { ...r, center };
}

/** 저장된 PNG(데이터 URL)에서 사진 px 좌표 주변의 픽셀을 읽는다 */
async function samplePixels(page: import('@playwright/test').Page, dataUrl: string, at: [number, number], radius: number) {
  return page.evaluate(async ({ dataUrl, at, radius }) => {
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = dataUrl; });
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const g = c.getContext('2d')!; g.drawImage(img, 0, 0);
    const k = img.width / 1600; // 사진 원본 1600px 기준
    const d = g.getImageData(Math.round(at[0] * k - radius), Math.round(at[1] * k - radius), radius * 2, radius * 2).data;
    const out: [number, number, number][] = [];
    for (let i = 0; i < d.length; i += 4) out.push([d[i], d[i + 1], d[i + 2]]);
    return { size: [img.width, img.height], px: out };
  }, { dataUrl, at, radius });
}

test('실사 보기: 사진 속 제자리에 입체 글자를 합성하고, 야간에는 발광하며, PNG 로 저장한다', async ({ page, request }) => {
  const { center } = await setup(page, request);
  await expect(page.getByTestId('render-open')).toHaveAttribute('data-status', 'ok');
  await page.getByTestId('render-open').click();
  const dlg = page.getByTestId('render-dialog');
  await expect(dlg).toBeVisible();
  await expect(dlg.getByTestId('render-count')).toContainText('1', { timeout: 20_000 });
  await expect(dlg.getByTestId('render-canvas')).toBeVisible();

  // 주간: 띠 중심 주변에 LED 면 색(빨강 계열)의 글자가 있다
  const hook = () => (window as unknown as { __ganpanda: { lastRender: string } }).__ganpanda.lastRender;
  await dlg.getByTestId('render-save').click();
  await expect.poll(() => page.evaluate(hook)).toMatch(/^data:image\/png/);
  const dayUrl = await page.evaluate(hook);
  const day = await samplePixels(page, dayUrl, center, 40);
  expect(day.size[0]).toBe(1600); // 원본 해상도
  expect(day.px.some(([r, g, b]) => r > 150 && r > g + 60 && r > b + 60)).toBe(true);

  // 야간: 하늘이 어두워진다
  const lum = (px: [number, number, number][]) => px.reduce((s, [r, g, b]) => s + r + g + b, 0) / px.length / 3;
  await dlg.getByTestId('render-night').click();
  await dlg.getByTestId('render-save').click();
  await expect.poll(() => page.evaluate(hook)).not.toBe(dayUrl);
  const nightSky = await samplePixels(page, await page.evaluate(hook), [800, 60], 4);
  const daySky = await samplePixels(page, dayUrl, [800, 60], 4);
  expect(lum(nightSky.px)).toBeLessThan(lum(daySky.px) * 0.5);
  await dlg.getByTestId('close-render').click();
  await expect(dlg).toHaveCount(0);
});

test('폰트에 없는 글자(이모지)만 있는 채널 사인물이 있어도 다른 사인물은 그려지고, 그것은 상자로 대신한다', async ({ page, request }) => {
  await setup(page, request);
  await page.evaluate(async () => {
    const path = '/src/lib/sim/sample.ts';
    const { SAMPLE } = await import(/* @vite-ignore */ path);
    const hp = '/src/lib/core/homography.ts';
    const { applyHomography, solveHomography } = await import(/* @vite-ignore */ hp);
    const H = solveHomography([[0, SAMPLE.wallH], [SAMPLE.wallW, SAMPLE.wallH], [SAMPLE.wallW, 0], [0, 0]], SAMPLE.corners);
    const rect = (x: number, y: number, w: number, h: number) => [[x, y + h], [x + w, y + h], [x + w, y], [x, y]].map((p) => applyHomography(H, p as [number, number]));
    const app = (window as unknown as { __ganpanda: { project: { allPhotos(): { id: string }[]; addObject(o: unknown): string } } }).__ganpanda;
    const photoId = app.project.allPhotos()[0].id;
    // 먼저 만든 것: 이모지 문구 (글자 윤곽 없음) — 뒤에 만든 것: 보통 문구
    app.project.addObject({ photoId, name: '이모지', shape: 'rect', quad: rect(600, 4950, 1500, 850), sheetIds: [], productId: 'ch-front', text: '🙂' });
    app.project.addObject({ photoId, name: '뒤에 만든 것', shape: 'rect', quad: rect(2700, 4950, 1500, 850), sheetIds: [], productId: 'ch-halo', text: '카페' });
  });
  await page.getByTestId('render-open').click();
  await expect(page.getByTestId('render-count')).toContainText('3', { timeout: 20_000 });
  await expect(page.getByTestId('render-status')).toContainText('이모지');
  await expect(page.getByTestId('render-status')).toContainText('상자');
  await page.getByTestId('close-render').click();
});

test('두 번째 사진의 분류 없는 사인물도 3D 에 회색 판으로 나온다', async ({ page, request }) => {
  await setup(page, request);
  const flat = await makePhoto(page);
  await page.getByTestId('photo-input').setInputFiles({ name: '측면.png', mimeType: 'image/png', buffer: flat });
  await expect(page.getByTestId('photo-zone')).toHaveCount(2);
  await page.evaluate(() => {
    const app = (window as unknown as { __ganpanda: { project: { allPhotos(): { id: string }[]; addObject(o: unknown): string } } }).__ganpanda;
    const side = app.project.allPhotos()[1].id;
    // 분류·문구 없이 치수만 (3D 벽면은 이 사인물로 잡힘)
    app.project.addObject({ photoId: side, name: '옆 간판', shape: 'rect', quad: [[300, 650], [1100, 650], [1100, 850], [300, 850]], sheetIds: [], widthMm: 4000, heightMm: 1000 });
  });
  await expect(page.getByTestId('render-open').nth(1)).toHaveAttribute('data-status', 'ok');
  await page.getByTestId('render-open').nth(1).click();
  await expect(page.getByTestId('render-count')).toContainText('1', { timeout: 20_000 });
  await expect(page.getByTestId('render-status')).toHaveCount(0);
  await page.getByTestId('close-render').click();
});

test('치수를 입력한 사인물이 없으면 안내하고, 고객(viewer)도 실사 보기를 열 수 있다', async ({ page, request, browser }) => {
  const { session, projectId } = await setup(page, request);
  const guest = await openInvited(browser, await apiCreateInvite(request, session, projectId, 'viewer'));
  await guest.getByTestId('render-open').click();
  await expect(guest.getByTestId('render-dialog')).toBeVisible();
  await expect(guest.getByTestId('render-count')).toContainText('1', { timeout: 20_000 });
  await guest.ctx.close();

  // 치수를 지워도 그린 영역만으로 3D 가 된다 (자리·비율). 사인물을 지우면 그제야 안내
  await page.evaluate(() => {
    const app = (window as unknown as { __ganpanda: { project: { allObjects(): { id: string }[]; updateObject(id: string, p: unknown): void } } }).__ganpanda;
    for (const o of app.project.allObjects()) app.project.updateObject(o.id, { widthMm: undefined, heightMm: undefined });
  });
  await expect(page.getByTestId('render-open')).toHaveAttribute('data-status', 'ok');
  await page.getByTestId('render-open').click();
  await expect(page.getByTestId('render-dialog')).toContainText('그린 영역');
  await expect(page.getByTestId('render-count')).toContainText('1', { timeout: 20_000 });
  await page.getByTestId('close-render').click();
  await page.evaluate(() => {
    const app = (window as unknown as { __ganpanda: { project: { allObjects(): { id: string }[]; removeObject(id: string): void } } }).__ganpanda;
    for (const o of app.project.allObjects()) app.project.removeObject(o.id);
  });
  await expect(page.getByTestId('render-open')).toHaveAttribute('data-status', 'none');
  await page.getByTestId('render-open').click();
  await expect(page.getByTestId('render-status')).toContainText('영역');
  await expect(page.getByTestId('render-open-camera')).toBeVisible();
});
