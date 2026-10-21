// 사진은 긴 변 3200px 로 줄여 올린다 (2026-10-17 "이미지가 … 오래 걸리거나 모바일에서는 누락")
import { expect, test } from '@playwright/test';
import { openOwnedProject, uploadPhoto } from './helpers';

test('5000×3000 사진을 올리면 3200×1920 에셋이 된다, 작은 사진은 그대로', async ({ page, request }) => {
  await openOwnedProject(page, request, '큰 사진');
  const big = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 5000; c.height = 3000; const g = c.getContext('2d')!; g.fillStyle = '#88a'; g.fillRect(0, 0, 5000, 3000); return c.toDataURL('image/jpeg', 0.8); });
  await page.getByTestId('photo-input').setInputFiles({ name: 'big.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(big.split(',')[1], 'base64') });
  await expect.poll(() => page.evaluate(() => (window as unknown as { __ganpanda: { photos: { w: number; h: number }[] } }).__ganpanda.photos.map((p) => [p.w, p.h]))).toEqual([[3200, 1920]]);
  const small = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 1200; c.height = 800; c.getContext('2d')!.fillRect(0, 0, 1200, 800); return c.toDataURL('image/png'); });
  await page.getByTestId('photo-input').setInputFiles({ name: 'small.png', mimeType: 'image/png', buffer: Buffer.from(small.split(',')[1], 'base64') });
  await expect.poll(() => page.evaluate(() => (window as unknown as { __ganpanda: { photos: { w: number; h: number }[] } }).__ganpanda.photos.map((p) => [p.w, p.h]))).toEqual([[3200, 1920], [1200, 800]]);
});

test('사진을 지우고 같은 파일을 다시 올릴 수 있다 — 파일 입력 값을 비워 둔다 (2026-10-21 "사진 삭제후 같은 사진을 업로드하면 업로드가 안된다")', async ({ page, request }) => {
  await openOwnedProject(page, request);
  await uploadPhoto(page);
  await expect(page.getByTestId('photo-input')).toHaveValue(''); // 브라우저는 값이 같으면 change 를 안 보낸다 → 올린 뒤 비운다
  await page.getByTestId('photo-menu').first().click();
  page.once('dialog', (d) => d.accept());
  await page.getByTestId('photo-delete').click();
  await expect(page.getByTestId('photo-zone')).toHaveCount(0);
  await uploadPhoto(page);
  await expect(page.getByTestId('photo-zone')).toHaveCount(1);
  await expect(page.getByTestId('photo-input')).toHaveValue('');
});
