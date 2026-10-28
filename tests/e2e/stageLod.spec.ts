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
    const warp = page.locator('.warp').first();
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

