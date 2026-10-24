// 입력 창은 바깥을 눌러도 닫히지 않는다 — ✕ 로만, 바깥을 누르면 ✕ 가 흔들리며 알린다. 비밀번호는 눈 단추로 보기 (2026-10-24 사용자: "로그인, 회원가입 등 사용자가 입력하는 필드있는 같은류의 창이 외부를 터치해도 꺼진다. x마크로만 끄게하던가 알림을 주던가 해주고 비밀번호 쇼(눈아이콘) 버튼 있어야해")
import { expect, test } from '@playwright/test';

test('로그인 창: 바깥을 눌러도 그대로(적은 것 유지) + ✕ 알림, ✕ 로 닫힌다. 비밀번호 눈 단추로 보이기·숨기기', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByTestId('login-button').click();
  const dlg = page.getByTestId('login-dialog');
  await page.getByTestId('login-email').fill('me@example.com');
  await page.mouse.click(8, 8); // 바깥
  await expect(dlg).toBeVisible();
  await expect(page.getByTestId('login-email')).toHaveValue('me@example.com');
  await expect(dlg.locator('[data-close]')).toHaveAttribute('data-nudge', '1');
  await expect(page.getByTestId('close-hint')).toContainText('✕');
  // 비밀번호 보기
  const pw = page.getByTestId('login-password');
  await pw.fill('secret-1234');
  await expect(pw).toHaveAttribute('type', 'password');
  await page.getByTestId('login-password-show').click();
  await expect(pw).toHaveAttribute('type', 'text');
  await expect(page.getByTestId('login-password-show')).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('login-password-show').click();
  await expect(pw).toHaveAttribute('type', 'password');
  // 회원가입의 비밀번호 확인 칸에도
  await page.getByTestId('login-mode-signup').click();
  await expect(page.getByTestId('login-password2-show')).toBeVisible();
  await dlg.locator('[data-close]').click();
  await expect(dlg).toHaveCount(0);
});
