// 결제 (2026-10-23 토스 자동결제): 설정 "계정 · 구독"에서 [베이직 구독] → 카드 등록(로컬은 .dev.vars TOSS_SECRET_KEY=fake — 토스 창 없이 바로 돌아옴) → 첫 달 결제 → 요금제.
// 해지 = 기간 끝까지, 해지 취소, 다음 결제일부터 요금제 변경. 사업자 확인이 먼저
import { expect, test, type Page } from '@playwright/test';
import { openOwnedProject, openSettings } from './helpers';

const bno = () => {
  let nine = '3'; while (nine.length < 9) nine += String(Math.floor(Math.random() * 10));
  const w = [1, 3, 7, 1, 3, 7, 1, 3, 5]; let sum = 0;
  for (let i = 0; i < 9; i++) sum += Number(nine[i]) * w[i];
  sum += Math.floor((Number(nine[8]) * 5) / 10);
  return nine + String((10 - (sum % 10)) % 10);
};
async function verifyBusiness(page: Page) {
  const sec = page.getByTestId('business-section');
  await sec.getByTestId('biz-no').fill(bno());
  await sec.getByTestId('biz-owner').fill('홍길동');
  await sec.getByTestId('biz-start').fill('2020-01-05');
  await sec.getByTestId('biz-verify').click();
  await expect(sec.getByTestId('biz-verified')).toBeVisible();
}

test('구독: 사업자 확인 → [베이직 구독] → 카드 등록 → 결제 → 베이직, 해지 예약·취소, 다음 결제일부터 프로', async ({ page, request }) => {
  await openOwnedProject(page, request, '구독 매장');
  await openSettings(page);
  const bill = page.getByTestId('billing-section');
  await expect(bill.getByTestId('billing-test')).toBeVisible(); // 테스트 결제 안내
  // 사업자 확인 전에는 구독 단추 대신 안내
  await expect(bill.getByTestId('billing-need-business')).toBeVisible();
  await expect(bill.getByTestId('billing-subscribe-basic')).toHaveCount(0);
  await verifyBusiness(page);
  await expect(bill.getByTestId('billing-subscribe-basic')).toContainText('30,000원');
  await bill.getByTestId('billing-subscribe-basic').click();
  // 카드 등록 창 → 돌아와서 결제 → 설정 "계정"이 다시 열린다
  await expect(page.getByTestId('notice')).toContainText('베이직 요금제가 시작되었습니다', { timeout: 15_000 });
  await openSettings(page);
  await expect(page.getByTestId('plan')).toContainText('베이직');
  await expect(bill.getByTestId('billing-status')).toContainText('다음 결제일');
  await expect(bill.getByTestId('billing-card')).toContainText('테스트카드');
  await expect(bill.getByTestId('billing-history')).toContainText('30,000원');
  expect(page.url()).not.toContain('authKey'); // 주소에서 결제 인자 제거
  // 다음 결제일부터 프로
  await bill.getByTestId('billing-next-plan').selectOption('pro');
  await expect(bill.getByTestId('billing-status')).toContainText('다음 결제일부터 프로');
  // 해지 예약 → 해지 취소
  page.once('dialog', (d) => d.accept());
  await bill.getByTestId('billing-cancel').click();
  await expect(bill.getByTestId('billing-status')).toContainText('해지 예약');
  await bill.getByTestId('billing-resume').click();
  await expect(bill.getByTestId('billing-status')).not.toContainText('해지 예약');
});

test('카드 등록이 취소·실패하면 요금제는 그대로, 안내', async ({ page, request }) => {
  await openOwnedProject(page, request, '구독 실패 매장');
  await page.goto(page.url() + '&billing=fail&code=PAY_PROCESS_CANCELED&message=' + encodeURIComponent('사용자가 결제를 취소했습니다'));
  await expect(page.getByTestId('notice')).toContainText('사용자가 결제를 취소했습니다');
  expect(page.url()).not.toContain('billing=');
});
