// 홈: 선택 탭의 상태 바꾸기(진행·정지·완료) + 진행 목록 아래 외주·정지·완료 폴더(당구공 개수), 폴더 안 6개월 지난 것은 연도별 (2026-10-21, 2026-10-27)
import { expect, test, type Page } from '@playwright/test';
import { apiCreateProject, apiLogin } from './helpers';

const SERVER = 'http://localhost:8787';
async function openHome(page: Page, session: string) {
  await page.goto('/');
  await page.evaluate((s) => { localStorage.clear(); localStorage.setItem('ganpanda.session', s); }, session);
  await page.reload();
  await expect(page.getByTestId('project-list')).toBeVisible();
}

// 2026-10-27 "리스트 아래에 외주, 정지, 완료 순으로 메인 구성해주고 정지 완료 처리하면 이동하게 해줘 그리고 개수는 당구공으로 표시"
test('선택 탭으로 정지·완료하면 진행 목록에서 빠져 정지·완료 폴더로 옮겨 가고, 개수는 당구공 — 다시 진행하면 돌아온다', async ({ page, request }) => {
  const session = await apiLogin(request);
  await apiCreateProject(request, session, '카페 A');
  await apiCreateProject(request, session, '카페 B');
  await apiCreateProject(request, session, '카페 C');
  await openHome(page, session);
  const main = page.getByTestId('main-grid');
  await expect(main.getByTestId('project-item')).toHaveCount(3);
  await page.getByTestId('select-mode').click();
  await main.getByTestId('project-item').filter({ hasText: '카페 A' }).click();
  await main.getByTestId('project-item').filter({ hasText: '카페 B' }).click();
  await page.getByTestId('bar-status-paused').click();
  await expect(page.getByTestId('select-bar')).toHaveCount(0);
  await expect(main.getByTestId('project-item')).toHaveCount(1);
  const paused = page.getByTestId('folder-paused');
  await expect(paused.getByTestId('folder-count')).toHaveText('2');
  await expect(paused.getByTestId('project-item').first()).toBeHidden(); // 접혀 있음
  await page.getByTestId('select-mode').click();
  await main.getByTestId('project-item').filter({ hasText: '카페 C' }).click();
  await page.getByTestId('bar-status-done').click();
  await expect(main.getByTestId('project-item')).toHaveCount(0);
  await expect(page.getByTestId('folder-done').getByTestId('folder-count')).toHaveText('1');
  // 폴더 순서: 정지 → 완료 (외주는 없을 때 안 보임)
  await expect(page.locator('[data-testid^="folder-"]:not([data-testid="folder-count"])')).toHaveCount(2);
  // 정지 폴더를 열어 하나를 다시 진행 → 진행 목록으로
  await paused.locator('summary').first().click();
  await page.getByTestId('select-mode').click();
  await paused.getByTestId('project-item').filter({ hasText: '카페 A' }).click();
  await page.getByTestId('bar-status-ongoing').click();
  await expect(main.getByTestId('project-item')).toHaveCount(1);
  await expect(paused.getByTestId('folder-count')).toHaveText('1');
});

test('폴더 순서는 외주 · 정지 · 완료, 당구공은 동그란 숫자', async ({ page, request }) => {
  const session = await apiLogin(request);
  const a = await apiCreateProject(request, session, '외주 일');
  const b = await apiCreateProject(request, session, '멈춘 일');
  const c = await apiCreateProject(request, session, '끝난 일');
  const h = { authorization: `Bearer ${session}` };
  await request.patch(`${SERVER}/api/projects/${a}`, { data: { outsource: true }, headers: h });
  await request.patch(`${SERVER}/api/projects/${b}`, { data: { status: 'paused' }, headers: h });
  await request.patch(`${SERVER}/api/projects/${c}`, { data: { status: 'done' }, headers: h });
  await openHome(page, session);
  await expect(page.locator('details[data-testid^="folder-"]')).toHaveCount(3);
  const ids = await page.locator('details[data-testid^="folder-"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')));
  expect(ids).toEqual(['folder-outsource', 'folder-paused', 'folder-done']);
  const ball = page.getByTestId('folder-outsource').getByTestId('folder-count');
  await expect(ball).toHaveText('1');
  const box = (await ball.boundingBox())!;
  expect(Math.abs(box.width - box.height)).toBeLessThan(2); // 동그라미
  expect(await ball.evaluate((el) => getComputedStyle(el).borderRadius)).toMatch(/50%|999/);
});

test('정지·완료 폴더 안: 6개월 지난 것은 연도별로 다시 접힘, 진행 중은 아무리 오래돼도 진행 목록', async ({ page, request }) => {
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
  await expect(page.getByTestId('main-grid').getByTestId('project-item')).toHaveCount(2); // 새 프로젝트 + 옛 진행
  const done = page.getByTestId('folder-done');
  await expect(done.getByTestId('folder-count')).toHaveText('1');
  await done.locator('summary').first().click();
  const years = done.getByTestId('shelf-year');
  await expect(years).toHaveCount(1);
  await expect(years.first()).toHaveAttribute('data-year', '2024');
  await years.first().locator('summary').click();
  await expect(years.first().getByTestId('project-item')).toContainText('옛 완료 2024');
  await expect(years.first().getByTestId('project-item').getByTestId('project-dday')).toHaveText(/^D\+\d+$/); // 날짜는 D-day (2026-10-21)
  await expect(page.getByTestId('folder-paused').getByTestId('shelf-year')).toHaveAttribute('data-year', '2025');
});
