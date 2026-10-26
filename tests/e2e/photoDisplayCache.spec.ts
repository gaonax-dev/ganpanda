// 사진 표시용 사본을 기기에 저장 (2026-10-27 사용자: "프로젝트 로딩이 너무 느리다" → "사진이 가장 크다. 사진은 로컬에서 먼저 가져오고 … 이미지는 거의 변경이 없다")
// 원본은 이미 기기에서 읽지만, 열 때마다 원본을 통째로 디코딩해 줄이고 JPEG 로 다시 굽는 일을 한 장씩 줄 세워 했다 → 한 번 만든 사본은 기기에 두고 다시 쓴다
import { expect, test, type Page } from '@playwright/test';
import { openOwnedProject } from './helpers';

/** 표시 크기(데스크톱 2400)보다 큰 사진 — 줄이기가 일어나게 */
async function uploadBigPhoto(page: Page, shade: string) {
  const dataUrl = await page.evaluate((fill) => {
    const c = document.createElement('canvas');
    c.width = 3600; c.height = 2400;
    const g = c.getContext('2d')!;
    g.fillStyle = fill; g.fillRect(0, 0, 3600, 2400);
    g.fillStyle = '#334'; g.fillRect(400, 1400, 2800, 800);
    return c.toDataURL('image/jpeg', 0.8);
  }, shade);
  await page.getByTestId('photo-input').setInputFiles({ name: `${shade}.jpg`, mimeType: 'image/jpeg', buffer: Buffer.from(dataUrl.split(',')[1], 'base64') });
}

test('한 번 연 프로젝트를 다시 열면 사진 표시용 사본을 다시 만들지 않고 기기에 저장된 것을 바로 쓴다', async ({ page, request }) => {
  // 사진을 굽는(JPEG 인코딩) 횟수를 센다
  await page.addInitScript(() => {
    const w = window as unknown as { __jpegEncodes: number };
    w.__jpegEncodes = 0;
    const orig = HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.toBlob = function (cb, type, q) { if (type === 'image/jpeg') w.__jpegEncodes++; return orig.call(this, cb, type, q); };
  });
  await openOwnedProject(page, request, '사진 사본');
  await uploadBigPhoto(page, '#d9cfc0');
  await expect(page.getByTestId('photo-img')).toHaveCount(1);
  await uploadBigPhoto(page, '#c0d9cf');
  await expect(page.getByTestId('photo-img')).toHaveCount(2);
  await page.waitForTimeout(1500);

  await page.reload();
  await expect(page.getByTestId('photo-img')).toHaveCount(2);
  await expect.poll(() => page.evaluate(() => [...document.querySelectorAll<HTMLImageElement>('[data-testid="photo-img"]')].every((i) => i.complete && i.naturalWidth > 0))).toBe(true);
  // 줄인 사본(2400px 이하)이 보이고, 다시 굽지 않았다
  const widths = await page.evaluate(() => [...document.querySelectorAll<HTMLImageElement>('[data-testid="photo-img"]')].map((i) => i.naturalWidth));
  for (const w of widths) expect(w).toBeLessThanOrEqual(2400);
  expect(await page.evaluate(() => (window as unknown as { __jpegEncodes: number }).__jpegEncodes)).toBe(0);
});
