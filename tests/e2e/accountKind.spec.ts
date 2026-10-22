// 계정 종류·전환·삭제, 권한에 맞는 화면 (2026-10-22 사용자: "인터페이스 권한에 맞게 감추고 필드(잠금)는 텍스트로 조정해줘 / 설정의 내용 그리고 사인물 속성등 각 역활에 맞게 정리해줘 /
// 그리고 사업자는 소비자 등록이 안된다. / 소비자는 사업자로 변경하고 기존 데이터는 사업자로 이관된다, / 계정삭제도 필요하다.")
import { expect, test } from '@playwright/test';
import { apiCreateInvite, apiLogin, dragOnPhoto, openInvited, openOwnedProject, uploadPhoto, openSettings } from './helpers';

test('간판집 계정으로 /estimate 에 들어가면 막고 외주 요청을 안내한다', async ({ page, request }) => {
  await openOwnedProject(page, request); // 프로젝트를 만들면 간판집
  await page.goto('/estimate');
  await expect(page.getByTestId('consumer-blocked')).toContainText('외주');
});

test('가게 사장 계정: 홈은 견적 요청만, 설정은 계정·표시만 → 간판집으로 전환하면 견적 보드가 내 프로젝트로 → 계정 삭제', async ({ page, request }) => {
  const s = await apiLogin(request);
  await page.goto('/');
  await page.evaluate((x) => { localStorage.clear(); localStorage.setItem('ganpanda.session', x); }, s);
  await page.goto('/estimate'); // 처음 견적 보드 = 가게 사장
  await expect(page.getByTestId('sync-status')).toHaveAttribute('data-status', 'online');
  await page.goto('/');
  await expect(page.getByTestId('consumer-home')).toBeVisible();
  await expect(page.getByTestId('project-list')).toHaveCount(0);
  await openSettings(page);
  await expect(page.getByTestId('settings').locator('[data-testid^="settings-tab-"]')).toHaveText(['계정', '표시']);
  await expect(page.getByTestId('business-section')).toHaveCount(0);
  await expect(page.getByTestId('convert-section')).toBeVisible();
  await page.getByTestId('close-settings').click();
  // 전환 — 견적 보드가 보통 프로젝트로
  page.once('dialog', (d) => d.accept());
  await page.getByTestId('consumer-to-shop').click();
  await expect(page.getByTestId('project-list')).toBeVisible();
  await expect(page.getByTestId('project-item').filter({ hasText: '간판 견적 요청' })).toHaveCount(1);
  await expect(page.getByTestId('consumer-home')).toHaveCount(0);
  // 계정 삭제 — "삭제" 를 적어야
  await openSettings(page);
  await page.getByTestId('delete-account-open').click();
  await expect(page.getByTestId('delete-account')).toBeDisabled();
  await page.getByTestId('delete-confirm').fill('삭제');
  await page.getByTestId('delete-account').click();
  await expect(page.getByTestId('landing')).toBeVisible({ timeout: 15_000 }); // 로그아웃된 첫 화면
});

test('보기 권한(고객)이 연 사인물 속성: 잠긴 칸은 글자처럼(테두리 없음), 고치는 단추는 없다', async ({ page, request, browser }) => {
  const { session, projectId } = await openOwnedProject(page, request);
  await uploadPhoto(page);
  await page.keyboard.press('t');
  await dragOnPhoto(page, [300, 200], [700, 300]);
  await expect(page.getByTestId('sign-shape')).toHaveCount(1);
  const guest = await openInvited(browser, await apiCreateInvite(request, session, projectId, 'viewer'));
  await guest.getByTestId('sign-shape').first().click();
  const panel = guest.locator('[data-ro]').first();
  await expect(panel).toBeVisible();
  const look = await panel.locator('input:disabled, select:disabled').first().evaluate((el) => { const c = getComputedStyle(el); return { border: c.borderTopColor, bg: c.backgroundColor }; });
  expect(look.border).toBe('rgba(0, 0, 0, 0)');
  expect(look.bg).toBe('rgba(0, 0, 0, 0)');
  expect(await panel.locator('.btn:disabled:visible').count()).toBe(0);
  await guest.ctx.close();
});
