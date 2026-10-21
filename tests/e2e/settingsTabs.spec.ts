// 설정 창 탭 (2026-10-21 사용자: "설정을 내용별로 탭으로 분리해줘")
import { expect, test } from '@playwright/test';
import { openOwnedProject } from './helpers';

test('설정은 계정 · 멤버 · 사양 사전 · 표시 · 단축키 탭으로 나뉘고, 처음엔 계정 탭', async ({ page, request }) => {
  await openOwnedProject(page, request);
  await page.getByTestId('open-settings').click();
  const dlg = page.getByTestId('settings');
  await expect(dlg.locator('[data-testid^="settings-tab-"]')).toHaveText(['계정', '멤버', '사양 사전', '표시', '단축키']);
  await expect(dlg.getByTestId('account-section')).toBeVisible();
  await expect(dlg.getByTestId('team-section')).toHaveCount(0);
  await expect(dlg.getByTestId('shortcut-row-toolRect')).toHaveCount(0);
  await dlg.getByTestId('settings-tab-keys').click();
  await expect(dlg.getByTestId('shortcut-row-toolRect')).toBeVisible();
  await expect(dlg.getByTestId('shortcuts-reset-all')).toBeVisible();
  await expect(dlg.getByTestId('account-section')).toHaveCount(0);
  await dlg.getByTestId('settings-tab-team').click();
  await expect(dlg.getByTestId('member-email')).toBeVisible();
  await expect(dlg.getByTestId('shortcuts-reset-all')).toHaveCount(0); // 단축키 탭에만
  await dlg.getByTestId('settings-tab-display').click();
  await expect(dlg.getByTestId('warn-measure')).toBeVisible();
});

test('로그인 없이 열면 표시 · 단축키만', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('open-settings').click();
  const dlg = page.getByTestId('settings');
  await expect(dlg.locator('[data-testid^="settings-tab-"]')).toHaveText(['표시', '단축키']);
  await expect(dlg.getByTestId('warn-measure')).toBeVisible();
});
