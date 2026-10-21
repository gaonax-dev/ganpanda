// 시트 분류도 다른 분류와 같은 패널 인터페이스 (2026-10-22 "사인물에서 시트만 다른 인터페이스를 가진다")
import { expect, test } from '@playwright/test';
import { dragOnPhoto, openOwnedProject, pickCategory, uploadPhoto } from './helpers';

test('시트 사인물 패널에도 사이즈 줄·사양 글·칩이 있고, 사이즈 줄로 치수를 넣는다', async ({ page, request }) => {
  await openOwnedProject(page, request);
  await uploadPhoto(page);
  await page.keyboard.press('t');
  await dragOnPhoto(page, [300, 200], [700, 300]);
  await pickCategory(page, 'sheet');
  await expect(page.getByTestId('panel-size')).toBeVisible();
  await expect(page.getByTestId('spec-input')).toBeVisible();
  await expect(page.getByTestId('quick-spec')).toContainText('시트');
  await page.getByTestId('panel-width').fill('2000');
  await page.getByTestId('panel-height').fill('500');
  await expect.poll(() => page.evaluate(() => (window as unknown as { __ganpanda: { objects: { widthMm?: number; heightMm?: number }[] } }).__ganpanda.objects[0])).toMatchObject({ widthMm: 2000, heightMm: 500 });
  await expect(page.getByTestId('card-unsized')).toHaveCount(0); // 치수가 들어가 실측 카드
});
