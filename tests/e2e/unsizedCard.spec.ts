// 치수 없는 사인물도 카드로 (2026-10-22 "사인물이 사이즈를 넣지 않으면 사인물 카드로 나오지 않는다")
import { expect, test } from '@playwright/test';
import { dragOnPhoto, openObjectSettings, openOwnedProject, uploadPhoto } from './helpers';

test('치수를 안 넣어도 보드 평면 구역·리스트에 "치수 없음" 카드가 생기고, 견적·PDF 에는 안 들어간다; 치수를 넣으면 실측 카드로', async ({ page, request }) => {
  await openOwnedProject(page, request);
  await uploadPhoto(page);
  await page.keyboard.press('t');
  await dragOnPhoto(page, [300, 200], [700, 300]); // 400×100px → 비율 4:1 임시 카드
  await expect(page.getByTestId('board-card')).toHaveCount(1);
  await expect(page.getByTestId('card-unsized')).toContainText('치수 없음');
  await page.getByTestId('view-list').click();
  await expect(page.getByTestId('list-card')).toHaveCount(1);
  await expect(page.getByTestId('list-unsized')).toContainText('치수 없음');
  await expect(page.getByTestId('export-pdf')).toBeDisabled();
  await page.getByTestId('view-board').click();
  await page.getByTestId('sign-shape').first().click();
  await openObjectSettings(page);
  await page.getByTestId('width-mm').fill('4000');
  await page.getByTestId('height-mm').fill('1000');
  await page.getByTestId('close-object-settings').click();
  await expect(page.getByTestId('card-unsized')).toHaveCount(0);
  await page.getByTestId('view-list').click();
  await expect(page.getByTestId('list-unsized')).toHaveCount(0);
  await expect(page.getByTestId('export-pdf')).toBeEnabled();
});
