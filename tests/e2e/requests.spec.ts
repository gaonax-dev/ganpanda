// 요청판 (2026-10-17): 고객 요청(로그인 없음) → 지역 간판사 홈 "받은 요청" → 제안 만들기(사진 들어온 프로젝트) → 제안 링크 → 고객 페이지에 제안 → 연락처 공개
import { expect, test } from '@playwright/test';
import { dragOnPhoto, makePhoto, openObjectSettings, openOwnedProject, pickCategory } from './helpers';

test('고객이 요청을 올리면 간판사가 받아 제안으로 답하고, 고객 페이지에 제안이 나온다', async ({ page, request, browser }) => {
  const store = `정육점 ${Math.random().toString(36).slice(2, 7)}`; // 로컬 DB 에 남은 지난 실행의 요청과 구분
  // 간판사: 설정에서 요청 받기 + 지역
  await openOwnedProject(page, request, '간판사');
  await page.goto('/');
  await page.getByTestId('open-settings').click();
  await page.getByTestId('req-receive').check();
  await page.getByTestId('req-regions').fill('경기 광주시');
  await page.getByTestId('req-save').click();
  await expect(page.getByTestId('req-saved')).toContainText('저장');
  await page.getByTestId('close-settings').click();

  // 고객: 홍보자 코드가 붙은 요청 페이지 (로그인 없음)
  const ctx = await browser.newContext();
  const cust = await ctx.newPage();
  await cust.goto('/request?ref=promo-kim');
  await expect(cust.getByTestId('top-nav')).toBeHidden();
  await cust.getByTestId('req-photos').setInputFiles({ name: '가게.png', mimeType: 'image/png', buffer: await makePhoto(cust) });
  await cust.getByTestId('req-store').fill(store);
  await cust.getByTestId('req-region').fill('경기광주시');
  await cust.getByTestId('req-text').fill('전면 간판 교체');
  await cust.getByTestId('req-phone').fill(`010${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`);
  await cust.getByTestId('req-submit').click();
  const link = await cust.getByTestId('req-done-link').inputValue();
  expect(link).toMatch(/\/r\/[A-Za-z0-9_-]{16}\?key=/);
  const u = new URL(link); // APP_URL(로컬 .dev.vars) 과 테스트 서버 포트가 달라 경로만
  await cust.goto(u.pathname + u.search);
  await expect(cust.getByTestId('request-page')).toContainText(store);
  await expect(cust.getByTestId('request-status')).toContainText('아직 제안이 없습니다');

  // 간판사 홈: 받은 요청 → 제안 만들기 → 사진이 들어온 프로젝트
  await page.goto('/');
  const item = page.getByTestId('request-item').filter({ hasText: store });
  await expect(item).toBeVisible();
  await expect(item.getByTestId('request-phone')).toHaveCount(0);
  await item.getByTestId('request-respond').click();
  await expect(page.getByTestId('project-title')).toContainText(`${store} 요청`);
  await expect(page.getByTestId('photo-img')).toBeVisible({ timeout: 15_000 });
  // 사인물 그리고 치수·분류 → 제안 보내기
  await page.keyboard.press('t');
  await dragOnPhoto(page, [300, 620], [1300, 760]);
  await pickCategory(page, 'sign');
  await openObjectSettings(page);
  await page.getByTestId('width-mm').fill('5000');
  await page.getByTestId('height-mm').fill('700');
  await page.getByTestId('close-object-settings').click();
  await page.getByTestId('proposal-button').click();
  const dlg = page.getByTestId('proposal-dialog');
  await dlg.getByTestId('proposal-build').click();
  await expect(dlg.getByTestId('proposal-link')).toHaveValue(/\/p\/.+\/.+/, { timeout: 30_000 });
  const proposal = await dlg.getByTestId('proposal-link').inputValue();
  await dlg.getByTestId('close-proposal').click();

  // 고객 페이지에 제안이 보이고, 간판사에게는 연락처가 보인다
  await cust.reload();
  await expect(cust.getByTestId('request-proposal')).toHaveCount(1);
  await expect(cust.getByTestId('request-proposal')).toHaveAttribute('href', proposal);
  await page.goto('/');
  const answered = page.getByTestId('request-item').filter({ hasText: store });
  await expect(answered.getByTestId('request-phone')).toContainText('010');
  await expect(answered.getByTestId('request-open')).toBeVisible();
  await ctx.close();
});
