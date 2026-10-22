import { expect, test } from '@playwright/test';
import { openOwnedProject } from './helpers';

// 2026-10-22 사용자: "기어마크 설정버튼을 사용자닉에 메뉴로 추가하고 사용자 닉 클릭으로 나온 창은 다른 곳을 누르면 꺼지게 해줘"
test('설정은 닉네임 메뉴 안에 — 상단 ⚙ 없음, 메뉴는 바깥을 누르거나 Esc 로 닫힌다', async ({ page, request }) => {
  await openOwnedProject(page, request);
  await expect(page.getByTestId('account-menu')).toBeVisible();
  await expect(page.getByTestId('open-settings')).toHaveCount(0); // 상단 바에는 없음
  await page.getByTestId('account-menu').click();
  await expect(page.getByTestId('account-menu-list')).toBeVisible();
  await page.getByTestId('open-settings').click();
  await expect(page.getByTestId('settings')).toBeVisible();
  await expect(page.getByTestId('account-menu-list')).toHaveCount(0); // 설정을 열면 메뉴는 닫힘
  await page.keyboard.press('Escape');

  // 바깥 누르기 → 닫힘, 메뉴 안(이름 칸) 누르기 → 그대로
  await page.getByTestId('account-menu').click();
  await page.getByTestId('account-name').click();
  await expect(page.getByTestId('account-menu-list')).toBeVisible();
  await page.mouse.click(20, 400);
  await expect(page.getByTestId('account-menu-list')).toHaveCount(0);
  await page.getByTestId('account-menu').click();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('account-menu-list')).toHaveCount(0);
});

test('로그인하지 않으면 ⚙ 는 상단에 그대로 (닉네임 메뉴가 없다)', async ({ page }) => {
  await page.goto('/?room=local-test-' + Math.random().toString(36).slice(2));
  await expect(page.getByTestId('login-button')).toBeVisible();
  await expect(page.getByTestId('open-settings')).toBeVisible();
});
