import { expect, test } from '@playwright/test';
import { apiCreateInvite, openInvited, openOwnedProject, uploadPhoto } from './helpers';

test('무료 요금제: 동시접속 3명을 넘는 4번째 사람은 한도 안내를 본다', async ({ page, request, browser }) => {
  const { session, projectId } = await openOwnedProject(page, request);
  const url = await apiCreateInvite(request, session, projectId, 'viewer');
  const g1 = await openInvited(browser, url, '고객1');
  const g2 = await openInvited(browser, url, '고객2');
  // 4번째: 접속은 거부되고 안내가 보인다
  const ctx = await browser.newContext();
  const g3 = await ctx.newPage();
  await g3.goto('/');
  await g3.evaluate(() => localStorage.setItem('ganpanda.nickname', '고객3'));
  await g3.goto(new URL(url).pathname + new URL(url).search);
  await expect(g3.getByTestId('seat-limit')).toContainText('3');
  // 한 명이 나가면 들어올 수 있다
  await g1.ctx.close();
  await expect(g3.getByTestId('sync-status')).toHaveAttribute('data-status', 'online', { timeout: 15000 });
  await expect(g3.getByTestId('seat-limit')).toHaveCount(0);
  await g2.ctx.close();
  await ctx.close();
});

test('사진이 서버에 올라가고 소유자 사용량에 반영된다', async ({ page, request }) => {
  await openOwnedProject(page, request);
  await uploadPhoto(page);
  await expect(page.getByTestId('photo-img')).toBeVisible();
  await page.getByTestId('account-menu').click();
  await expect(page.getByTestId('usage-storage')).not.toContainText('0 B');
  await expect(page.getByTestId('usage-storage')).toContainText('50 MB');
});
