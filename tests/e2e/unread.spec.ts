import { expect, test } from '@playwright/test';
import { apiCreateInvite, dragOnPhoto, openInvited, openOwnedProject, uploadPhoto } from './helpers';

test('보고 있지 않은 사인물에 메시지가 오면 배지·토스트가 뜨고, 열어 보면 사라진다', async ({ page, request, browser }) => {
  const { session, projectId } = await openOwnedProject(page, request);
  await uploadPhoto(page);
  await page.keyboard.press('r');
  await dragOnPhoto(page, [300, 150], [700, 250]); // 사인물 1
  await page.keyboard.press('Escape');
  await page.keyboard.press('r');
  await dragOnPhoto(page, [900, 150], [1300, 250]); // 사인물 2 (선택된 채로 둠)
  const guest = await openInvited(browser, await apiCreateInvite(request, session, projectId, 'viewer'));
  await expect(guest.getByTestId('sign-shape')).toHaveCount(2);
  await guest.getByTestId('sign-shape').first().click();
  await guest.getByTestId('chat-input').fill('첫 번째 간판 색상 문의');
  await guest.getByTestId('chat-input').press('Enter');

  // 소유자는 사인물 2를 보고 있음 → 사인물 1에 배지 1, 상단 합계 1, 토스트
  await expect(page.getByTestId('sign-unread').first()).toContainText('1');
  await expect(page.getByTestId('unread-total')).toContainText('1');
  await expect(page.getByTestId('toast')).toContainText('첫 번째 간판 색상 문의');
  await page.getByTestId('toast').click(); // 토스트를 누르면 그 사인물이 열린다
  await expect(page.getByTestId('chat-bubble')).toContainText('첫 번째 간판 색상 문의');
  await expect(page.getByTestId('sign-unread')).toHaveCount(0);
  await expect(page.getByTestId('unread-total')).toHaveCount(0);

  // 새로고침해도 읽음 상태 유지
  await page.reload();
  await expect(page.getByTestId('sync-status')).toHaveAttribute('data-status', 'online');
  await expect(page.getByTestId('sign-shape')).toHaveCount(2);
  await expect(page.getByTestId('sign-unread')).toHaveCount(0);
  await guest.ctx.close();
});

test('내가 보낸 메시지는 안 읽음으로 세지 않는다', async ({ page, request }) => {
  await openOwnedProject(page, request);
  await uploadPhoto(page);
  await page.keyboard.press('r');
  await dragOnPhoto(page, [300, 150], [700, 250]);
  await page.getByTestId('chat-input').fill('메모');
  await page.getByTestId('chat-input').press('Enter');
  await expect(page.getByTestId('chat-bubble')).toHaveCount(1);
  await expect(page.getByTestId('sign-unread')).toHaveCount(0);
});
