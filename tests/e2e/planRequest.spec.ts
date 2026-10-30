import { test, expect, type Page } from '@playwright/test';
import { apiLogin, openSettings } from './helpers';

// 2026-10-30 사용자: "무료로 사용하시고 정식서비스될때 유료사용으로 전환하게 하고 바로 서비스들어간다. 유료 버전을 신청하면 1-2시간 후에 처리해주고
// 정식 결제서비스 시작되면 그때 유료 전환을 요청한다." → "운영자가 아니고 서버에서". E2E 서버는 PAYMENTS_LIVE=1 — beta- 계정만 정식 결제 전으로 본다(개발 전용)
const rand = () => Math.random().toString(36).slice(2, 10);
const login = async (page: Page, s: string) => {
  await page.goto('/');
  await page.evaluate((x) => { localStorage.clear(); localStorage.setItem('ganpanda.session', x); localStorage.setItem('ganpanda.touchHelp', 'off'); }, s);
  await page.goto('/');
};

test('정식 결제 전: 카드 결제 대신 [유료 버전 신청] — 신청하면 1~2시간 안에 적용된다는 안내, 결제 없음', async ({ page, request }) => {
  await login(page, await apiLogin(request, `beta-${rand()}@example.com`));
  await openSettings(page);
  const sec = page.getByTestId('plan-request');
  await expect(sec).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('billing-section')).toHaveCount(0); // 카드 결제 칸 없음
  await expect(sec).toContainText('무료');
  await sec.getByTestId('plan-request-pro').click();
  await expect(sec.getByTestId('plan-request-status')).toContainText('프로');
  await expect(sec.getByTestId('plan-request-status')).toContainText('1~2시간');
  // 다시 열어도 신청 상태
  await page.reload();
  await openSettings(page);
  await expect(page.getByTestId('plan-request').getByTestId('plan-request-status')).toContainText('프로', { timeout: 15_000 });
});

test('정식 결제 뒤(일반 계정)에는 신청 칸 대신 카드 결제 칸', async ({ page, request }) => {
  await login(page, await apiLogin(request));
  await openSettings(page);
  await expect(page.getByTestId('billing-section')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('plan-request')).toHaveCount(0);
});
