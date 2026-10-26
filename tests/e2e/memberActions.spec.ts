// 가입 동의 안내 · 운영자 계정 조치 · 정지 화면 · 이의 신청 (2026-10-27 "전부 진행해줘" — 이용약관 개정안 제3조·제5조의2)
import { expect, test } from '@playwright/test';
import { apiLogin } from './helpers';

test('로그인·가입 창에 동의 안내(약관·개인정보처리방침 링크, 만 14세 이상)', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('landing-shop').click();
  const notice = page.getByTestId('terms-notice');
  await expect(notice).toContainText('만 14세 이상');
  await expect(notice.getByRole('link', { name: '이용약관' })).toHaveAttribute('href', '/terms');
  await expect(notice.getByRole('link', { name: '개인정보처리방침' })).toHaveAttribute('href', '/privacy');
});

test('운영자가 7일 정지 → 회원은 정지 화면(사유)에서 이의 신청 → 운영자가 받아들이면 다시 이용', async ({ page, browser, request }) => {
  const email = `e2e-bad-${Math.random().toString(36).slice(2, 8)}@example.com`;
  const bad = await apiLogin(request, email);
  const op = await apiLogin(request, 'op@example.com');
  const opPage = await browser.newPage();
  await opPage.goto('/');
  await opPage.evaluate((s) => { localStorage.clear(); localStorage.setItem('ganpanda.session', s); }, op);
  await opPage.goto('/ops');
  await opPage.getByTestId('ops-tab-members').click();
  await opPage.getByTestId('ops-member-q').fill(email);
  await opPage.getByTestId('ops-member-search').click();
  const card = opPage.getByTestId('ops-member').filter({ hasText: email });
  await expect(card.getByTestId('ops-member-status')).toHaveText('이용 중');
  opPage.once('dialog', (d) => void d.accept('반복 스팸'));
  await card.getByTestId('ops-member-suspend7').click();
  await expect(card.getByTestId('ops-member-status')).toContainText('기간 정지');
  await expect(card).toContainText('반복 스팸');

  // 회원: 정지 화면
  await page.goto('/');
  await page.evaluate((s) => { localStorage.clear(); localStorage.setItem('ganpanda.session', s); }, bad);
  await page.reload();
  await expect(page.getByTestId('suspended-page')).toContainText('이용이 정지되었습니다');
  await expect(page.getByTestId('suspended-reason')).toContainText('반복 스팸');
  await expect(page.getByTestId('project-list')).toHaveCount(0);
  await page.getByTestId('appeal-text').fill('광고가 아니라 고객 안내였습니다');
  await page.getByTestId('appeal-send').click();
  await expect(page.getByTestId('appeal-sent')).toBeVisible();

  // 운영자: 이의 신청 받아들이기
  await opPage.reload();
  await opPage.getByTestId('ops-tab-members').click();
  const ap = opPage.getByTestId('ops-appeal').filter({ hasText: email });
  await expect(ap).toHaveAttribute('data-status', 'open');
  opPage.once('dialog', (d) => void d.accept('확인했습니다'));
  await ap.getByTestId('ops-appeal-accept').click();
  await expect(opPage.getByTestId('ops-appeal').filter({ hasText: email })).toHaveAttribute('data-status', 'accepted');
  await page.reload();
  await expect(page.getByTestId('suspended-page')).toHaveCount(0);
  await expect(page.getByTestId('project-list')).toBeVisible();
  await opPage.close();
});

test('약관 개정 공지: 로그인한 회원에게 배너(개정 약관 링크), 닫으면 다시 안 보임 · 약관 페이지에도 안내', async ({ page, request }) => {
  const s = await apiLogin(request);
  await page.goto('/');
  await page.evaluate((x) => { localStorage.clear(); localStorage.setItem('ganpanda.session', x); }, s);
  await page.reload();
  const banner = page.getByTestId('terms-amend-banner');
  await expect(banner).toContainText('2026년 12월 1일');
  await expect(banner.getByRole('link')).toHaveAttribute('href', '/terms-2026-12-01');
  await page.getByTestId('terms-amend-close').click();
  await expect(banner).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId('account-menu')).toBeVisible();
  await expect(banner).toHaveCount(0);
  await page.goto('/terms.html'); // 운영은 /terms (정적 에셋), 개발 서버는 .html
  await expect(page.getByTestId('terms-amend-notice')).toContainText('개정 약관 보기');
  await page.goto('/terms-2026-12-01.html');
  await expect(page.locator('body')).toContainText('제5조의2 (이용 제한과 계약 해지)');
  await expect(page.locator('body')).toContainText('2026년 12월 1일부터 시행');
});
