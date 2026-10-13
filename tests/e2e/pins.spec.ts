import { expect, test, type Page } from '@playwright/test';
import { apiCreateInvite, openInvited, openOwnedProject, uploadPhoto } from './helpers';

/** 사진 원본 픽셀 좌표 클릭 */
async function clickPhoto(page: Page, x: number, y: number) {
  const b = (await page.getByTestId('photo-img').first().boundingBox())!;
  const k = b.width / 1600;
  await page.mouse.click(b.x + x * k, b.y + y * k);
}

test('소유자가 핀을 꽂고 코멘트를 남기면 고객이 보고 답한다; 해결하면 흐려진다', async ({ page, request, browser }) => {
  const { session, projectId } = await openOwnedProject(page, request);
  await uploadPhoto(page);
  await page.keyboard.press('p');
  await clickPhoto(page, 800, 300);
  await expect(page.getByTestId('pin')).toHaveCount(1);
  await expect(page.getByTestId('pin-panel')).toBeVisible();
  await expect(page.getByTestId('pin-panel')).toContainText('#1');
  await page.getByTestId('chat-input').fill('이 자리에 돌출 간판 어떨까요?');
  await page.getByTestId('chat-input').press('Enter');

  const guest = await openInvited(browser, await apiCreateInvite(request, session, projectId, 'viewer'));
  await expect(guest.getByTestId('pin')).toHaveCount(1);
  await expect(guest.getByTestId('pin-unread')).toContainText('1');
  await guest.getByTestId('pin').click();
  await expect(guest.getByTestId('chat-bubble')).toContainText('돌출 간판');
  await guest.getByTestId('chat-input').fill('좋아요!');
  await guest.getByTestId('chat-input').press('Enter');
  await expect(page.getByTestId('chat-bubble')).toHaveCount(2);

  // 고객은 해결·삭제 불가
  await expect(guest.getByTestId('pin-resolve')).toHaveCount(0);
  // 소유자가 해결
  await page.getByTestId('pin-resolve').click();
  await expect(page.getByTestId('pin')).toHaveAttribute('data-resolved', 'true');
  await expect(guest.getByTestId('pin')).toHaveAttribute('data-resolved', 'true');
  await guest.ctx.close();
});

test('고객(viewer)도 핀을 꽂을 수 있고 소유자에게 보인다', async ({ page, request, browser }) => {
  const { session, projectId } = await openOwnedProject(page, request);
  await uploadPhoto(page);
  const guest = await openInvited(browser, await apiCreateInvite(request, session, projectId, 'viewer'));
  await expect(guest.getByTestId('photo-img')).toBeVisible();
  await guest.getByTestId('tool-pin').click();
  await clickPhoto(guest, 400, 700);
  await expect(guest.getByTestId('pin')).toHaveCount(1);
  await guest.getByTestId('chat-input').fill('여기에도 작은 간판 하나요');
  await guest.getByTestId('chat-input').press('Enter');
  await expect(page.getByTestId('pin')).toHaveCount(1);
  await expect(page.getByTestId('pin-unread')).toContainText('1');
  await page.getByTestId('pin').click();
  await expect(page.getByTestId('chat-bubble')).toContainText('작은 간판');
  await expect(page.getByTestId('pin-unread')).toHaveCount(0);
  await guest.ctx.close();
});

test('편집 권한은 핀을 끌어 옮기고 삭제할 수 있다', async ({ page, request }) => {
  await openOwnedProject(page, request);
  await uploadPhoto(page);
  await page.keyboard.press('p');
  await clickPhoto(page, 800, 300);
  const pin = page.getByTestId('pin');
  const before = (await pin.boundingBox())!;
  await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
  await page.mouse.down();
  await page.mouse.move(before.x + before.width / 2 + 80, before.y + before.height / 2 + 40, { steps: 5 });
  await page.mouse.up();
  const after = (await pin.boundingBox())!;
  expect(after.x - before.x).toBeGreaterThan(60);
  await page.getByTestId('pin-delete').click();
  await expect(page.getByTestId('pin')).toHaveCount(0);
  await expect(page.getByTestId('pin-panel')).toHaveCount(0);
});
