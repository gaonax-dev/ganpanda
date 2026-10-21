// 사업자 확인 (2026-10-21 결정): 설정 "계정" 탭에서 번호·대표자명·개업일 → 국세청(로컬은 .dev.vars NTS_API_KEY=fake: 대표자명 홍길동 = 일치) → 제안 페이지 배지
import { expect, test } from '@playwright/test';
import { apiCreateInvite, openInvited, openOwnedProject } from './helpers';

/** 검증 자릿수 맞는 번호 — 로컬 D1 은 실행 사이에 남으므로 매번 새 번호 */
const bno = (prefix = '') => {
  let nine = prefix; while (nine.length < 9) nine += String(Math.floor(Math.random() * 10));
  const w = [1, 3, 7, 1, 3, 7, 1, 3, 5]; let sum = 0;
  for (let i = 0; i < 9; i++) sum += Number(nine[i]) * w[i];
  sum += Math.floor((Number(nine[8]) * 5) / 10);
  return nine + String((10 - (sum % 10)) % 10);
};
const dash = (n: string) => `${n.slice(0, 3)}-${n.slice(3, 5)}-${n.slice(5)}`;

test('사업자 확인: 일치하면 계정에 붙고, 틀리면 안내, 뗄 수 있다; 제안 페이지에 "사업자 확인" 배지', async ({ page, request, browser }) => {
  const { session, projectId } = await openOwnedProject(page, request, '배지 매장');
  await page.getByTestId('open-settings').click();
  const sec = page.getByTestId('business-section');
  const no = bno('2');
  await sec.getByTestId('biz-no').fill(no);
  await expect(sec.getByTestId('biz-no')).toHaveValue(dash(no)); // 자동 하이픈
  await sec.getByTestId('biz-owner').fill('김철수');
  await sec.getByTestId('biz-start').fill('2020-01-05');
  await sec.getByTestId('biz-name').fill('배지 간판');
  await sec.getByTestId('biz-verify').click();
  await expect(sec.getByTestId('biz-error')).toContainText('일치하지 않습니다');
  await sec.getByTestId('biz-owner').fill('홍길동');
  await sec.getByTestId('biz-verify').click();
  await expect(sec.getByTestId('biz-verified')).toContainText('배지 간판');
  await expect(sec.getByTestId('biz-verified')).toContainText(dash(no));
  await expect(sec.getByTestId('biz-verified')).toContainText('계속사업자');
  await page.getByTestId('close-settings').click();

  // 고객이 보는 제안 페이지: 사업자 확인 배지
  const url = await apiCreateInvite(request, session, projectId, 'viewer');
  const token = new URL(url).searchParams.get('invite')!;
  const guest = await openInvited(browser, `http://localhost:5199/?room=${projectId}&invite=${token}&proposal=1`, '손님');
  await expect(guest.getByTestId('proposal-business')).toContainText('사업자 확인');
  await expect(guest.getByTestId('proposal-business')).toContainText('배지 간판');

  // 떼기
  await page.getByTestId('open-settings').click();
  page.once('dialog', (d) => d.accept());
  await sec.getByTestId('biz-remove').click();
  await expect(sec.getByTestId('biz-no')).toBeVisible();
});

test('폐업 상태로 나오면 그대로 알려 준다 (fake: 999 로 시작)', async ({ page, request }) => {
  await openOwnedProject(page, request, '폐업 매장');
  await page.getByTestId('open-settings').click();
  const sec = page.getByTestId('business-section');
  await sec.getByTestId('biz-no').fill(bno('999'));
  await sec.getByTestId('biz-owner').fill('홍길동');
  await sec.getByTestId('biz-start').fill('2020-01-05'); // 날짜 입력기 (2026-10-21 "날짜입력기 사용해줘")
  await sec.getByTestId('biz-verify').click();
  await expect(sec.getByTestId('biz-verified')).toContainText('폐업');
});
