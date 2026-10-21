// 홈 카드·만들기 폼 (2026-10-21 사용자: "프로젝트 카드는 실측 안내 없이 숫자만 날짜는 D-day 표시로 -숫자 지나면 +숫자 (그룹도) /
// 만들기 입력필드가 포커싱되면 하단에 연락처, 주소, 계약일, 시작일, 완료일, 메모 마지막에 x마크가 주루룩 나오고 제목빼고 다옵션 / 카드 하단글자부근 클릭은 상세내역 나머지는 프로젝트 오픈")
import { expect, test, type Page } from '@playwright/test';
import { apiCreateProject, apiLogin } from './helpers';

async function openHome(page: Page, session: string) {
  await page.goto('/');
  await page.evaluate((s) => { localStorage.clear(); localStorage.setItem('ganpanda.session', s); }, session);
  await page.reload();
  await expect(page.getByTestId('project-list')).toBeVisible();
}
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const plusDays = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return iso(d); };

test('만들기: 이름 칸에 포커스하면 선택 항목이 펼쳐지고 ✕로 접힌다; 완료일을 넣어 만들면 카드가 D-3', async ({ page, request }) => {
  const session = await apiLogin(request);
  await openHome(page, session);
  await expect(page.getByTestId('new-project-details')).toHaveCount(0);
  await page.getByTestId('new-project-name').focus();
  const more = page.getByTestId('new-project-details');
  await expect(more).toBeVisible();
  for (const t of ['new-contact', 'new-address', 'new-contract-date', 'new-start-date', 'new-due-date', 'new-memo', 'new-project-close']) await expect(more.getByTestId(t)).toBeVisible();
  await more.getByTestId('new-project-close').click();
  await expect(page.getByTestId('new-project-details')).toHaveCount(0);
  // 제목만 필수
  await page.getByTestId('new-project-name').fill('디데이 매장');
  await page.getByTestId('new-due-date').fill(plusDays(3));
  await page.getByTestId('new-contact').fill('010-1111-2222');
  await page.getByTestId('new-project-submit').click();
  await expect(page.getByTestId('sync-status')).toHaveAttribute('data-status', 'online'); // 만들면 프로젝트로 들어간다
  await openHome(page, session);
  const card = page.getByTestId('project-item').first();
  await expect(card).toContainText('디데이 매장');
  await expect(card.getByTestId('project-dday')).toHaveText('D-3');
  await expect(card.getByTestId('project-count')).toHaveCount(0); // 사인물 없음 → 숫자 없음
  await expect(card).not.toContainText('실측'); // 숫자만
});

test('카드 오른쪽 위 ⋯ → 속성창: 보기(전화·복사·카톡·주소복사, 없으면 숨김) ↔ [수정] 토글; 완료일이 지났으면 D+n; 그룹에도 D-day', async ({ page, request, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const session = await apiLogin(request);
  const id = await apiCreateProject(request, session, '상세 매장');
  await request.patch(`http://localhost:8787/api/projects/${id}`, { data: { dueDate: plusDays(-2), contact: '02-123-4567' }, headers: { authorization: `Bearer ${session}` } });
  await openHome(page, session);
  const card = page.getByTestId('project-item').first();
  await expect(card.getByTestId('project-dday')).toHaveText('D+2');
  await card.getByTestId('project-menu').click();
  const dlg = page.getByTestId('project-details');
  await expect(dlg).toHaveAttribute('data-mode', 'view');
  await expect(dlg.getByTestId('details-call')).toHaveAttribute('href', 'tel:021234567');
  await dlg.getByTestId('details-copy-phone').click();
  await expect(dlg.getByTestId('details-copied')).toContainText('복사됨');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('02-123-4567');
  await expect(dlg.getByTestId('details-kakao')).toBeVisible();
  await expect(dlg.getByTestId('details-address-row')).toHaveCount(0); // 주소 없음 → 안 보임
  // 수정 토글
  await dlg.getByTestId('details-edit').click();
  await expect(dlg).toHaveAttribute('data-mode', 'edit');
  await expect(dlg.getByTestId('details-contact')).toHaveValue('02-123-4567');
  await expect(dlg.getByTestId('details-due-date')).toHaveValue(plusDays(-2));
  await dlg.getByTestId('details-memo').fill('야간 조명 포함');
  await dlg.getByTestId('details-address').fill('서울 송파구');
  await dlg.getByTestId('details-status').selectOption('ongoing');
  await dlg.getByTestId('details-save').click();
  await expect(dlg).toHaveAttribute('data-mode', 'view'); // 저장 후 보기로
  await expect(dlg.getByTestId('details-address-row')).toContainText('서울 송파구');
  await expect(dlg.getByTestId('details-memo-view')).toHaveText('야간 조명 포함');
  await dlg.getByTestId('details-copy-address').click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('서울 송파구');
  await dlg.getByTestId('details-close').click();
  await expect(card).toHaveAttribute('data-status', 'ongoing');
  // 연락처가 없는 프로젝트: 전화·복사·카톡 줄이 없다
  await apiCreateProject(request, session, '둘째');
  await page.reload();
  await page.getByTestId('project-item').filter({ hasText: '둘째' }).getByTestId('project-menu').click();
  await expect(page.getByTestId('details-contact-row')).toHaveCount(0);
  await expect(page.getByTestId('details-kakao')).toHaveCount(0);
  await page.getByTestId('details-close').click();
  // 그룹 D-day: 그룹 안 프로젝트의 기준일
  await page.getByTestId('select-mode').click();
  await page.getByTestId('project-item').nth(0).click();
  await page.getByTestId('project-item').nth(1).click();
  await page.getByTestId('bar-group').click();
  await page.getByTestId('group-name').fill('묶음');
  await page.getByTestId('group-create').click();
  await expect(page.getByTestId('group-dday')).toHaveText(/D[-+]\d+|D-day/);
});
