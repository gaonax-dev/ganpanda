// 기기 자료로 먼저 열기 (2026-10-27 사용자: "프로젝트 로딩이 너무 느리다 … 로컬에 자료를 가지고 있으면" → "프로젝트 오픈에도 한참 걸린다 아무것도 없는데" → "남은 것에 답이 있었네 진행해줘")
// 한 번 연 프로젝트는 서버 권한 확인을 기다리지 않고 기기 문서로 바로 열고, 확인은 뒤에서. 권한이 없어졌으면 닫고 기기 사본을 지운다
import { expect, test, type Page } from '@playwright/test';
import { apiCreateProject, apiLogin, openOwnedProject, uploadPhoto } from './helpers';

/** 서버 권한 확인(/access)을 오래 붙잡는다 */
const holdAccess = (page: Page, ms: number) => page.route(/\/api\/projects\/[^/]+\/access/, async (r) => { await new Promise((ok) => setTimeout(ok, ms)); await r.continue().catch(() => {}); });

test('한 번 연 프로젝트는 서버 권한 확인이 느려도 기기 문서·사진으로 바로 열린다', async ({ page, request }) => {
  await openOwnedProject(page, request, '바로 열기');
  await uploadPhoto(page);
  await expect(page.getByTestId('photo-img')).toBeVisible();
  await page.waitForTimeout(800);
  await holdAccess(page, 8000);
  await page.reload();
  await expect(page.getByTestId('photo-img')).toBeVisible({ timeout: 3000 });
  await expect(page.getByText('프로젝트 확인 중…')).toHaveCount(0);
  await page.unrouteAll({ behavior: 'ignoreErrors' });
});

test('인터넷이 끊겨도(권한 확인 실패) 한 번 연 프로젝트는 기기에서 열린다', async ({ page, request }) => {
  await openOwnedProject(page, request, '오프라인 열기');
  await uploadPhoto(page);
  await expect(page.getByTestId('photo-img')).toBeVisible();
  await page.waitForTimeout(800);
  await page.route(/\/api\/projects\/[^/]+\/access/, (r) => r.abort('internetdisconnected'));
  await page.reload();
  await expect(page.getByTestId('photo-img')).toBeVisible({ timeout: 3000 });
  await expect(page.getByTestId('access-denied')).toHaveCount(0);
});

test('뒤에서 확인해 보니 권한이 없어졌으면(403·404) 닫고 기기 사본을 지운다', async ({ page, request }) => {
  const { projectId } = await openOwnedProject(page, request, '권한 잃음');
  await uploadPhoto(page);
  await expect(page.getByTestId('photo-img')).toBeVisible();
  await page.waitForTimeout(800);
  await page.route(/\/api\/projects\/[^/]+\/access/, (r) => r.fulfill({ status: 404, body: 'no access' }));
  await page.reload();
  await expect(page.getByTestId('access-denied')).toBeVisible({ timeout: 5000 });
  await expect(page.getByTestId('photo-img')).toHaveCount(0);
  await expect.poll(() => page.evaluate((id) => localStorage.getItem(`ganpanda.access.${id}`), projectId)).toBeNull();
  // 기기 문서도 지워졌다
  await expect.poll(() => page.evaluate((id) => indexedDB.databases().then((d) => d.some((x) => x.name === `ganpanda-${id}`)), projectId)).toBe(false);
});

test('사진 없는 프로젝트를 다시 열면 서버 동기화를 기다리지 않고 바로 빈 화면(사진 추가)', async ({ page, request }) => {
  await openOwnedProject(page, request, '빈 다시');
  await expect(page.getByTestId('photo-empty')).toBeVisible();
  await page.routeWebSocket(/\/rooms\//, () => { /* 동기화 안 됨 */ });
  await page.reload();
  await expect(page.getByTestId('photo-empty')).toBeVisible({ timeout: 1500 });
});

test('홈 프로젝트 목록은 기기에 저장해 두었다가 서버보다 먼저 보여 준다', async ({ page, request }) => {
  const session = await apiLogin(request);
  await apiCreateProject(request, session, '목록 기억');
  await page.goto('/');
  await page.evaluate((s) => { localStorage.clear(); localStorage.setItem('ganpanda.session', s); localStorage.setItem('ganpanda.touchHelp', 'off'); }, session);
  await page.reload();
  await expect(page.getByTestId('project-item').filter({ hasText: '목록 기억' })).toBeVisible();
  await page.route(/\/api\/(me|projects|groups)(\?|$)/, async (r) => { await new Promise((ok) => setTimeout(ok, 8000)); await r.continue().catch(() => {}); });
  await page.reload();
  await expect(page.getByTestId('project-item').filter({ hasText: '목록 기억' })).toBeVisible({ timeout: 2500 });
  await page.unrouteAll({ behavior: 'ignoreErrors' });
});
