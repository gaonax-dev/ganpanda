// 홈: 선택 탭의 상태 바꾸기(진행·정지·완료) + 정지·완료 6개월 지난 프로젝트는 "지난 프로젝트" 접힘 → 연도별 접힘 (2026-10-21)
import { expect, test, type Page } from '@playwright/test';
import { apiCreateProject, apiLogin } from './helpers';

const SERVER = 'http://localhost:8787';
async function openHome(page: Page, session: string) {
  await page.goto('/');
  await page.evaluate((s) => { localStorage.clear(); localStorage.setItem('ganpanda.session', s); }, session);
  await page.reload();
  await expect(page.getByTestId('project-list')).toBeVisible();
}

test('선택 탭 [진행 · 정지 · 완료]로 고른 프로젝트의 상태를 한 번에 바꾼다', async ({ page, request }) => {
  const session = await apiLogin(request);
  await apiCreateProject(request, session, '카페 A');
  await apiCreateProject(request, session, '카페 B');
  await openHome(page, session);
  await page.getByTestId('select-mode').click();
  await page.getByTestId('project-item').nth(0).click();
  await page.getByTestId('project-item').nth(1).click();
  await page.getByTestId('bar-status-paused').click();
  await expect(page.getByTestId('select-bar')).toHaveCount(0);
  await expect(page.locator('[data-testid="project-item"][data-status="paused"]')).toHaveCount(2);
  await expect(page.getByTestId('project-item').first()).toContainText('정지');
  await page.getByTestId('select-mode').click();
  await page.getByTestId('project-item').nth(0).click();
  await page.getByTestId('bar-status-ongoing').click();
  await expect(page.locator('[data-testid="project-item"][data-status="ongoing"]')).toHaveCount(1);
  await expect(page.getByTestId('shelf')).toHaveCount(0); // 방금 바꾼 건 접히지 않는다
});

test('정지·완료 6개월 지난 프로젝트는 "지난 프로젝트" 아래 연도별 접힘, 진행 중은 아무리 오래돼도 보인다', async ({ page, request }) => {
  const session = await apiLogin(request);
  const a = await apiCreateProject(request, session, '옛 완료 2024');
  const b = await apiCreateProject(request, session, '옛 정지 2025');
  const c = await apiCreateProject(request, session, '옛 진행');
  await apiCreateProject(request, session, '새 프로젝트');
  const h = { authorization: `Bearer ${session}` };
  const old = (iso: string) => new Date(iso).getTime();
  await request.patch(`${SERVER}/api/projects/${a}`, { data: { status: 'done', statusAt: old('2024-05-01') }, headers: h }); // 개발 모드 statusAt
  await request.patch(`${SERVER}/api/projects/${b}`, { data: { status: 'paused', statusAt: old('2025-02-01') }, headers: h });
  await request.patch(`${SERVER}/api/projects/${c}`, { data: { status: 'ongoing', statusAt: old('2020-01-01') }, headers: h });
  await openHome(page, session);
  const list = page.getByTestId('project-list');
  await expect(list.locator('.grid').first().getByTestId('project-item')).toHaveCount(2); // 새 프로젝트 + 옛 진행
  const shelf = page.getByTestId('shelf');
  await expect(shelf).toContainText('지난 프로젝트');
  await expect(shelf).toContainText('2개');
  await expect(shelf.getByTestId('project-item').first()).toBeHidden(); // 접혀 있음 (DOM 에는 있고 안 보임)
  await shelf.locator('summary').first().click();
  const years = shelf.getByTestId('shelf-year');
  await expect(years).toHaveCount(2);
  await expect(years.nth(0)).toHaveAttribute('data-year', '2025'); // 최근 연도 먼저
  await expect(years.nth(1)).toHaveAttribute('data-year', '2024');
  await years.nth(1).locator('summary').click();
  await expect(years.nth(1).getByTestId('project-item')).toContainText('옛 완료 2024');
  await expect(years.nth(1).getByTestId('project-item').getByTestId('project-dday')).toHaveText(/^D\+\d+$/); // 날짜는 D-day (2026-10-21)
});
