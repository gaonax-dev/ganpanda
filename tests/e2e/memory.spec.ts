import { expect, test } from '@playwright/test';
import { openOwnedProject } from './helpers';

test('큰 사진은 줄인 사본으로 보이고, 평면도·리스트 카드 얼굴은 원본을 겹치지 않는 작은 그림이다 (휴대폰 메모리)', async ({ page, request }) => {
  await openOwnedProject(page, request);
  // 4000×3000 사진
  const buf = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 4000; c.height = 3000; const g = c.getContext('2d')!; g.fillStyle = '#c9b'; g.fillRect(0, 0, 4000, 3000); g.fillStyle = '#123'; g.fillRect(500, 400, 1500, 600); return c.toDataURL('image/jpeg', 0.8); });
  await page.getByTestId('photo-input').setInputFiles({ name: '큰사진.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(buf.split(',')[1], 'base64') });
  const img = page.getByTestId('photo-img');
  await expect(img).toBeVisible();
  await expect.poll(() => img.evaluate((e: HTMLImageElement) => e.naturalWidth)).toBeLessThanOrEqual(2400);
  expect(await img.evaluate((e: HTMLImageElement) => e.naturalWidth)).toBeGreaterThan(0);
  // 치수 입력한 사인물 → 평면도 카드 얼굴은 작은 그림 (변형 없음)
  await page.evaluate(() => {
    const app = (window as unknown as { __ganpanda: { photos: { id: string }[]; project: { addObject(o: unknown): string } } }).__ganpanda;
    app.project.addObject({ photoId: app.photos[0].id, name: '간판', shape: 'rect', quad: [[500, 400], [2000, 400], [2000, 1000], [500, 1000]], sheetIds: [], productId: 'board-flex', widthMm: 3000, heightMm: 1200 });
  });
  const face = page.getByTestId('board-card').locator('img');
  await expect(face).toHaveAttribute('src', /^blob:/);
  expect(await face.evaluate((e: HTMLImageElement) => [e.naturalWidth, getComputedStyle(e).transform])).toEqual([360, 'none']);
  // 얼굴 색은 사진 영역(어두운 사각형) 그대로
  const px = await face.evaluate((e: HTMLImageElement) => { const c = document.createElement('canvas'); c.width = e.naturalWidth; c.height = e.naturalHeight; const g = c.getContext('2d')!; g.drawImage(e, 0, 0); return Array.from(g.getImageData(180, 72, 1, 1).data); });
  expect(px[0]).toBeLessThan(60);
  await page.getByTestId('view-list').click();
  const lf = page.getByTestId('list-card').locator('img');
  await expect(lf).toHaveAttribute('src', /^blob:/);
  expect(await lf.evaluate((e: HTMLImageElement) => e.naturalWidth)).toBeLessThanOrEqual(640);
});

test('사진 하나가 줄이기에 실패해도(깨진 파일) 다른 사진은 들어오고, 실패한 사진은 원본으로 보인다', async ({ page, request }) => {
  await openOwnedProject(page, request);
  // 깨진 사진을 먼저 보드에 올린다 (이미지가 아닌 에셋)
  await page.evaluate(async () => {
    const path = '/src/lib/assets.ts';
    const { putAsset } = await import(/* @vite-ignore */ path);
    const id = await putAsset(new File([new Uint8Array([1, 2, 3, 4])], 'broken.jpg', { type: 'image/jpeg' }));
    const app = (window as unknown as { __ganpanda: { project: { addPhoto(p: unknown): string } } }).__ganpanda;
    app.project.addPhoto({ name: '깨짐.jpg', assetId: id, w: 1600, h: 1000, x: 0, y: 0, width: 1200 });
  });
  const buf = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 3000; c.height = 2000; const g = c.getContext('2d')!; g.fillStyle = '#c9b'; g.fillRect(0, 0, 3000, 2000); return c.toDataURL('image/jpeg', 0.8); });
  await page.getByTestId('photo-input').setInputFiles({ name: '정상.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(buf.split(',')[1], 'base64') });
  await expect(page.getByTestId('photo-zone')).toHaveCount(2);
  const good = page.getByTestId('photo-zone').filter({ hasText: '테스트 매장_img_1' }).getByTestId('photo-img');
  await expect.poll(() => good.evaluate((e: HTMLImageElement) => e.naturalWidth).catch(() => 0), { timeout: 10_000 }).toBeGreaterThan(0);
});

test('치수 입력한 사인물(평면도 카드)이 이미 있는 프로젝트를 새로 열어도 사진이 들어온다 (카드 그림과 사진 줄이기가 서로 막히지 않음)', async ({ page, request }) => {
  await openOwnedProject(page, request);
  const buf = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 4000; c.height = 3000; const g = c.getContext('2d')!; g.fillStyle = '#c9b'; g.fillRect(0, 0, 4000, 3000); return c.toDataURL('image/jpeg', 0.8); });
  for (const n of ['a.jpg', 'b.jpg']) await page.getByTestId('photo-input').setInputFiles({ name: n, mimeType: 'image/jpeg', buffer: Buffer.from(buf.split(',')[1], 'base64') });
  await expect(page.getByTestId('photo-zone')).toHaveCount(2);
  await page.evaluate(() => {
    const app = (window as unknown as { __ganpanda: { photos: { id: string }[]; project: { addObject(o: unknown): string } } }).__ganpanda;
    for (const p of app.photos) app.project.addObject({ photoId: p.id, name: '간판', shape: 'rect', quad: [[500, 400], [2000, 400], [2000, 1000], [500, 1000]], sheetIds: [], productId: 'board-flex', widthMm: 3000, heightMm: 1200 });
  });
  await page.reload();
  await expect(page.getByTestId('sync-status')).toHaveAttribute('data-status', 'online');
  const imgs = page.getByTestId('photo-img');
  await expect(imgs).toHaveCount(2);
  await expect.poll(() => imgs.evaluateAll((es) => es.map((e) => (e as HTMLImageElement).naturalWidth).filter((w) => w > 0).length), { timeout: 15_000 }).toBe(2);
  await expect(page.getByTestId('board-card').locator('img')).toHaveCount(2);
});
