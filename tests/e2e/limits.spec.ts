import { expect, test } from '@playwright/test';
import { apiCreateInvite, openInvited, openOwnedProject, uploadPhoto } from './helpers';

// 요금제 개편 (2026-10-17): 좌석 = 동시 작업 인원(소유자·직원), 고객(viewer) 열람은 세지 않는다. 무료 = 1명·500MB·제안 월 3건
test('무료 요금제: 고객(viewer)은 몇 명이 열어도 되고, 직원(editor)은 소유자가 작업 중이면 한도 안내를 본다', async ({ page, request, browser }) => {
  const { session, projectId } = await openOwnedProject(page, request);
  const viewerUrl = await apiCreateInvite(request, session, projectId, 'viewer');
  const g1 = await openInvited(browser, viewerUrl, '고객1');
  const g2 = await openInvited(browser, viewerUrl, '고객2');
  await expect(g2.getByTestId('seat-limit')).toHaveCount(0);
  // 직원: 소유자가 앉아 있어 1석 한도 → 안내
  const editorUrl = await apiCreateInvite(request, session, projectId, 'editor');
  const ctx = await browser.newContext();
  const staff = await ctx.newPage();
  await staff.goto('/');
  await staff.evaluate(() => localStorage.setItem('ganpanda.nickname', '직원'));
  await staff.goto(new URL(editorUrl).pathname + new URL(editorUrl).search);
  await expect(staff.getByTestId('seat-limit')).toContainText('1명');
  // 소유자가 나가면 직원이 들어온다
  await page.close();
  await expect(staff.getByTestId('sync-status')).toHaveAttribute('data-status', 'online', { timeout: 15000 });
  await expect(staff.getByTestId('seat-limit')).toHaveCount(0);
  await g1.ctx.close(); await g2.ctx.close(); await ctx.close();
});

test('사진이 서버에 올라가고 소유자 사용량에 반영된다 (무료 500MB), 이번 달 제안 건수도 보인다', async ({ page, request }) => {
  await openOwnedProject(page, request);
  await uploadPhoto(page);
  await expect(page.getByTestId('photo-img')).toBeVisible();
  await page.getByTestId('account-menu').click();
  await expect(page.getByTestId('usage-storage')).not.toContainText('0 B');
  await expect(page.getByTestId('usage-storage')).toContainText('500 MB');
  await expect(page.getByTestId('usage-proposals')).toContainText('0 / 3건');
});
