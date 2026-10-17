// 사진은 긴 변 3200px 로 줄여 올린다 (2026-10-17 "이미지가 … 오래 걸리거나 모바일에서는 누락")
import { expect, test } from '@playwright/test';
import { openOwnedProject } from './helpers';

test('5000×3000 사진을 올리면 3200×1920 에셋이 된다, 작은 사진은 그대로', async ({ page, request }) => {
  await openOwnedProject(page, request, '큰 사진');
  const big = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 5000; c.height = 3000; const g = c.getContext('2d')!; g.fillStyle = '#88a'; g.fillRect(0, 0, 5000, 3000); return c.toDataURL('image/jpeg', 0.8); });
  await page.getByTestId('photo-input').setInputFiles({ name: 'big.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(big.split(',')[1], 'base64') });
  await expect.poll(() => page.evaluate(() => (window as unknown as { __ganpanda: { photos: { w: number; h: number }[] } }).__ganpanda.photos.map((p) => [p.w, p.h]))).toEqual([[3200, 1920]]);
  const small = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 1200; c.height = 800; c.getContext('2d')!.fillRect(0, 0, 1200, 800); return c.toDataURL('image/png'); });
  await page.getByTestId('photo-input').setInputFiles({ name: 'small.png', mimeType: 'image/png', buffer: Buffer.from(small.split(',')[1], 'base64') });
  await expect.poll(() => page.evaluate(() => (window as unknown as { __ganpanda: { photos: { w: number; h: number }[] } }).__ganpanda.photos.map((p) => [p.w, p.h]))).toEqual([[3200, 1920], [1200, 800]]);
});
