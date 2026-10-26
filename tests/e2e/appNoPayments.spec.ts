// 결제는 오직 웹으로 (2026-10-26 사용자: "알았어 결제는 오직 웹으로만") — 앱스토어 3.1.1: 앱(Tauri) 안에서는 구독·카드 등록·크레딧 금액·요금제 링크·업그레이드 유도를 보이지 않는다.
// 심사 때와 출시 뒤가 같아야 한다(서버 설정으로 켜지 않는다) — 이 테스트가 그 규칙을 지킨다
import { expect, test, type Page } from '@playwright/test';
import { apiLogin, openSettings, SERVER } from './helpers';

const auth = (s: string) => ({ authorization: `Bearer ${s}` });
const asApp = (page: Page) => page.addInitScript(() => { (window as unknown as { __GANPANDA_APP__: boolean }).__GANPANDA_APP__ = true; });

async function requestProject(request: import('@playwright/test').APIRequestContext) {
  const cust = await apiLogin(request);
  const { id } = await (await request.post(`${SERVER}/api/requests`, { data: { store: '앱 김밥', address: '경기도 광주시 경안로 1', phone: `010${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`, general: true, floor: '1층', estimateTotal: 2_800_000 }, headers: auth(cust) })).json();
  const shop = await apiLogin(request);
  await request.put(`${SERVER}/api/me/request-settings`, { data: { receive: true, regions: ['경기 광주시'] }, headers: auth(shop) });
  return { id, shop };
}
const login = async (page: Page, s: string, path = '/') => {
  await page.goto('/');
  await page.evaluate((x) => { localStorage.clear(); localStorage.setItem('ganpanda.session', x); localStorage.setItem('ganpanda.touchHelp', 'off'); }, s);
  await page.goto(path);
};

test('앱 안: 설정에 구독·카드 칸 없음, 계정 메뉴에 요금제 링크 없음, 받은 요청·제안 창에 크레딧 금액·카드 안내 없음', async ({ page, request }) => {
  await asApp(page);
  const { id, shop } = await requestProject(request);
  await login(page, shop);
  await openSettings(page);
  await expect(page.getByTestId('settings')).toBeVisible();
  await expect(page.getByTestId('billing-section')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await page.goto('/');
  await page.getByTestId('account-menu').click();
  await expect(page.getByTestId('account-legal')).toContainText('이용약관');
  await expect(page.getByTestId('account-legal')).not.toContainText('요금제');
  // 받은 요청: 크레딧 금액 없음
  await page.goto('/requests');
  await expect(page.locator(`[data-testid="request-item"][data-id="${id}"]`)).toBeVisible();
  await expect(page.getByTestId('request-fee')).toHaveCount(0);
  // 요청에서 가져온 프로젝트의 제안 창: 크레딧·카드 안내 없음
  const { project } = await (await request.post(`${SERVER}/api/requests/${id}/respond`, { data: { mode: 'blank' }, headers: auth(shop) })).json();
  await page.goto(`/?room=${project.id}`);
  await expect(page.getByTestId('sync-status')).toHaveAttribute('data-status', 'online');
  await page.getByTestId('request-propose').click();
  await expect(page.getByTestId('proposal-dialog')).toBeVisible();
  await expect(page.getByTestId('proposal-credit')).toHaveCount(0);
  await expect(page.getByTestId('proposal-dialog')).not.toContainText('크레딧');
  await expect(page.getByTestId('proposal-dialog')).not.toContainText('카드');
});

test('웹(브라우저)에서는 그대로: 설정의 구독 칸, 요금제 링크, 받은 요청의 크레딧 금액', async ({ page, request }) => {
  const { id, shop } = await requestProject(request);
  await login(page, shop);
  await openSettings(page);
  await expect(page.getByTestId('billing-section')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.goto('/');
  await page.getByTestId('account-menu').click();
  await expect(page.getByTestId('account-legal')).toContainText('요금제');
  await page.goto('/requests');
  await expect(page.locator(`[data-testid="request-item"][data-id="${id}"]`).getByTestId('request-fee')).toContainText('8,400원');
});
