// 요청판 (2026-10-17 → 2026-10-21 켬): 고객 흐름 전체는 estimate.spec.ts
import { expect, test } from '@playwright/test';
import { openOwnedProject, openSettings } from './helpers';

test('요청판은 기본으로 켜져 있다 (2026-10-21 "켜는 걸로 진행"): 설정에 요청 받기 탭, /request 폼', async ({ page, request }) => {
  await openOwnedProject(page, request, '간판사');
  await page.goto('/');
  await openSettings(page);
  await expect(page.getByTestId('settings-tab-requests')).toBeVisible();
  await page.getByTestId('close-settings').click();
  await page.goto('/request');
  await expect(page).toHaveURL(/\/estimate$/); // 옛 요청 폼은 소비자 보드로 (2026-10-21)
});
