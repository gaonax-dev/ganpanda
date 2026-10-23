// 환불정책·이용약관 (2026-10-23 토스 결제 심사): 정적 페이지 /refund · /terms (운영은 확장자 없이, 로컬 vite 는 .html), 구독 칸에서 링크
import { expect, test } from '@playwright/test';
import { openOwnedProject, openSettings } from './helpers';

test('환불정책: 요금·해지·7일 전액 환불·청약철회 제한·신청 메일·사업자 정보', async ({ page }) => {
  await page.goto('/refund.html');
  await expect(page).toHaveTitle(/환불 정책/);
  const body = page.locator('body');
  for (const t of ['30,000원', '60,000원', '해지', '7일 이내', '제17조 제2항', 'support@ganpanda.co.kr', '가오낙스', '271-79-00651', '2025-경기이천-0538']) await expect(body).toContainText(t);
  await expect(page.locator('a[href="/terms"]').first()).toBeVisible();
});

test('이용약관: 서비스·요금제·정기결제(7일 유예)·환불·문의', async ({ page }) => {
  await page.goto('/terms.html');
  await expect(page).toHaveTitle(/이용약관/);
  const body = page.locator('body');
  for (const t of ['간판다', '토스페이먼츠', '7일', '청약철회', 'support@ganpanda.co.kr', '김성범']) await expect(body).toContainText(t);
});

test('구독 칸에 이용약관·환불정책 링크', async ({ page, request }) => {
  await openOwnedProject(page, request, '약관 매장');
  await openSettings(page);
  const bill = page.getByTestId('billing-section');
  await expect(bill.getByTestId('billing-terms')).toHaveAttribute('href', '/terms');
  await expect(bill.getByTestId('billing-refund')).toHaveAttribute('href', '/refund');
});

test('첫 화면 아래 사업자 정보(상호·대표자·등록번호·주소·대표전화)와 요금제·약관·환불·개인정보 링크 — 로그인 전에도', async ({ page }) => {
  await page.goto('/');
  const f = page.getByTestId('site-footer');
  for (const t of ['가오낙스', '김성범', '271-79-00651', '2025-경기이천-0538', '경기도 이천시 부발읍 대산로 515-12 은행나무안채', '031-632-0907', 'support@ganpanda.co.kr']) await expect(f).toContainText(t);
  for (const href of ['/pricing', '/terms', '/refund', '/privacy']) await expect(f.locator(`a[href="${href}"]`)).toBeVisible();
});

test('요금제 페이지: 로그인 없이 상품·가격', async ({ page }) => {
  await page.goto('/pricing.html');
  await expect(page).toHaveTitle(/요금제/);
  for (const t of ['베이직', '월 30,000원', '프로', '월 60,000원', '토스페이먼츠', '배송']) await expect(page.locator('body')).toContainText(t);
});
