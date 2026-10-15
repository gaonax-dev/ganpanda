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
