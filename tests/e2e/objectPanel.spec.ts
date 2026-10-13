import { expect, test } from '@playwright/test';
import { dragOnPhoto, openOwnedProject, uploadPhoto } from './helpers';

test('사인물 패널은 분류(간판/스카시/시트)와 요약만, 세부 설정은 따로 열리는 창', async ({ page, request }) => {
  await openOwnedProject(page, request);
  await uploadPhoto(page);
  await page.keyboard.press('r');
  await dragOnPhoto(page, [400, 200], [800, 300]);
  const panel = page.getByTestId('object-panel');
  await expect(panel).toBeVisible();
  await expect(panel.getByTestId('category-sign')).toBeVisible();
  await expect(panel.getByTestId('category-scashi')).toBeVisible();
  await expect(panel.getByTestId('category-sheet')).toBeVisible();
  await expect(page.getByTestId('width-mm')).toHaveCount(0); // 세부 항목은 패널에 없음
  await expect(page.getByTestId('chat-input')).toBeVisible(); // 대화는 패널에

  // 스카시 → 기본 제품이 스카시, 요약에 표시
  await panel.getByTestId('category-scashi').click();
  await expect(panel.getByTestId('object-summary')).toContainText('스카시');
  // 시트 → 시트 분류, 설정 창에서 시트 종류 고름
  await panel.getByTestId('category-sheet').click();
  await expect(panel.getByTestId('object-summary')).not.toContainText('스카시');
  await page.getByTestId('object-settings-open').click();
  const dlg = page.getByTestId('object-settings');
  await expect(dlg).toBeVisible();
  await dlg.getByTestId('sheet-sh-print').click();
  await dlg.getByTestId('width-mm').fill('1000');
  await dlg.getByTestId('height-mm').fill('500');
  await expect(panel.getByTestId('object-summary')).toContainText('실사 출력 시트');
  await expect(panel.getByTestId('object-summary')).toContainText('1,000×500');
  // 창은 보드 조작을 막지 않는다: 다른 사인물을 그리면 창이 그 사인물로 바뀐다
  await page.keyboard.press('Escape');
  await expect(dlg).toHaveCount(0);
  await page.keyboard.press('r');
  await dragOnPhoto(page, [900, 400], [1200, 500]);
  await page.getByTestId('object-settings-open').click();
  await expect(page.getByTestId('object-settings')).toContainText('사인물 2');
});
