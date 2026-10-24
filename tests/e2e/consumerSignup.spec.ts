// 가게 사장 화면에서 이메일 가입 → 인증 링크를 열면 가게 사장 화면으로, 계정은 가게 사장 (2026-10-24 사용자: "가계사장으로 계정생성했는데 사업자로 등록되었다")
import { expect, test } from '@playwright/test';
import { fillSignupBusiness } from './helpers';

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
  await fillSignupBusiness(page);
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
  await fillSignupBusiness(page);
  const res = page.waitForResponse((r) => r.url().endsWith('/api/auth/signup'));
  await page.getByTestId('login-submit').click();
  expect(new URL((await (await res).json()).link).searchParams.get('next')).toBeNull();
});

// 2026-10-24 사용자: "이메일 가입시에는 가판집, 가게사장 모두 사업자 등록증 확인 이유는 멋진걸로 적어줘" → "국세청을 빼고"
test('이메일 가입은 간판집·가게 사장 모두 사업자 확인 — 이유 문구, 비우면 안내, 틀리면 서버 안내', async ({ page }) => {
  for (const side of ['landing-shop', 'landing-consumer'] as const) {
    await page.goto('/');
    await page.evaluate(() => { localStorage.clear(); localStorage.setItem('ganpanda.touchHelp', 'off'); });
    await page.getByTestId(side).click();
    if (side === 'landing-consumer') await page.getByTestId('consumer-login-other').click();
    await page.getByTestId('login-mode-signup').click();
    await expect(page.getByTestId('signup-biz-why')).toContainText('확인된 사업자와');
    await expect(page.getByTestId('signup-biz-why')).not.toContainText('국세청');
  }
  await page.getByTestId('login-email').fill(`b-${Math.random().toString(36).slice(2, 8)}@example.com`);
  await page.getByTestId('login-password').fill('abcd1234');
  await page.getByTestId('login-password2').fill('abcd1234');
  await page.getByTestId('login-submit').click();
  await expect(page.getByTestId('login-error')).toContainText('사업자등록번호');
  const { bizNo } = await import('./helpers');
  const ok = bizNo();
  await fillSignupBusiness(page, { no: ok.slice(0, 9) + String((Number(ok[9]) + 1) % 10), ownerName: '김철수', startDate: '2020-01-05', name: '' });
  await page.getByTestId('login-submit').click();
  await expect(page.getByTestId('login-error')).toContainText('사업자등록번호'); // 검증 자릿수가 틀린 번호 → 앱이 먼저 막음
  await page.getByTestId('biz-no').fill(ok);
  await page.getByTestId('login-submit').click();
  await expect(page.getByTestId('login-error')).toContainText('대표자'); // 서버: 등록 정보와 다름
});

test('메일 링크 로그인은 가입한 계정만 — 처음 보는 이메일은 회원가입으로 안내', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.getByTestId('landing-shop').click();
  await page.getByTestId('login-mode-link').click();
  await page.getByTestId('login-email').fill(`new-${Math.random().toString(36).slice(2, 8)}@example.com`);
  await page.getByTestId('login-submit').click();
  await expect(page.getByTestId('login-error')).toContainText('가입된 계정이 없습니다');
  await page.getByTestId('login-error-signup').click();
  await expect(page.getByTestId('login-dialog')).toHaveAttribute('data-mode', 'signup');
  await expect(page.getByTestId('login-email')).not.toHaveValue('');
});
