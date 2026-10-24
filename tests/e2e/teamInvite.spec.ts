// 멤버는 메일의 가입 링크로 (2026-10-24 사용자: "맴버는 메일로 가입링크 들어오기로")
import { expect, test } from '@playwright/test';
import { apiLogin, openSettings } from './helpers';

test('가입 안 한 이메일을 멤버로 → 가입 링크 메일(대기 중) → 링크를 열면 이메일이 정해진 가입 화면(사업자 칸 없음) → 비밀번호만 정하면 바로 로그인·팀 멤버', async ({ page, browser, request }) => {
  const owner = await apiLogin(request);
  await page.goto('/');
  await page.evaluate((s) => { localStorage.clear(); localStorage.setItem('ganpanda.session', s); localStorage.setItem('ganpanda.touchHelp', 'off'); }, owner);
  await page.reload();
  await page.getByTestId('account-menu').click();
  await page.getByTestId('account-name').fill('한울광고');
  await page.getByTestId('account-name').press('Enter');
  await page.keyboard.press('Escape');
  await openSettings(page);
  await page.getByTestId('settings-tab-team').click();
  const staff = `staff-${Math.random().toString(36).slice(2, 8)}@example.com`;
  await page.getByTestId('member-email').fill(staff);
  const res = page.waitForResponse((r) => r.url().endsWith('/api/me/team') && r.request().method() === 'POST');
  await page.getByTestId('member-add').click();
  const link = new URL((await (await res).json()).link);
  await expect(page.getByTestId('member-sent')).toContainText(staff);
  await expect(page.getByTestId('member-invite')).toContainText(staff);
  await expect(page.getByTestId('member-invite')).toContainText('가입 대기');

  // 직원: 메일의 링크
  const ctx = await browser.newContext();
  const sp = await ctx.newPage();
  await sp.goto(link.pathname + link.search);
  const dlg = sp.getByTestId('login-dialog');
  await expect(dlg).toHaveAttribute('data-mode', 'signup');
  await expect(sp.getByTestId('invite-banner')).toContainText('한울광고');
  await expect(sp.getByTestId('login-email')).toHaveValue(staff);
  await expect(sp.getByTestId('login-email')).toBeDisabled();
  await expect(sp.getByTestId('signup-business')).toHaveCount(0);
  await sp.getByTestId('login-password').fill('staff-pass-1');
  await sp.getByTestId('login-password2').fill('staff-pass-1');
  await sp.getByTestId('login-name').fill('김직원');
  await sp.getByTestId('login-submit').click();
  await expect(sp.getByTestId('account-menu')).toContainText('김직원');
  await expect(sp.getByTestId('notice')).toContainText('팀');
  expect(sp.url()).not.toContain('team=');
  await ctx.close();

  // 오너: 대기 → 멤버
  await page.getByTestId('settings-tab-account').click();
  await page.getByTestId('settings-tab-team').click();
  await expect(page.getByTestId('team-member')).toContainText(staff);
  await expect(page.getByTestId('member-invite')).toHaveCount(0);
});

test('대기 중 초대는 취소할 수 있고, 만료·취소된 링크를 열면 안내', async ({ page, request }) => {
  const owner = await apiLogin(request);
  const staff = `staff2-${Math.random().toString(36).slice(2, 8)}@example.com`;
  const r = await request.post('http://localhost:8787/api/me/team', { data: { email: staff }, headers: { authorization: `Bearer ${owner}` } });
  const link = new URL((await r.json()).link);
  await page.goto('/');
  await page.evaluate((s) => { localStorage.clear(); localStorage.setItem('ganpanda.session', s); }, owner);
  await page.reload();
  await openSettings(page);
  await page.getByTestId('settings-tab-team').click();
  await page.getByTestId('member-invite-cancel').click();
  await expect(page.getByTestId('member-invite')).toHaveCount(0);
  await page.evaluate(() => localStorage.clear());
  await page.goto(link.pathname + link.search);
  await expect(page.getByTestId('login-error')).toContainText('초대 링크');
});

// 2026-10-24 사용자: "해당 링크에 카카오 로그인을 만들면 되지 않나?"
test('초대 링크 창의 [카카오로 팀 들어가기]는 초대를 들고 카카오로, 돌아오면 "팀에 들어왔습니다"', async ({ page, request }) => {
  const owner = await apiLogin(request);
  const r = await request.post('http://localhost:8787/api/me/team', { data: { email: `k-${Math.random().toString(36).slice(2, 8)}@example.com` }, headers: { authorization: `Bearer ${owner}` } });
  const link = new URL((await r.json()).link);
  await page.goto(link.pathname + link.search);
  const kakao = page.getByTestId('social-kakao');
  await expect(kakao).toContainText('카카오로 팀 들어가기');
  expect(await kakao.getAttribute('href')).toContain(`team=${link.searchParams.get('team')}`);
  // 카카오에서 돌아온 모습 (서버가 next 에 joined= 를 붙인다)
  const session = await apiLogin(request);
  await page.goto(`/login#session=${encodeURIComponent(session)}&next=${encodeURIComponent('/?joined=' + encodeURIComponent('한울광고'))}`);
  await expect(page.getByTestId('notice')).toContainText('한울광고님의 팀에 들어왔습니다');
  await expect(page).not.toHaveURL(/joined=/);
});
