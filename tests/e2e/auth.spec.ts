import { expect, test } from '@playwright/test';

const email = () => `e2e-${Math.random().toString(36).slice(2, 8)}@example.com`;

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test('이메일로 로그인 → 상단에 계정 표시 → 새로고침해도 유지 → 로그아웃', async ({ page }) => {
  const mail = email();
  await page.getByTestId('login-button').click();
  await page.getByTestId('login-email').fill(mail);
  await page.getByTestId('login-submit').click();
  await expect(page.getByTestId('login-sent')).toContainText(mail);
  // 개발 모드: 서버가 돌려준 링크로 바로 로그인
  await page.getByTestId('login-dev-link').click();
  await expect(page.getByTestId('account-menu')).toContainText(mail.split('@')[0]);
  await expect(page.getByTestId('login-button')).toHaveCount(0);

  await page.reload();
  await expect(page.getByTestId('account-menu')).toContainText(mail.split('@')[0]);

  await page.getByTestId('account-menu').click();
  await page.getByTestId('logout').click();
  await expect(page.getByTestId('login-button')).toBeVisible();
  await expect(page.getByTestId('account-menu')).toHaveCount(0);
});

test('매직링크 URL(/login?token=)로 들어오면 로그인되고 주소가 정리된다', async ({ page, request }) => {
  const r = await request.post('http://localhost:8787/api/auth/email', { data: { email: email() } });
  const { link } = await r.json();
  const token = new URL(link).searchParams.get('token')!;
  await page.goto(`/login?token=${token}`);
  await expect(page.getByTestId('account-menu')).toBeVisible();
  await expect(page).toHaveURL(/\/\?room=|\/$/);
  expect(page.url()).not.toContain('token=');
});

test('잘못된 이메일은 안내, 만료된 링크는 오류 안내', async ({ page }) => {
  await page.getByTestId('login-button').click();
  await page.getByTestId('login-email').fill('not-an-email');
  await page.getByTestId('login-submit').click();
  await expect(page.getByTestId('login-error')).toBeVisible();
  await page.goto('/login?token=' + 'x'.repeat(43));
  await expect(page.getByTestId('login-error')).toContainText('링크');
});

test('로그인하면 표시 이름이 계정 이름이 되고, 이름을 바꾸면 계정에 저장된다', async ({ page }) => {
  const mail = email();
  await page.getByTestId('login-button').click();
  await page.getByTestId('login-email').fill(mail);
  await page.getByTestId('login-submit').click();
  await page.getByTestId('login-dev-link').click();
  await page.getByTestId('account-menu').click();
  await page.getByTestId('account-name').fill('간판다 사장님');
  await page.getByTestId('account-name').press('Enter');
  await page.reload();
  await expect(page.getByTestId('account-menu')).toContainText('간판다 사장님');
});
