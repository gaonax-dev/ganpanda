import type { Page } from '@playwright/test';

/** 단색 테스트 사진 (정면, 1600×1000) */
export async function makePhoto(page: Page): Promise<Buffer> {
  const dataUrl = await page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 1600; c.height = 1000;
    const g = c.getContext('2d')!;
    g.fillStyle = '#d9cfc0'; g.fillRect(0, 0, 1600, 1000);
    g.fillStyle = '#334'; g.fillRect(200, 600, 1200, 400);
    return c.toDataURL('image/png');
  });
  return Buffer.from(dataUrl.split(',')[1], 'base64');
}

export async function uploadPhoto(page: Page) {
  const buffer = await makePhoto(page);
  await page.getByTestId('photo-input').setInputFiles({ name: '정면.png', mimeType: 'image/png', buffer });
  await page.getByTestId('photo-zone').first().waitFor();
}

/** 사진 원본 픽셀 좌표로 드래그 */
export async function dragOnPhoto(page: Page, from: [number, number], to: [number, number]) {
  const img = page.getByTestId('photo-img').first();
  const b = (await img.boundingBox())!;
  const k = b.width / 1600;
  await page.mouse.move(b.x + from[0] * k, b.y + from[1] * k);
  await page.mouse.down();
  await page.mouse.move(b.x + to[0] * k, b.y + to[1] * k, { steps: 6 });
  await page.mouse.up();
}
