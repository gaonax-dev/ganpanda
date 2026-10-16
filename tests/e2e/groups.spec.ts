import { expect, test } from '@playwright/test';
import { apiCreateProject, apiLogin, openOwnedProject } from './helpers';

async function openHome(page: import('@playwright/test').Page, session: string) {
  await page.goto('/');
  await page.evaluate((s) => { localStorage.clear(); localStorage.setItem('ganpanda.session', s); }, session);
  await page.reload();
  await expect(page.getByTestId('project-list')).toBeVisible();
}
/** 상단 [○ 선택] → 카드 두 개를 고르고 하단 탭 [그룹] → 이름 → 만들기 */
async function makeGroup(page: import('@playwright/test').Page, name: string) {
  await page.getByTestId('select-mode').click();
  const cards = page.getByTestId('project-item');
  await cards.nth(0).click();
  await cards.nth(1).click();
  await expect(page.locator('[data-testid="project-item"].sel')).toHaveCount(2);
  await expect(page.getByTestId('select-bar')).toContainText('2개 선택');
  await page.getByTestId('bar-group').click();
  await page.getByTestId('group-name').fill(name);
  await page.getByTestId('group-create').click();
  await expect(page.getByTestId('group')).toHaveCount(1);
  await expect(page.getByTestId('select-bar')).toHaveCount(0); // 선택 모드 종료
}

test('[선택] 토글로 고르고 하단 탭 [그룹]. 그룹은 겹친 카드로 보이고 누르면 계산서가 펼쳐진다. 금액은 눌러서 입력, 완납이면 총금액만', async ({ page, request }) => {
  const session = await apiLogin(request);
  await apiCreateProject(request, session, '카페 A');
  await apiCreateProject(request, session, '카페 B');
  await openHome(page, session);
  await makeGroup(page, '강남 묶음');
  const group = page.getByTestId('group');
  await expect(group).toContainText('강남 묶음');
  await expect(group).toContainText('프로젝트 2개');
  await expect(page.getByTestId('project-item')).toHaveCount(0); // 그룹에 들어간 프로젝트는 밖에 없다
  // 막 만든 그룹은 펼쳐져 있다. 누르면 접히고 다시 누르면 펼쳐진다
  const bill = page.getByTestId('group-bill');
  await expect(bill).toBeVisible();
  await group.click();
  await expect(page.getByTestId('group-bill')).toHaveCount(0);
  await group.click();
  await expect(bill).toBeVisible();
  await expect(bill.getByTestId('group-project')).toHaveCount(2);
  const row = bill.getByTestId('group-project').filter({ hasText: '카페 A' });
  // 상태
  await row.getByTestId('project-status').selectOption('ongoing');
  await expect(row).toHaveAttribute('data-status', 'ongoing');
  // 계약 금액은 자동(견적 합계, 아직 0) → 눌러서 직접 입력 → 자동 계산 복구 버튼
  await expect(row.getByTestId('contract')).toHaveAttribute('data-auto', 'true');
  await row.getByTestId('contract').click();
  await row.getByTestId('contract-input').fill('1500000');
  await row.getByTestId('contract-input').press('Enter');
  await expect(row.getByTestId('contract')).toContainText('1,500,000원');
  await expect(row.getByTestId('contract')).toHaveAttribute('data-auto', 'false');
  await expect(row.getByTestId('contract-auto')).toBeVisible();
  // 입금액: 표시를 누르면 입력란
  await row.getByTestId('paid').click();
  await row.getByTestId('paid-input').fill('500000');
  await row.getByTestId('paid-input').press('Enter');
  await expect(row.getByTestId('paid')).toContainText('500,000원');
  await expect(bill.getByTestId('group-totals')).toContainText('미수 1,000,000원');
  await expect(group.getByTestId('group-summary')).toContainText('미수 1,000,000원');
  // 다 받으면 총금액만
  await row.getByTestId('paid').click();
  await row.getByTestId('paid-input').fill('1500000');
  await row.getByTestId('paid-input').press('Enter');
  await expect(row.getByTestId('settle')).toHaveText('총 1,500,000원');
  await expect(row.getByTestId('paid')).toHaveCount(0);
  // 자동 계산 복구 → 다시 견적 합계(0)
  await row.getByTestId('settle').click(); // 총액을 누르면 받은/계약 수정 줄이 열린다
  await row.getByTestId('contract-auto').click();
  await expect(row.getByTestId('contract')).toHaveAttribute('data-auto', 'true');
  // 세부는 리스트 뷰로
  await expect(row.locator('a')).toHaveAttribute('href', /view=list/);
  // 접기
  await group.click();
  await expect(page.getByTestId('group-bill')).toHaveCount(0);
  // 그룹 삭제 → 프로젝트는 남는다
  await group.click();
  page.once('dialog', (d) => d.accept());
  await page.getByTestId('group-delete').click();
  await expect(page.getByTestId('group')).toHaveCount(0);
  await expect(page.getByTestId('project-item')).toHaveCount(2);
  // 선택 모드의 [삭제]: 확인 뒤 프로젝트가 지워진다
  await page.getByTestId('select-mode').click();
  await page.getByTestId('project-item').first().click();
  page.once('dialog', (d) => d.accept());
  await page.getByTestId('bar-delete').click();
  await expect(page.getByTestId('project-item')).toHaveCount(1);
  // 선택 모드가 아니면 카드 클릭은 프로젝트로 이동
  await page.getByTestId('project-item').first().click();
  await expect(page).toHaveURL(/room=/);
});

test('계약 금액은 프로젝트 리스트 뷰의 견적 합계가 자동으로 들어간다', async ({ page, request }) => {
  const { session } = await openOwnedProject(page, request, '자동 견적');
  await page.evaluate(async () => {
    const app = (window as unknown as { __ganpanda: { project: { addPhoto(p: unknown): string; addObject(o: unknown): string } } }).__ganpanda;
    const photoId = app.project.addPhoto({ name: 'p.png', assetId: 'none', w: 1600, h: 1000, x: 0, y: 0, width: 1200 });
    app.project.addObject({ photoId, name: '간판', shape: 'rect', quad: [[100, 100], [700, 100], [700, 300], [100, 300]], sheetIds: [], productId: 'board-flex', widthMm: 3000, heightMm: 600 });
  });
  await page.getByTestId('view-list').click();
  await page.getByTestId('quote-auto-all').click(); // 새 프로젝트는 줄 금액 수동 입력 (2026-10-16) → 자동
  // 후렉스 1.8㎡ × 250,000 = 450,000 + 설치 250,000 = 700,000, 부가세 포함 770,000
  await expect.poll(async () => { const r = await request.get('http://localhost:8787/api/projects', { headers: { authorization: `Bearer ${session}` } }); return (await r.json()).projects[0].quoteTotal; }, { timeout: 10_000 }).toBe(770000);
  await apiCreateProject(request, session, '둘째');
  await openHome(page, session);
  await makeGroup(page, '자동'); // 막 만든 그룹은 펼쳐져 있다
  const row = page.getByTestId('group-project').filter({ hasText: '자동 견적' });
  await expect(row.getByTestId('contract')).toContainText('770,000원');
  await expect(row.getByTestId('contract')).toHaveAttribute('data-auto', 'true');
});

test('멤버는 설정에서 관리: 추가하면 오너의 그룹을 보고, 정산 보기는 오너가 켜야 금액이 보인다. 설정에 구독·사용량', async ({ page, browser, request }) => {
  const owner = await apiLogin(request);
  const memberEmail = `member-${Math.random().toString(36).slice(2, 8)}@example.com`;
  const member = await apiLogin(request, memberEmail);
  await apiCreateProject(request, owner, '본점');
  await apiCreateProject(request, owner, '지점');
  await openHome(page, owner);
  await makeGroup(page, '본사 발주');
  await page.getByTestId('group').click(); // 접기 (설정 창 뒤에서 상관없지만 상태 정리)
  // 설정 → 계정·구독·사용량 + 멤버 추가
  await page.getByTestId('open-settings').click();
  await expect(page.getByTestId('plan')).toContainText('요금제');
  await expect(page.getByTestId('usage-storage')).toContainText('/');
  await page.getByTestId('member-email').fill('nobody@example.com');
  await page.getByTestId('member-add').click();
  await expect(page.getByTestId('member-error')).toBeVisible();
  await page.getByTestId('member-email').fill(memberEmail);
  await page.getByTestId('member-add').click();
  await expect(page.getByTestId('team-member')).toHaveCount(1);
  // 멤버 화면: 그룹·프로젝트·상태는 보이지만 정산은 안 보인다
  const ctx = await browser.newContext();
  const mp = await ctx.newPage();
  await openHome(mp, member);
  await expect(mp.getByTestId('group')).toContainText('본사 발주');
  await mp.getByTestId('group').click();
  await expect(mp.getByTestId('group-project')).toHaveCount(2);
  await expect(mp.getByTestId('contract')).toHaveCount(0);
  await expect(mp.getByTestId('project-status')).toHaveCount(0);
  // 오너가 정산 보기를 켜면 보인다 (멤버는 수정 불가)
  await page.getByTestId('member-billing').check();
  await mp.reload();
  await mp.getByTestId('group').click();
  await expect(mp.getByTestId('contract')).toHaveCount(2);
  await expect(mp.getByTestId('contract').first()).toBeDisabled();
  await ctx.close();
});
