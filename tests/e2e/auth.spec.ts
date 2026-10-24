import { expect, test } from '@playwright/test';
import { apiSignup, bizInput, fillSignupBusiness } from './helpers';

const email = () => `e2e-${Math.random().toString(36).slice(2, 8)}@example.com`;

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test('이메일로 로그인 → 상단에 계정 표시 → 새로고침해도 유지 → 로그아웃', async ({ page, request }) => {
  const mail = email();
  await apiSignup(request, mail); // 메일 링크는 가입한 계정만 (2026-10-24)
  await page.getByTestId('login-button').click();
  await page.getByTestId('login-mode-link').click();
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
  const mail = email();
  await apiSignup(request, mail);
  const r = await request.post('http://localhost:8787/api/auth/email', { data: { email: mail } });
  const { link } = await r.json();
  const token = new URL(link).searchParams.get('token')!;
  await page.goto(`/login?token=${token}`);
  await expect(page.getByTestId('account-menu')).toBeVisible();
  await expect(page).toHaveURL(/\/\?room=|\/$/);
  expect(page.url()).not.toContain('token=');
});

test('잘못된 이메일은 안내, 만료된 링크는 오류 안내', async ({ page }) => {
  await page.getByTestId('login-button').click();
  await page.getByTestId('login-mode-link').click();
  await page.getByTestId('login-email').fill('not-an-email');
  await page.getByTestId('login-submit').click();
  await expect(page.getByTestId('login-error')).toBeVisible();
  await page.goto('/login?token=' + 'x'.repeat(43));
  await expect(page.getByTestId('login-error')).toContainText('링크');
});

test('로그인하면 표시 이름이 계정 이름이 되고, 이름을 바꾸면 계정에 저장된다', async ({ page, request }) => {
  const mail = email();
  await apiSignup(request, mail);
  await page.getByTestId('login-button').click();
  await page.getByTestId('login-mode-link').click();
  await page.getByTestId('login-email').fill(mail);
  await page.getByTestId('login-submit').click();
  await page.getByTestId('login-dev-link').click();
  await page.getByTestId('account-menu').click();
  await page.getByTestId('account-name').fill('간판다 사장님');
  await page.getByTestId('account-name').press('Enter');
  await page.reload();
  await expect(page.getByTestId('account-menu')).toContainText('간판다 사장님');
});

test('소셜 로그인 결과(/login#session=…&next=…)로 들어오면 로그인되고 next 로 이동한다', async ({ page, request }) => {
  const { apiLogin, apiCreateProject } = await import('./helpers');
  const session = await apiLogin(request);
  const projectId = await apiCreateProject(request, session, '소셜 매장');
  await page.goto(`/login#session=${encodeURIComponent(session)}&next=${encodeURIComponent(`/?room=${projectId}`)}`);
  await expect(page.getByTestId('account-menu')).toBeVisible();
  await expect(page.getByTestId('project-title')).toContainText('소셜 매장');
  expect(page.url()).not.toContain('session=');
});

test('로그인 창에 서버가 지원하는 소셜 로그인 버튼이 보인다', async ({ page }) => {
  await page.getByTestId('login-button').click();
  await expect(page.getByTestId('social-kakao')).toBeVisible();
  await expect(page.getByTestId('social-google')).toBeVisible();
  const href = await page.getByTestId('social-kakao').getAttribute('href');
  expect(href).toContain('/api/auth/kakao/start');
});

test('이메일·비밀번호: 가입(인증 메일 → 인증 전 로그인 막힘 → 다시 받기 → 인증) → 로그아웃 → 로그인(틀리면 안내) → 비밀번호 찾기 메일 → 새 비밀번호 → 새 비밀번호로 로그인', async ({ page }) => {
  const mail = email();
  await page.getByTestId('login-button').click();
  await expect(page.getByTestId('login-dialog')).toHaveAttribute('data-mode', 'login'); // 기본은 비밀번호 로그인
  await page.getByTestId('login-mode-signup').click();
  await page.getByTestId('login-email').fill(mail);
  await page.getByTestId('login-password').fill('short');
  await page.getByTestId('login-password2').fill('short');
  await page.getByTestId('login-submit').click();
  await expect(page.getByTestId('login-error')).toContainText('8자');
  await page.getByTestId('login-password').fill('secret-1234');
  await page.getByTestId('login-password2').fill('secret-1234');
  await page.getByTestId('login-name').fill('김사장');
  await fillSignupBusiness(page);
  await page.getByTestId('login-submit').click();
  // 가입 = 인증 메일. 인증 전 로그인은 막히고 [인증 메일 다시 받기]
  await expect(page.getByTestId('login-sent')).toContainText('가입 인증 메일');
  const firstLink = page.getByTestId('login-dev-link');
  await expect(firstLink).toBeVisible();
  await page.getByRole('button', { name: '로그인으로 돌아가기' }).click();
  await page.getByTestId('login-email').fill(mail);
  await page.getByTestId('login-password').fill('secret-1234');
  await page.getByTestId('login-submit').click();
  await expect(page.getByTestId('login-error')).toContainText('인증');
  await page.getByTestId('login-resend-verify').click();
  await expect(page.getByTestId('login-sent')).toContainText('가입 인증 메일');
  await page.getByTestId('login-dev-link').click(); // 메일의 [이메일 인증하기]
  await expect(page.getByTestId('account-menu')).toContainText('김사장');
  // 로그아웃 → 틀린 비밀번호 → 맞는 비밀번호
  await page.getByTestId('account-menu').click();
  await page.getByTestId('logout').click();
  await page.getByTestId('login-button').click();
  await page.getByTestId('login-email').fill(mail);
  await page.getByTestId('login-password').fill('wrong-pass');
  await page.getByTestId('login-submit').click();
  await expect(page.getByTestId('login-error')).toContainText('맞지 않습니다');
  await page.getByTestId('login-password').fill('secret-1234');
  await page.getByTestId('login-submit').click();
  await expect(page.getByTestId('account-menu')).toContainText('김사장');
  // 비밀번호 찾기: 재설정 링크 → 새 비밀번호
  await page.getByTestId('account-menu').click();
  await page.getByTestId('logout').click();
  await page.getByTestId('login-button').click();
  await page.getByTestId('login-mode-forgot').click();
  await page.getByTestId('login-email').fill(mail);
  await page.getByTestId('login-submit').click();
  await expect(page.getByTestId('login-sent')).toContainText('재설정');
  await page.getByTestId('login-dev-link').click();
  await expect(page.getByTestId('password-dialog')).toBeVisible();
  await expect(page.getByTestId('password-current')).toHaveCount(0); // 재설정 링크로 들어오면 현재 비밀번호 없이
  await page.getByTestId('password-new').fill('brand-new-99');
  await page.getByTestId('password-new2').fill('brand-new-99');
  await page.getByTestId('password-save').click();
  await expect(page.getByTestId('password-done')).toBeVisible();
  await page.getByRole('button', { name: '확인' }).click();
  await page.getByTestId('account-menu').click();
  await page.getByTestId('logout').click();
  await page.getByTestId('login-button').click();
  await page.getByTestId('login-email').fill(mail);
  await page.getByTestId('login-password').fill('brand-new-99');
  await page.getByTestId('login-submit').click();
  await expect(page.getByTestId('account-menu')).toBeVisible();
  // 설정에서 비밀번호 바꾸기는 현재 비밀번호가 필요
  await page.getByTestId('account-menu').click();
  await page.getByTestId('open-password').click();
  await expect(page.getByTestId('password-current')).toBeVisible();
});

test('가입 인증 메일 링크(/login?token=&verify=1)로 들어오면 로그인되고 인증 완료 안내', async ({ page, request }) => {
  const r = await request.post('http://localhost:8787/api/auth/signup', { data: { email: email(), password: 'secret-1234', business: bizInput() } });
  const { link } = await r.json();
  const u = new URL(link);
  await page.goto(u.pathname + u.search);
  await expect(page.getByTestId('account-menu')).toBeVisible();
  await expect(page.getByTestId('notice')).toContainText('이메일 인증');
});
