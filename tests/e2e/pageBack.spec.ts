// 요청 페이지·제안 페이지·받은 요청에 [← 돌아가기] (2026-10-25 사용자: "요청보기 내요청 미리보기 화면으로 이동후 돌아갈 방법이 없다" — 앱에는 브라우저 뒤로 가기가 없다)
import { expect, test } from '@playwright/test';
import { apiLogin, SERVER } from './helpers';

test('홈 → 내 견적 요청 → 요청 페이지 [← 돌아가기] = 홈으로; 링크로 바로 열면 [← 돌아가기] = 첫 화면', async ({ page, request }) => {
  const cust = await apiLogin(request);
  await request.post(`${SERVER}/api/estimate/project`, { data: {}, headers: { authorization: `Bearer ${cust}` } }); // 가게 사장 계정으로 (홈에 내 견적 요청이 뜬다)
  const { id, key } = await (await request.post(`${SERVER}/api/requests`, { data: { store: '뒤로 분식', address: '경기도 광주시 경안로 1', phone: `010${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`, general: true, floor: '1층' }, headers: { authorization: `Bearer ${cust}` } })).json();
  await page.goto('/');
  await page.evaluate((s) => { localStorage.clear(); localStorage.setItem('ganpanda.session', s); }, cust);
  await page.reload();
  await page.getByTestId('my-request-item').filter({ hasText: '뒤로 분식' }).click();
  await expect(page.getByTestId('request-page')).toContainText('뒤로 분식');
  await page.getByTestId('page-back').click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByTestId('my-request-item').first()).toBeVisible();
  // 링크로 바로 연 경우
  await page.goto(`/r/${id}?key=${key}`);
  await expect(page.getByTestId('request-page')).toContainText('뒤로 분식');
  await page.getByTestId('page-back').click();
  await expect(page).toHaveURL(/\/$/);
});

test('받은 요청 페이지에도 [← 홈]', async ({ page, request }) => {
  const shop = await apiLogin(request);
  await page.goto('/');
  await page.evaluate((s) => { localStorage.clear(); localStorage.setItem('ganpanda.session', s); }, shop);
  await page.goto('/requests');
  await expect(page.getByTestId('request-list')).toBeVisible();
  await expect(page.getByTestId('page-back')).toContainText('홈');
  await page.getByTestId('page-back').click();
  await expect(page).toHaveURL(/\/$/);
});
