// 가게 사장 화면에서 이메일 가입 → 인증 링크를 열면 가게 사장 화면으로, 계정은 가게 사장 (2026-10-24 사용자: "가계사장으로 계정생성했는데 사업자로 등록되었다")
import { expect, test } from '@playwright/test';

test('가게 사장: [다른 방법으로 로그인] → 회원가입 → 인증 링크 → 견적 화면(가게 사장)으로 돌아온다', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('ganpanda.touchHelp', 'off'); });
  await page.getByTestId('landing-consumer').click();
  await expect(page.getByTestId('consumer-gate')).toBeVisible();
  await page.getByTestId('consumer-login-other').click();
  await page.getByTestId('login-mode-signup').click();
  const mail = `owner-${Math.random().toString(36).slice(2, 8)}@example.com`;
  await page.getByTestId('login-email').fill(mail);
  await page.getByTestId('login-password').fill('abcd1234');
  await page.getByTestId('login-password2').fill('abcd1234');
  const res = page.waitForResponse((r) => r.url().endsWith('/api/auth/signup'));
  await page.getByTestId('login-submit').click();
  const link = new URL((await (await res).json()).link);
  expect(link.searchParams.get('next')).toBe('/estimate');
  await page.goto(link.pathname + link.search); // 메일의 링크를 연다
  await expect(page).toHaveURL(/\/estimate/);
  await expect(page.getByTestId('consumer-badge')).toBeVisible();
  // 로그인된 채 가게 사장 화면 — 종류는 첫 견적에서 가게 사장으로 정해진다(카카오와 같음). 간판집으로 정해지지 않았다
  await expect.poll(() => page.evaluate(() => { const a = (window as unknown as { __ganpanda: { account: { email: string; kind: string | null } | null } }).__ganpanda.account; return a ? `${a.email}:${a.kind}` : null; }), { timeout: 15_000 }).toMatch(/^owner-.*:(null|consumer)$/);
  await expect(page.getByTestId('consumer-gate')).toHaveCount(0);
});

test('간판집 화면의 가입 링크에는 돌아갈 곳이 붙지 않는다 (그대로 첫 화면)', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.getByTestId('landing-shop').click();
  await page.getByTestId('login-mode-signup').click();
  await page.getByTestId('login-email').fill(`shop-${Math.random().toString(36).slice(2, 8)}@example.com`);
  await page.getByTestId('login-password').fill('abcd1234');
  await page.getByTestId('login-password2').fill('abcd1234');
  const res = page.waitForResponse((r) => r.url().endsWith('/api/auth/signup'));
  await page.getByTestId('login-submit').click();
  expect(new URL((await (await res).json()).link).searchParams.get('next')).toBeNull();
});
