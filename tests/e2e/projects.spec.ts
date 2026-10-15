import { expect, test } from '@playwright/test';
import { apiCreateInvite, apiLogin, dragOnPhoto, openInvited, openObjectSettings, openOwnedProject, uploadPhoto } from './helpers';

test('로그인하면 내 프로젝트 목록이 보이고, 새 프로젝트를 만들어 들어간다', async ({ page, request }) => {
  const session = await apiLogin(request);
  await page.goto('/');
  await page.evaluate((s) => { localStorage.clear(); localStorage.setItem('ganpanda.session', s); }, session);
  await page.reload();
  await expect(page.getByTestId('project-list')).toBeVisible();
  await page.getByTestId('new-project-name').fill('간판다 카페');
  await page.getByTestId('new-project-submit').click();
  await expect(page).toHaveURL(/\?room=[A-Za-z0-9_-]{16}/);
  await expect(page.getByTestId('project-title')).toContainText('간판다 카페');
  await expect(page.getByTestId('sync-status')).toHaveAttribute('data-status', 'online');
  // 목록으로 돌아가면 방금 만든 프로젝트가 있다
  await page.getByTestId('go-projects').click();
  await expect(page.getByTestId('project-item')).toContainText('간판다 카페');
});

test('로그인 전에는 프로젝트 화면 대신 로그인 안내', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.getByTestId('login-button')).toBeVisible();
  await expect(page.getByTestId('project-list')).toHaveCount(0);
});

test('등록되지 않은 방이나 권한 없는 방은 안내 화면', async ({ page, request }) => {
  await page.goto('/?room=not-registered-room');
  await expect(page.getByTestId('access-denied')).toContainText('존재하지 않는');
  const session = await apiLogin(request);
  const other = await apiLogin(request);
  const { apiCreateProject } = await import('./helpers');
  const id = await apiCreateProject(request, other);
  await page.evaluate((s) => localStorage.setItem('ganpanda.session', s), session);
  await page.goto(`/?room=${id}`);
  await expect(page.getByTestId('access-denied')).toContainText('권한');
});

test('소유자가 초대 링크를 만들고 복사한다 (역할 선택)', async ({ page, request }) => {
  await openOwnedProject(page, request);
  await page.getByTestId('invite-button').click();
  await page.getByTestId('invite-role-viewer').click();
  await page.getByTestId('invite-create').click();
  const url = await page.getByTestId('invite-url').inputValue();
  expect(url).toMatch(/\?room=[A-Za-z0-9_-]{16}&invite=[A-Za-z0-9_-]{32,}/);
  await expect(page.getByTestId('invite-item')).toHaveCount(1);
  await expect(page.getByTestId('invite-item')).toContainText('보기');
  await page.getByTestId('invite-revoke').click();
  await expect(page.getByTestId('invite-item')).toContainText('폐기됨');
});

test('viewer 초대: 보고 대화할 수 있지만 편집은 못 한다', async ({ page, request, browser }) => {
  const { session, projectId } = await openOwnedProject(page, request);
  await uploadPhoto(page);
  await page.keyboard.press('t');
  await dragOnPhoto(page, [400, 200], [800, 300]);
  const url = await apiCreateInvite(request, session, projectId, 'viewer');
  const guest = await openInvited(browser, url);
  await expect(guest.getByTestId('role-badge')).toContainText('보기');
  await expect(guest.getByTestId('photo-img')).toBeVisible();
  await expect(guest.getByTestId('sign-shape')).toHaveCount(1);
  await expect(guest.getByTestId('tool-rect')).toHaveCount(0); // 그리기 도구 없음
  // 치수 입력 불가
  await guest.getByTestId('sign-shape').click();
  await openObjectSettings(guest);
  await expect(guest.getByTestId('width-mm')).toBeDisabled();
  await guest.keyboard.press('Escape');
  // 대화는 가능 → 소유자에게 도착
  await guest.getByTestId('chat-input').fill('가로 4m 맞나요?');
  await guest.getByTestId('chat-input').press('Enter');
  await expect(guest.getByTestId('chat-bubble')).toContainText('가로 4m 맞나요?');
  // 방금 그려 선택된 사인물은 가운데에 이동 핸들(매니퓰레이터)이 있다 → 핸들 없는 왼쪽 안쪽을 누른다
  await page.getByTestId('sign-shape').click({ position: { x: 30, y: 50 } });
  await expect(page.getByTestId('chat-bubble')).toContainText('가로 4m 맞나요?');
  await expect(page.getByTestId('chat-bubble')).not.toHaveClass(/mine/);
  await guest.ctx.close();
});

test('editor 초대: 편집이 소유자에게 반영된다', async ({ page, request, browser }) => {
  const { session, projectId } = await openOwnedProject(page, request);
  await uploadPhoto(page);
  const url = await apiCreateInvite(request, session, projectId, 'editor');
  const guest = await openInvited(browser, url, '디자이너');
  await expect(guest.getByTestId('role-badge')).toContainText('편집');
  await expect(guest.getByTestId('photo-img')).toBeVisible();
  await guest.keyboard.press('t');
  await dragOnPhoto(guest, [400, 200], [800, 300]);
  await expect(page.getByTestId('sign-shape')).toHaveCount(1);
  // 초대 링크는 새로고침해도 유지 (토큰은 주소에서 지워짐)
  await guest.reload();
  await expect(guest.getByTestId('sync-status')).toHaveAttribute('data-status', 'online');
  expect(guest.url()).not.toContain('invite=');
  await guest.ctx.close();
});
