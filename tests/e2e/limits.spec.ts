import { expect, test } from '@playwright/test';
import { SERVER, apiCreateInvite, apiLogin, openInvited, openOwnedProject, uploadPhoto } from './helpers';

// 요금제 (2026-10-21 "무료사용 100mb로 변경해줘 그리고 동시접속은 2인으로 … 동시접속이라고 했는데 맴버가입수이다"): 한도 = 팀 멤버 수(무료 2명), 동시 접속은 막지 않는다. 무료 100MB·제안 월 3건
test('동시 접속은 막지 않는다: 무료여도 소유자가 작업 중일 때 직원(editor)·고객(viewer)이 함께 연결된다', async ({ page, request, browser }) => {
  const { session, projectId } = await openOwnedProject(page, request);
  await expect(page.getByTestId('sync-status')).toHaveAttribute('data-status', 'online');
  const viewer = await openInvited(browser, await apiCreateInvite(request, session, projectId, 'viewer'), '고객');
  const staff = await openInvited(browser, await apiCreateInvite(request, session, projectId, 'editor'), '직원');
  await expect(staff.getByTestId('sync-status')).toHaveAttribute('data-status', 'online', { timeout: 15000 });
  await expect(viewer.getByTestId('sync-status')).toHaveAttribute('data-status', 'online', { timeout: 15000 });
  await expect(page.getByTestId('peer')).toHaveCount(2); // 나 말고 함께 있는 두 사람
  await viewer.ctx.close(); await staff.ctx.close();
});

test('사진이 서버에 올라가고 소유자 사용량에 반영된다 (무료 100MB), 멤버 수·이번 달 제안 건수도 보인다', async ({ page, request }) => {
  await openOwnedProject(page, request);
  await uploadPhoto(page);
  await expect(page.getByTestId('photo-img')).toBeVisible();
  await page.getByTestId('account-menu').click();
  await expect(page.getByTestId('usage-storage')).not.toContainText('0 B');
  await expect(page.getByTestId('usage-storage')).toContainText('100 MB');
  await expect(page.getByTestId('usage-members')).toContainText('0 / 2명');
  await expect(page.getByTestId('usage-proposals')).toContainText('0 / 3건');
});

test('멤버 한도: 무료는 설정에서 멤버 2명까지, 3번째는 요금제 안내 (2026-10-21)', async ({ page, request }) => {
  await openOwnedProject(page, request);
  const emails = [0, 1, 2].map((i) => `mem${i}-${Math.random().toString(36).slice(2, 8)}@example.com`);
  for (const e of emails) await apiLogin(request, e);
  await page.getByTestId('open-settings').click();
  for (const e of emails.slice(0, 2)) { await page.getByTestId('member-email').fill(e); await page.getByTestId('member-add').click(); await expect(page.getByTestId('team-section')).toContainText(e); }
  await expect(page.getByTestId('usage-members')).toContainText('2 / 2명');
  await page.getByTestId('member-email').fill(emails[2]);
  await page.getByTestId('member-add').click();
  await expect(page.getByTestId('member-error')).toContainText('2명까지');
});

test('같은 아이디를 두 기기에서 동시에 쓰면 어느 쪽을 로그아웃할지 묻고, [다른 곳 로그아웃]이면 다른 기기는 로그아웃된다 (2026-10-21)', async ({ page, request, browser }) => {
  // 2026-10-21 사용자: "동시에 같은 아이디로 작동시 로그아웃 선택하도록 동시에 사용하지 않으면 로그인 유지"
  const { session } = await openOwnedProject(page, request);
  const email = (await (await request.get(`${SERVER}/api/me`, { headers: { authorization: `Bearer ${session}` } })).json()).account.email as string;
  const beat = (p: import('@playwright/test').Page) => p.evaluate(() => (window as unknown as { __ganpanda: { beatPresence(): Promise<void> } }).__ganpanda.beatPresence());
  await beat(page);
  await expect(page.getByTestId('session-conflict')).toHaveCount(0); // 혼자 쓰면 아무 일 없음
  // 다른 기기(다른 브라우저)에서 같은 아이디로 로그인
  const s2 = await apiLogin(request, email);
  const ctx = await browser.newContext();
  const other = await ctx.newPage();
  await other.goto('/');
  await other.evaluate((s) => { localStorage.setItem('ganpanda.session', s); localStorage.setItem('ganpanda.nickname', '다른기기'); }, s2);
  await other.goto('/');
  await expect(other.getByTestId('session-conflict')).toBeVisible();
  await beat(page);
  await expect(page.getByTestId('session-conflict')).toBeVisible();
  // 다른 기기에서 [다른 곳 로그아웃] → 이쪽은 다음 신호에서 로그아웃
  await other.getByTestId('conflict-logout-others').click();
  await expect(other.getByTestId('session-conflict')).toHaveCount(0);
  await beat(page);
  await expect(page.getByTestId('notice')).toContainText('다른 곳에서 로그아웃');
  await expect(page.getByTestId('session-conflict')).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('ganpanda.session'))).toBeNull();
  // 남은 기기는 로그인 그대로
  await other.reload();
  await expect(other.getByTestId('account-menu')).toBeVisible();
  await ctx.close();
});
