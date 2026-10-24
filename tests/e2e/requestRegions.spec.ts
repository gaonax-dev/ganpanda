// 요청 받기 지역 (2026-10-24 사용자: "요청 지역설정을 사업자 주소로 먼저 설정하고 나머지는 원하는 지역을 설정할 수 있게 체크방식으로 해줘")
import { expect, test, type Page } from '@playwright/test';
import { openOwnedProject, openSettings } from './helpers';

const bno = () => {
  let nine = '5'; while (nine.length < 9) nine += String(Math.floor(Math.random() * 10));
  const w = [1, 3, 7, 1, 3, 7, 1, 3, 5]; let sum = 0;
  for (let i = 0; i < 9; i++) sum += Number(nine[i]) * w[i];
  sum += Math.floor((Number(nine[8]) * 5) / 10);
  return nine + String((10 - (sum % 10)) % 10);
};
const settingsOf = (page: Page) => page.evaluate(() => (window as unknown as { __ganpanda: { requestSettings: { regions: string[] } | null } }).__ganpanda.requestSettings);

test('사업장 주소의 지역이 기본(맨 앞), 다른 지역은 시·도를 골라 체크 — 저장하면 그대로', async ({ page, request }) => {
  await openOwnedProject(page, request, '지역 매장');
  await openSettings(page);
  const sec = page.getByTestId('business-section');
  await sec.getByTestId('biz-no').fill(bno());
  await sec.getByTestId('biz-owner').fill('홍길동');
  await sec.getByTestId('biz-start').fill('2020-01-05');
  await sec.getByTestId('biz-address').fill('경기도 광주시 경안로 1');
  await sec.getByTestId('biz-verify').click();
  await expect(sec.getByTestId('biz-verified')).toContainText('경기도 광주시 경안로 1');

  await page.getByTestId('settings-tab-requests').click();
  const req = page.getByTestId('requests-section');
  await expect(req.getByTestId('req-home')).toContainText('경기 광주시');
  await req.getByTestId('req-receive').check();
  await req.getByTestId('req-sido').selectOption('경기');
  const area = (r: string) => req.locator(`[data-testid="req-area"][data-region="${r}"]`);
  await expect(area('경기 광주시')).toBeChecked(); // 기본 지역은 늘 켜짐
  await expect(area('경기 광주시')).toBeDisabled();
  await area('경기 성남시').check();
  await req.getByTestId('req-sido').selectOption('서울');
  await area('서울 송파구').check();
  await expect(req.getByTestId('req-chip')).toHaveText(['경기 성남시 ✕', '서울 송파구 ✕']);
  await req.getByTestId('req-save').click();
  await expect(req.getByTestId('req-saved')).toContainText('저장');
  await expect.poll(async () => (await settingsOf(page))?.regions).toEqual(['경기 광주시', '경기 성남시', '서울 송파구']);
  // 칩 ✕ 로 빼기
  await req.getByTestId('req-chip').filter({ hasText: '경기 성남시' }).click();
  await req.getByTestId('req-save').click();
  await expect.poll(async () => (await settingsOf(page))?.regions).toEqual(['경기 광주시', '서울 송파구']);
});

test('사업장 주소가 없으면 안내 — 확인된 사업자에도 주소를 넣으면(다시 확인 없이) 기본 지역이 된다', async ({ page, request }) => {
  await openOwnedProject(page, request, '주소 없는 매장');
  await openSettings(page);
  const sec = page.getByTestId('business-section');
  await sec.getByTestId('biz-no').fill(bno());
  await sec.getByTestId('biz-owner').fill('홍길동');
  await sec.getByTestId('biz-start').fill('2020-01-05');
  await sec.getByTestId('biz-verify').click();
  await expect(sec.getByTestId('biz-verified')).toBeVisible();
  await page.getByTestId('settings-tab-requests').click();
  await expect(page.getByTestId('req-home-missing')).toBeVisible();
  await page.getByTestId('settings-tab-account').click();
  await sec.getByTestId('biz-address-edit').fill('서울특별시 송파구 올림픽로 300');
  await sec.getByTestId('biz-address-save').click();
  await expect(sec.getByTestId('biz-verified')).toContainText('서울특별시 송파구 올림픽로 300');
  await page.getByTestId('settings-tab-requests').click();
  await expect(page.getByTestId('req-home')).toContainText('서울 송파구');
});
