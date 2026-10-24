// 가게 사장이 제안 목록에서 간판집 확정 (2026-10-22 "소비자가 간판집을 제안 리스트에서 확정을 선택하면 견적요청에서 사라지고 탈락한 업체의 복제된 프로젝트에 배지를 달아
// 다른 곳에서 진행하게 된것을 알린다. 다만 변심으로 다시 시작할 수 있음으로 정지 처리 안내한다.")
import { expect, test, type APIRequestContext } from '@playwright/test';
import { SERVER, apiLogin } from './helpers';

const auth = (s: string) => ({ authorization: `Bearer ${s}` });
async function shopProposal(request: APIRequestContext, id: string) {
  const s = await apiLogin(request);
  await request.put(`${SERVER}/api/me/request-settings`, { data: { receive: true, regions: ['경기 광주시'] }, headers: auth(s) });
  const { project } = await (await request.post(`${SERVER}/api/requests/${id}/respond`, { data: {}, headers: auth(s) })).json();
  await request.post(`${SERVER}/api/projects/${project.id}/invites`, { data: { role: 'viewer', kind: 'proposal' }, headers: auth(s) });
  return { s, project: project.id as string };
}

test('제안 목록에서 [확정] → 확정 표시, 떨어진 간판집은 홈 카드 "다른 업체 선택" + 정지, 프로젝트에 안내', async ({ page, request, browser }) => {
  const cust = await apiLogin(request);
  const store = `확정 ${Math.random().toString(36).slice(2, 6)}`;
  const { id } = await (await request.post(`${SERVER}/api/requests`, { data: { store, address: '경기도 광주시 경안로 1', phone: `010${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`, general: true, text: '빨리' }, headers: auth(cust) })).json();
  const a = await shopProposal(request, id), b = await shopProposal(request, id);
  await page.goto('/');
  await page.evaluate((s) => { localStorage.clear(); localStorage.setItem('ganpanda.session', s); }, cust);
  await page.goto(`/r/${id}`);
  await expect(page.getByTestId('request-proposal')).toHaveCount(2);
  page.once('dialog', (d) => d.accept());
  await page.locator(`[data-testid="request-proposal"]`).first().getByTestId('request-choose').click();
  await expect(page.getByTestId('request-chosen')).toHaveCount(1);
  await expect(page.getByTestId('request-status')).toHaveAttribute('data-status', 'approved');
  await expect(page.getByTestId('request-choose')).toHaveText('이 곳으로 바꾸기'); // 마음을 바꿀 수 있다
  // 떨어진 간판집 (먼저 보인 제안이 아닌 쪽)
  const chosen = await page.locator('[data-testid="request-proposal"][data-chosen]').locator('a.go').getAttribute('href');
  const loser = chosen!.includes(a.project) ? b : a;
  const ctx = await browser.newContext();
  const shop = await ctx.newPage();
  await shop.goto('/');
  await shop.evaluate((s) => { localStorage.clear(); localStorage.setItem('ganpanda.session', s); }, loser.s);
  await shop.reload();
  const card = shop.locator(`[data-testid="project-item"][data-id="${loser.project}"]`);
  await expect(card.getByTestId('project-lost')).toHaveText('다른 업체 선택');
  await expect(card).toHaveAttribute('data-status', 'paused');
  await card.click();
  await expect(shop.getByTestId('project-lost-banner')).toContainText('정지');
  await ctx.close();
});

test('복제 전 옛 요청도 [실측 보기]는 가게 사장의 프로젝트를 고칠 수 없게 연다 (2026-10-22 "실측보기 눌렀는데 프로젝트 안열린다")', async ({ page, request, browser }) => {
  const { uploadPhoto } = await import('./helpers');
  const cust = await apiLogin(request);
  await page.goto('/');
  await page.evaluate((s) => { localStorage.clear(); localStorage.setItem('ganpanda.session', s); }, cust);
  await page.goto('/estimate');
  await expect(page.getByTestId('sync-status')).toHaveAttribute('data-status', 'online');
  await uploadPhoto(page);
  await page.waitForTimeout(1500); // 사진이 서버에 올라가게
  const store = `옛 ${Math.random().toString(36).slice(2, 6)}`;
  // fromProject 없이 보낸 요청 = 옛 요청
  const { id } = await (await request.post(`${SERVER}/api/requests`, { data: { store, address: '경기도 광주시 경안로 1', phone: `010${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`, general: true }, headers: auth(cust) })).json();
  const s = await apiLogin(request);
  await request.put(`${SERVER}/api/me/request-settings`, { data: { receive: true, regions: ['경기 광주시'] }, headers: auth(s) });
  const ctx = await browser.newContext();
  const shop = await ctx.newPage();
  await shop.goto('/');
  await shop.evaluate((x) => { localStorage.clear(); localStorage.setItem('ganpanda.session', x); }, s);
  await shop.goto('/requests');
  await shop.locator(`[data-testid="request-item"][data-id="${id}"]`).getByTestId('request-view').click(); // 가게 이름은 제안 뒤 (2026-10-24)
  await expect(shop).toHaveURL(new RegExp(`request=${id}`));
  await expect(shop.getByTestId('request-bar')).toBeVisible({ timeout: 15_000 });
  await shop.getByTestId('request-sheet-toggle').click(); // 사진이 닫힌 요청은 리스트로 열린다 → 사진 보드
  await expect(shop.getByTestId('photo-locked').first()).toBeVisible({ timeout: 15_000 }); // 사진은 제안 뒤 (2026-10-24)
  await expect(shop.getByTestId('role-badge')).toHaveAttribute('data-role', 'viewer'); // 고칠 수 없다
  await ctx.close();
});
