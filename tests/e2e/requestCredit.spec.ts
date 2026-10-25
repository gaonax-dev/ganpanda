// 요청 크레딧 2단계 (2026-10-24 "등록 카드로 쓴 만큼", 월 한도 500만원): 제안 창의 크레딧 안내, 설정의 [카드만 등록]. 실제 결제는 서버 테스트(requestCredit.test.ts) — 로컬은 REQUEST_CREDITS 꺼짐(무료)
import { expect, test } from '@playwright/test';
import { apiLogin, apiSignup, openSettings, SERVER } from './helpers';

const auth = (s: string) => ({ authorization: `Bearer ${s}` });

test('요청에서 가져온 프로젝트의 제안 창에 크레딧 금액 — 정식 결제 전에는 무료 안내', async ({ page, request }) => {
  const cust = await apiLogin(request);
  const { id } = await (await request.post(`${SERVER}/api/requests`, { data: { store: '크레딧 김밥', address: '경기도 광주시 경안로 1', phone: `010${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`, general: true, floor: '1층', estimateTotal: 2_800_000 }, headers: auth(cust) })).json();
  const shop = await apiLogin(request);
  await request.put(`${SERVER}/api/me/request-settings`, { data: { receive: true, regions: ['경기 광주시'] }, headers: auth(shop) });
  const { project } = await (await request.post(`${SERVER}/api/requests/${id}/respond`, { data: { mode: 'blank' }, headers: auth(shop) })).json();
  await page.goto('/');
  await page.evaluate((s) => { localStorage.clear(); localStorage.setItem('ganpanda.session', s); localStorage.setItem('ganpanda.touchHelp', 'off'); }, shop);
  await page.goto(`/?room=${project.id}`);
  await expect(page.getByTestId('sync-status')).toHaveAttribute('data-status', 'online');
  await page.getByTestId('request-propose').click();
  const credit = page.getByTestId('proposal-credit');
  await expect(credit).toContainText('8,400원');
  await expect(credit).toContainText('가게 정보·연락처');
  await expect(credit).toContainText('정식 결제 전');
});

test('설정: 구독 없이 [카드만 등록] — 견적 요청 크레딧용, 구독 상태로 보이지 않는다', async ({ page, request }) => {
  test.setTimeout(60_000); // 카드 등록 → 돌아오기 → 설정 다시 열기 — 전체 실행 중 부하가 걸리면 30초를 넘겨 시간 초과가 났다 (2026-10-25)
  const s = await apiSignup(request, undefined, true); // 사업자 확인된 계정
  await page.goto('/');
  await page.evaluate((x) => { localStorage.clear(); localStorage.setItem('ganpanda.session', x); }, s);
  await page.reload();
  await openSettings(page);
  const bill = page.getByTestId('billing-section');
  await bill.getByTestId('billing-card-only').click();
  await expect(page.getByTestId('notice')).toContainText('결제 카드가 등록되었습니다', { timeout: 15_000 });
  await openSettings(page);
  await expect(bill.getByTestId('billing-card')).toContainText('테스트카드');
  await expect(bill.getByTestId('billing-status')).toHaveCount(0); // 구독은 아님
  await expect(bill.getByTestId('billing-subscribe-basic')).toBeVisible();
});
