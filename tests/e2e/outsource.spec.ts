// 간판집의 외주 요청 (B2B) — 2026-10-22 사용자: "사업자도 요청을 올릴수 있다. 해당 내역도 헤더에 표시. 프로젝트 카드 선택에 다른업체에 외주요청 버튼을 누르면 외주폴더로 이동한다.
// 이제 외주 리스트에서 프로젝트를 열면 기본컬러 핫핑크로 하고 요청 버튼이 생긴다. 해당 건은 b2b로 표시 보여준다"
import { expect, test } from '@playwright/test';
import { apiCreateInvite, apiLogin, dragOnPhoto, openInvited, openOwnedProject, uploadPhoto, openSettings } from './helpers';

test('만들기에서 [외주] 를 체크하면 처음부터 외주 프로젝트 — 열리자마자 핫핑크 + [외주 요청] (2026-10-22 "만들기에서 외주체크하면 바로 생성할 수 있다")', async ({ page, request }) => {
  const session = await apiLogin(request);
  await page.goto('/');
  await page.evaluate((s) => { localStorage.clear(); localStorage.setItem('ganpanda.session', s); }, session);
  await page.reload();
  await page.getByTestId('new-project-name').fill('바로 외주');
  // 이름은 "다른 간판가게에 외주", 상세 칸 맨 아래 (2026-10-24 "오해의 소지가 있으니 … 최하단에")
  await expect(page.getByTestId('new-outsource-label')).toHaveText('다른 간판가게에 외주');
  const order = await page.getByTestId('new-project-details').evaluate((el) => [...el.querySelectorAll('[data-testid]')].map((e) => e.getAttribute('data-testid')).filter((t) => t !== 'new-project-close'));
  expect(order.slice(-2)).toEqual(['new-outsource', 'new-outsource-label']); // 연락처·주소·날짜·메모 다음 맨 아래
  await page.getByTestId('new-outsource').check();
  await page.getByTestId('new-project-submit').click();
  await expect(page.getByTestId('outsource-badge')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('outsource-request')).toBeVisible();
  expect(await accent(page)).toBe('#ff3d9a');
  await page.goto('/');
  await expect(page.getByTestId('outsource-folder')).toContainText('바로 외주');
});

const accent = (p: import('@playwright/test').Page) => p.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim());

test('⋯ → [다른 업체에 외주 요청] → 외주 폴더 → 열면 핫핑크 + [외주 요청] → 보내면 헤더 "보낸 요청" · 받는 간판집에는 B2B', async ({ page, request, browser }) => {
  const name = `외주 ${Math.random().toString(36).slice(2, 7)}`;
  const { projectId } = await openOwnedProject(page, request, name);
  await uploadPhoto(page);
  await page.keyboard.press('t');
  await dragOnPhoto(page, [300, 200], [700, 300]);
  await expect(page.getByTestId('outsource-request')).toHaveCount(0); // 외주 표시 전에는 없음
  await page.goto('/');
  const card = page.locator(`[data-testid="project-item"][data-id="${projectId}"]`);
  await card.getByTestId('project-menu').click();
  await page.getByTestId('details-outsource').click();
  const folder = page.getByTestId('outsource-folder');
  await expect(folder.locator(`[data-testid="project-item"][data-id="${projectId}"]`)).toBeVisible();
  // 외주 프로젝트를 열면 핫핑크 + B2B 외주 + [외주 요청]
  await folder.locator(`[data-testid="project-item"][data-id="${projectId}"]`).click();
  await expect(page.getByTestId('outsource-badge')).toBeVisible();
  expect(await accent(page)).toBe('#ff3d9a');
  await page.getByTestId('outsource-request').click();
  const dlg = page.getByTestId('estimate-dialog');
  await expect(dlg).toContainText('외주 견적 요청 (B2B)');
  await dlg.getByTestId('est-general').click();
  await dlg.getByTestId('est-store').fill(name);
  await dlg.getByTestId('est-address').fill('경기도 광주시 경안로 7');
  await dlg.getByTestId('est-phone').fill(`010-${String(Math.floor(Math.random() * 1e4)).padStart(4, '0')}-${String(Math.floor(Math.random() * 1e4)).padStart(4, '0')}`);
  await dlg.getByTestId('estimate-send').click();
  await expect(dlg.getByTestId('estimate-done-link')).toHaveValue(/\/r\//, { timeout: 20_000 });
  await dlg.getByTestId('estimate-close').click();
  await expect(page.getByTestId('estimate-locked')).toContainText('외주 요청 중');
  await expect(page.getByTestId('sign-shape')).toHaveCount(1); // 간판집 프로젝트는 계속 고칠 수 있다(잠금은 소비자만)
  // 헤더 "보낸 요청" → 보낸 요청 탭
  await page.goto('/');
  await expect(page.getByTestId('sent-count')).toHaveText('1');
  await page.getByTestId('request-sent-link').click();
  await expect(page).toHaveURL(/\/requests\?tab=sent$/);
  await expect(page.getByTestId('request-sent-link')).toHaveCount(0); // 받은 요청 페이지 안에서는 헤더 링크를 감춘다 (2026-10-22)
  await expect(page.getByTestId('request-inbox-link')).toHaveCount(0);
  await expect(page.getByTestId('sent-item').filter({ hasText: name })).toContainText('B2B');
  // 받는 간판집: B2B 표시
  const ctx = await browser.newContext();
  const shop = await ctx.newPage();
  const s2 = await apiLogin(request);
  await shop.goto('/');
  await shop.evaluate((s) => localStorage.setItem('ganpanda.session', s), s2);
  await shop.reload();
  await openSettings(shop);
  await shop.getByTestId('settings-tab-requests').click();
  await shop.getByTestId('req-receive').check();
  await shop.getByTestId('req-sido').selectOption('경기'); // 지역은 체크 (2026-10-24)
  await shop.locator('[data-testid="req-area"][data-region="경기 광주시"]').check();
  await shop.getByTestId('req-save').click();
  await expect(shop.getByTestId('req-saved')).toContainText('저장');
  await shop.getByTestId('close-settings').click();
  await shop.getByTestId('request-inbox-link').click();
  const item = shop.getByTestId('request-item').filter({ hasText: name });
  await expect(item.getByTestId('request-b2b')).toHaveText('B2B');
  await item.click();
  await expect(shop.getByTestId('request-bar').getByTestId('request-b2b')).toBeVisible({ timeout: 15_000 });
  expect(await accent(shop)).toBe('#3b82f6'); // 받는 간판집의 실측 보기(요청 보드)는 파랑 (2026-10-22)
  await ctx.close();
});

test('고객(제안 링크)에게는 외주 표시·핫핑크가 없다 (2026-10-24 "외주표시가 고객에게도 있다")', async ({ page, request, browser }) => {
  const { session, projectId } = await openOwnedProject(page, request, '고객에겐 비밀');
  await uploadPhoto(page);
  await page.goto('/');
  await page.locator(`[data-testid="project-item"][data-id="${projectId}"]`).getByTestId('project-menu').click();
  await page.getByTestId('details-outsource').click();
  await expect(page.getByTestId('outsource-folder')).toContainText('고객에겐 비밀');
  await page.goto(`/?room=${projectId}`);
  await expect(page.getByTestId('outsource-badge')).toBeVisible();
  const url = await apiCreateInvite(request, session, projectId, 'viewer');
  const token = new URL(url).searchParams.get('invite')!;
  const guest = await openInvited(browser, `http://localhost:5199/?room=${projectId}&invite=${token}&proposal=1`, '손님');
  await expect(guest.getByTestId('proposal-page')).toBeVisible();
  await expect(guest.getByTestId('outsource-badge')).toHaveCount(0);
  expect(await guest.evaluate(() => document.documentElement.classList.contains('outsource'))).toBe(false);
});
