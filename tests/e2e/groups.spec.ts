import { expect, test } from '@playwright/test';
import { apiCreateProject, apiLogin } from './helpers';

async function openHome(page: import('@playwright/test').Page, session: string) {
  await page.goto('/');
  await page.evaluate((s) => { localStorage.clear(); localStorage.setItem('ganpanda.session', s); }, session);
  await page.reload();
  await expect(page.getByTestId('project-list')).toBeVisible();
}

test('그룹: 만들고 프로젝트를 넣고 상태·정산을 고치면 계산서 합계가 한눈에, 다 받으면 총금액만, 세부는 리스트 뷰 링크', async ({ page, request }) => {
  const session = await apiLogin(request);
  await apiCreateProject(request, session, '카페 A');
  await apiCreateProject(request, session, '카페 B');
  await openHome(page, session);
  await page.getByTestId('new-group-name').fill('강남 묶음');
  await page.getByTestId('new-group-submit').click();
  const group = page.getByTestId('group');
  await expect(group).toHaveCount(1);
  await expect(group).toContainText('강남 묶음');
  // 그룹 없는 프로젝트를 그룹에 넣기
  const groupId = await group.getAttribute('data-id');
  await page.getByTestId('project-group').first().selectOption(groupId!);
  await expect(group.getByTestId('group-project')).toHaveCount(1);
  await page.getByTestId('project-group').first().selectOption(groupId!);
  await expect(group.getByTestId('group-project')).toHaveCount(2);
  await expect(page.getByTestId('project-item')).toHaveCount(0);
  // 상태·정산
  const row = group.getByTestId('group-project').filter({ hasText: '카페 A' });
  await row.getByTestId('project-status').selectOption('ongoing');
  await expect(row).toHaveAttribute('data-status', 'ongoing');
  await row.getByTestId('contract-amount').fill('1500000');
  await row.getByTestId('contract-amount').press('Enter');
  await expect(row.getByTestId('settle')).toContainText('0원 / 1,500,000원');
  await row.getByTestId('paid-amount').fill('500000');
  await row.getByTestId('paid-amount').press('Enter');
  await expect(row.getByTestId('settle')).toContainText('500,000원 / 1,500,000원');
  await expect(group.getByTestId('group-totals')).toContainText('미수 1,000,000원');
  await expect(group.getByTestId('group-totals')).toContainText('500,000원 / 1,500,000원');
  // 다 받으면 총금액만
  await row.getByTestId('paid-amount').fill('1500000');
  await row.getByTestId('paid-amount').press('Enter');
  await expect(row.getByTestId('settle')).toHaveText('총 1,500,000원');
  await expect(group.getByTestId('group-totals')).toContainText('미수 0원');
  // 세부 내역은 프로젝트의 리스트 뷰로
  await expect(row.locator('a')).toHaveAttribute('href', /view=list/);
  await row.locator('a').click();
  await expect(page.getByTestId('view-list')).toHaveClass(/on/);
});

test('멤버: 오너가 이메일로 추가하고, 정산 보기는 오너가 허용해야 보인다', async ({ page, browser, request }) => {
  const owner = await apiLogin(request);
  const memberEmail = `member-${Math.random().toString(36).slice(2, 8)}@example.com`;
  const member = await apiLogin(request, memberEmail);
  const pid = await apiCreateProject(request, owner, '본점');
  await openHome(page, owner);
  await page.getByTestId('new-group-name').fill('본사 발주');
  await page.getByTestId('new-group-submit').click();
  const group = page.getByTestId('group');
  const groupId = (await group.getAttribute('data-id'))!;
  await page.getByTestId('project-group').first().selectOption(groupId);
  await expect(group.getByTestId('group-project')).toHaveCount(1);
  await page.getByTestId('member-email').fill(memberEmail);
  await page.getByTestId('member-add').click();
  await expect(group.getByTestId('group-member')).toHaveCount(1);
  // 멤버 화면: 그룹과 프로젝트·상태는 보이지만 정산은 안 보인다
  const ctx = await browser.newContext();
  const mp = await ctx.newPage();
  await openHome(mp, member);
  await expect(mp.getByTestId('group')).toContainText('본사 발주');
  await expect(mp.getByTestId('group-project')).toContainText('본점');
  await expect(mp.getByTestId('settle')).toHaveCount(0);
  await expect(mp.getByTestId('project-status')).toHaveCount(0); // 상태 변경은 오너만
  // 오너가 정산 보기를 허용
  await group.getByTestId('member-billing').check();
  await mp.reload();
  await expect(mp.getByTestId('settle')).toHaveCount(1);
  await ctx.close();
  void pid;
});
