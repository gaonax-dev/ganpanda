// 3D 단계 LOD (2026-10-29 사용자: "사인물을 변경한 경우가 아니라면 기존의 저장된 이미지를 사용한다 … 기존이미지와 3d이미지로 변환을 LOD를 접목해
// 사용자가 눈치채지 못하게 … 시트처럼 2d인 경우는 3d로 변환할 이유가 없다 … 2d도 이동하거나 변경하면 사라졌다 다시 나타난다")
import { expect, test, type Page } from '@playwright/test';
import { openOwnedProject } from './helpers';

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


const made = (page: Page) => page.evaluate(() => (window as unknown as { __ganpanda: { stageMade: number } }).__ganpanda.stageMade);
const reopen = async (page: Page) => { await page.reload(); await page.getByTestId('photo-zone').first().waitFor(); };

test('저장된 3D 그림: 한 번 만든 그림은 기기에 두고, 다시 열면 만들지 않고 바로 쓴다 (사인물을 바꾸면 그 사진만 다시)', async ({ page, request }) => {
  await setup(page, request);
  await page.getByTestId('stage-3d').click();
  await expect(page.getByTestId('photo-overlay')).toHaveCount(1, { timeout: 30_000 });
  expect(await made(page)).toBeGreaterThanOrEqual(1);
  await reopen(page);
  await page.getByTestId('stage-3d').click();
  await expect(page.getByTestId('photo-overlay')).toHaveCount(1, { timeout: 10_000 });
  await page.waitForTimeout(1000);
  expect(await made(page)).toBe(0);
  // 바꾸면 다시
  await page.evaluate(() => { const a = (window as unknown as { __ganpanda: { objects: { id: string }[]; project: { updateObject(id: string, p: unknown): void } } }).__ganpanda; a.project.updateObject(a.objects[0].id, { text: '바뀐 간판' }); });
  await expect.poll(() => made(page), { timeout: 20_000 }).toBe(1);
});

test('3D 실시간은 저장된 그림 위로 부드럽게 겹쳐 나타난다 (투명도 전환)', async ({ page, request }) => {
  await setup(page, request);
  await page.getByTestId('stage-3d').click();
  const live = page.getByTestId('live-3d');
  await expect(live).toHaveAttribute('data-shown', 'true', { timeout: 30_000 });
  expect(await live.evaluate((e) => getComputedStyle(e).transitionProperty)).toContain('opacity');
  await expect.poll(() => live.evaluate((e) => getComputedStyle(e).opacity)).toBe('1');
});

test('시트만 있는 사진은 3D 로 바꾸지 않는다 — 합성 그림·실시간 없이 2D 그림 그대로', async ({ page, request }) => {
  await setup(page, request);
  await page.evaluate(() => { const a = (window as unknown as { __ganpanda: { objects: { id: string }[]; project: { updateObject(id: string, p: unknown): void } } }).__ganpanda; a.project.updateObject(a.objects[0].id, { productId: undefined, sheetIds: ['sh-cut'], parts: undefined }); });
  await page.getByTestId('stage-3d').click();
  await page.waitForTimeout(3000);
  await expect(page.getByTestId('photo-overlay')).toHaveCount(0);
  await expect(page.getByTestId('live-3d')).toHaveAttribute('data-photo', '');
  await expect(page.getByTestId('photo-zone').locator('.designs:not(.frosts)')).toHaveCount(1); // 2D 그림 층
  expect(await made(page)).toBe(0);
});

test.describe('휴대폰', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  test('휴대폰도 가운데 사진의 3D 를 그림으로 저장해 두고(실시간 화면에서 떠서), 다시 열면 바로 그 그림', async ({ page, request }) => {
    await setup(page, request);
    await page.getByTestId('stage-3d').tap();
    await expect(page.getByTestId('live-3d')).toHaveAttribute('data-shown', 'true', { timeout: 30_000 });
    await expect(page.getByTestId('photo-overlay')).toHaveCount(1, { timeout: 15_000 }); // 실시간 화면에서 뜬 그림
    expect(await page.evaluate(() => document.querySelectorAll('canvas').length)).toBe(1);
    await reopen(page);
    await page.getByTestId('stage-3d').tap();
    await expect(page.getByTestId('photo-overlay')).toHaveCount(1, { timeout: 10_000 });
    expect(await made(page)).toBe(0);
  });
  test('2D: 두 손가락으로 움직이는 동안에도 원근으로 겹친 그림(글자·디자인)이 사라지지 않는다', async ({ page, request }) => {
    await setup(page, request);
    // 인쇄 글자 하나 (원근으로 겹친 그림 층이 생기게)
    await page.evaluate(async () => {
      const path = '/src/lib/core/parts.ts';
      const { addPrintItem } = await import(/* @vite-ignore */ path);
      const a = (window as unknown as { __ganpanda: { objects: { id: string }[]; project: { updateObject(id: string, p: unknown): void } } }).__ganpanda;
      a.project.updateObject(a.objects[0].id, addPrintItem(a.objects[0], 'text').patch);
    });
    await page.getByTestId('stage-2d').tap();
    const warp = page.locator('.warp, [data-testid="flat-overlay"]').first(); // 작게 보이면 납작한 그림 한 장 (줌아웃 LOD)
    await expect(warp).toBeVisible({ timeout: 15_000 });
    await page.evaluate(() => document.querySelector('.ic')!.classList.add('pinching'));
    await expect(warp).toBeVisible();
  });
});

// 2026-10-29 사용자: "아이폰앱에서 2d에서 줌인 줌아웃을 하면 에러가 발생한다" — 원근 DOM 층이 확대 배율만큼 큰 그림으로 다시 그려졌다
test('2D 원근 글자·그림 층은 구운 그림 한 장으로 — 내용을 바꾸는 동안에도 사라지지 않고 새 그림으로 바뀐다', async ({ page, request }) => {
  await setup(page, request);
  await page.evaluate(async () => {
    const path = '/src/lib/core/parts.ts';
    const { addPrintItem } = await import(/* @vite-ignore */ path);
    const a = (window as unknown as { __ganpanda: { objects: { id: string }[]; project: { updateObject(id: string, p: unknown): void } } }).__ganpanda;
    a.project.updateObject(a.objects[0].id, addPrintItem(a.objects[0], 'text').patch);
  });
  await page.getByTestId('stage-2d').click();
  // 크게 확대해야 사인물별 원근 층 (작으면 납작한 그림 한 장 — 아래 줌아웃 LOD)
  const bb = (await page.getByTestId('board-canvas').boundingBox())!;
  await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2);
  for (let i = 0; i < 4; i++) { await page.keyboard.down('Control'); await page.mouse.wheel(0, -400); await page.keyboard.up('Control'); await page.waitForTimeout(200); }
  const baked = page.getByTestId('baked-parts');
  await expect(baked).toHaveCount(1, { timeout: 15_000 });
  await expect(page.getByTestId('photo-zone').getByTestId('parts-overlay')).toHaveCount(0); // DOM 층 없음
  expect(await baked.evaluate((e) => getComputedStyle(e).transform)).toMatch(/matrix3d/);
  expect(await baked.evaluate((e) => (e as HTMLImageElement).naturalWidth)).toBeLessThanOrEqual(1024);
  const src0 = await baked.getAttribute('src');
  // 글자를 바꾸면: 그 사이 내내 그림이 있고, 새로 구운 그림으로
  let gaps = 0;
  const watch = setInterval(() => void page.evaluate(() => document.querySelectorAll('[data-testid="baked-parts"], [data-testid="parts-overlay"]').length).then((n) => { if (!n) gaps++; }).catch(() => undefined), 20);
  await page.evaluate(() => {
    const a = (window as unknown as { __ganpanda: { objects: { id: string; parts?: { items: { kind: string; text?: string }[] }[] }[]; project: { updateObject(id: string, p: unknown): void } } }).__ganpanda;
    const o = a.objects[0];
    const parts = JSON.parse(JSON.stringify(o.parts));
    for (const p of parts) for (const it of p.items) if (it.kind === 'text') it.text = '바뀐 글자';
    a.project.updateObject(o.id, { parts });
  });
  await expect.poll(() => baked.getAttribute('src'), { timeout: 10_000 }).not.toBe(src0);
  clearInterval(watch);
  expect(gaps).toBe(0);
});


// 2026-10-29 사용자: "아이폰 앱과 크롬에서 둘다 2d에서 줌 아웃에 앱은 다시 열고 크롬은 죽었다" — 줌아웃하면 모든 사인물의 원근 층(3D 변환)이 한꺼번에 화면에 들어와
// 층마다 메모리를 잡았다. 사진이 화면에서 작으면(그림 해상도로 충분하면) 사진마다 납작한 그림 한 장(3D 변환 없음), 크게 보이면 사인물별 원근 층
test('줌아웃 LOD: 작게 보이는 사진은 원근 층 없이 납작한 그림 한 장, 확대하면 원근 층', async ({ page, request }) => {
  await setup(page, request);
  await page.evaluate(async () => {
    const path = '/src/lib/core/parts.ts';
    const { addPrintItem } = await import(/* @vite-ignore */ path);
    const a = (window as unknown as { __ganpanda: { objects: { id: string }[]; project: { updateObject(id: string, p: unknown): void } } }).__ganpanda;
    const { patch } = addPrintItem(a.objects[0], 'text');
    for (const p of patch.parts ?? []) for (const it of p.items) if (it.kind === 'text') it.text = '간판다';
    a.project.updateObject(a.objects[0].id, patch);
  });
  await page.getByTestId('stage-2d').click();
  const zone = page.getByTestId('photo-zone');
  const box = (await page.getByTestId('board-canvas').boundingBox())!;
  const wheel = async (dy: number) => { await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.keyboard.down('Control'); await page.mouse.wheel(0, dy); await page.keyboard.up('Control'); await page.waitForTimeout(300); };
  const threeD = () => zone.evaluate((z) => [...z.querySelectorAll('*')].filter((e) => /matrix3d/.test(getComputedStyle(e).transform)).length);
  // 줌아웃: 납작한 그림, 3D 변환 층 0
  for (let i = 0; i < 6; i++) await wheel(400);
  const flat = zone.getByTestId('flat-overlay');
  await expect(flat).toHaveCount(1, { timeout: 15_000 });
  await expect(flat).toHaveAttribute('alt', /간판|글자|[가-힣]/);
  expect(await threeD()).toBe(0);
  expect(await flat.evaluate((e) => getComputedStyle(e).transform)).toBe('none');
  expect(await flat.evaluate((e) => Math.max((e as HTMLImageElement).naturalWidth, (e as HTMLImageElement).naturalHeight))).toBeLessThanOrEqual(1024);
  // 그린 자리에 무언가 있다 (투명 그림이 아니다)
  expect(await flat.evaluate(async (e) => { const i = e as HTMLImageElement; await i.decode(); const c = document.createElement('canvas'); c.width = i.naturalWidth; c.height = i.naturalHeight; const g = c.getContext('2d')!; g.drawImage(i, 0, 0); const d = g.getImageData(0, 0, c.width, c.height).data; let n = 0; for (let k = 3; k < d.length; k += 4) if (d[k] > 0) n++; return n; })).toBeGreaterThan(100);
  // 크게 확대: 사인물별 원근 층, 납작한 그림 없음
  for (let i = 0; i < 12; i++) await wheel(-400);
  await expect(zone.getByTestId('baked-parts')).toHaveCount(1, { timeout: 15_000 });
  await expect(flat).toHaveCount(0);
});

// 2026-10-29 사용자: "2d는 줌인아웃 … 반복에서 나타났음 안드로이드는 잘된다" — 휴대폰은 크게 확대해도 사인물별 원근 층 없이 더 큰 납작한 그림
test.describe('휴대폰 폭', () => {
  test.use({ viewport: { width: 700, height: 900 } });
  test('크게 확대해도 원근 층(3D 변환) 없이 납작한 그림 한 장 — 더 선명한 것(긴 변 1024 초과)', async ({ page, request }) => {
    await setup(page, request);
    await page.evaluate(async () => {
      const path = '/src/lib/core/parts.ts';
      const { addPrintItem } = await import(/* @vite-ignore */ path);
      const a = (window as unknown as { __ganpanda: { objects: { id: string }[]; project: { updateObject(id: string, p: unknown): void } } }).__ganpanda;
      const { patch } = addPrintItem(a.objects[0], 'text');
      for (const p of patch.parts ?? []) for (const it of p.items) if (it.kind === 'text') it.text = '간판다';
      a.project.updateObject(a.objects[0].id, patch);
    });
    await page.getByTestId('stage-2d').click();
    const zone = page.getByTestId('photo-zone');
    const bb = (await page.getByTestId('board-canvas').boundingBox())!;
    await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2);
    for (let i = 0; i < 8; i++) { await page.keyboard.down('Control'); await page.mouse.wheel(0, -400); await page.keyboard.up('Control'); await page.waitForTimeout(150); }
    const flat = zone.getByTestId('flat-overlay');
    await expect.poll(() => flat.evaluate((e) => (e as HTMLImageElement).naturalWidth).catch(() => 0), { timeout: 15_000 }).toBeGreaterThan(1024);
    await expect(zone.getByTestId('baked-parts')).toHaveCount(0);
    expect(await zone.evaluate((z) => [...z.querySelectorAll('*')].filter((e) => /matrix3d/.test(getComputedStyle(e).transform)).length)).toBe(0);
  });
});
