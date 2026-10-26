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

// 2026-10-27 사용자: "현재 모두 테스터만 있다 약관 바로적용해주고 안내 안보이게" — 개정 약관 즉시 시행, 공지 배너·안내 없음
test('개정 약관 바로 적용: 홈 배너·약관 안내 없음, /terms 가 개정 약관(2026-10-27 시행), 예전 개정 주소는 /terms 로', async ({ page, request }) => {
  const s = await apiLogin(request);
  await page.goto('/');
  await page.evaluate((x) => { localStorage.clear(); localStorage.setItem('ganpanda.session', x); }, s);
  await page.reload();
  await expect(page.getByTestId('account-menu')).toBeVisible();
  await expect(page.getByTestId('terms-amend-banner')).toHaveCount(0);
  await page.goto('/terms.html'); // 운영은 /terms (정적 에셋), 개발 서버는 .html
  await expect(page.getByTestId('terms-amend-notice')).toHaveCount(0);
  await expect(page.locator('body')).toContainText('제5조의2 (이용 제한과 계약 해지)');
  await expect(page.locator('body')).toContainText('2026년 10월 27일부터 시행');
  await page.goto('/terms-2026-12-01.html');
  await expect(page).toHaveURL(/\/terms(\.html)?$/);
});
