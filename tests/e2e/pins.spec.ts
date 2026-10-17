import { expect, test, type Page } from '@playwright/test';
import { apiCreateInvite, apiSetPlan, openInvited, openOwnedProject, uploadPhoto } from './helpers';

/** 사진 원본 픽셀 좌표 클릭 */
async function clickPhoto(page: Page, x: number, y: number) {
  const b = (await page.getByTestId('photo-img').first().boundingBox())!;
  const k = b.width / 1600;
  await page.mouse.click(b.x + x * k, b.y + y * k);
}

test('말풍선 받는 사람: 모두가 기본, 특정인에게 보내면 보낸 사람·받는 사람·소유자만 본다 (2026-10-17)', async ({ page, request, browser }) => {
  const { session, projectId } = await openOwnedProject(page, request);
  await apiSetPlan(request, session, 'pro'); // 편집자 좌석 (무료는 1석)
  await uploadPhoto(page);
  const guest = await openInvited(browser, await apiCreateInvite(request, session, projectId, 'editor'), '디자이너');
  await expect(page.getByTestId('tool-pin')).toContainText('말풍선');
  await page.keyboard.press('p');
  await clickPhoto(page, 800, 300);
  await expect(page.getByTestId('pin-panel')).toContainText('말풍선');
  await expect(page.getByTestId('pin-to-label')).toHaveText('모두');
  await expect(guest.getByTestId('pin')).toHaveCount(1);
  // 받는 사람을 디자이너로: 디자이너와 보낸 사람(소유자)만 본다. 제3자(고객 '시공')는 못 본다
  await expect(page.getByTestId('pin-to').locator('option', { hasText: '디자이너' })).toHaveCount(1); // 접속한 사람이 후보에
  await page.getByTestId('pin-to').selectOption('디자이너');
  await expect(page.getByTestId('pin-to-label')).toHaveText('디자이너');
  await expect(guest.getByTestId('pin')).toHaveAttribute('data-to', '디자이너');
  const third = await openInvited(browser, await apiCreateInvite(request, session, projectId, 'viewer'), '시공'); // viewer: 좌석을 쓰지 않는다
  await expect(third.getByTestId('photo-img')).toBeVisible();
  await expect(third.getByTestId('pin')).toHaveCount(0);
  await expect(page.getByTestId('pin')).toHaveCount(1); // 보낸 사람(소유자)
  // 다시 모두에게
  await page.getByTestId('pin-to').selectOption('');
  await expect(third.getByTestId('pin')).toHaveCount(1);
  await third.ctx.close();
  await guest.ctx.close();
});

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
  // 말풍선 옆에 마지막 상태만 (2026-10-17 "말 풍선에는 마지막 상태만 나오게")
  await expect(page.getByTestId('pin-last')).toHaveText(/나: 이 자리에 돌출 간판/);

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
  await expect(page.getByTestId('pin-last')).toHaveText(/고객: 좋아요!/); // 마지막 상태가 바뀜
  // 소유자가 해결
  await page.getByTestId('pin-resolve').click();
  await expect(page.getByTestId('pin')).toHaveAttribute('data-resolved', 'true');
  await expect(page.getByTestId('pin-last')).toHaveText('✓ 해결됨');
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

test('사인물 말풍선: 대화가 생기면 영역 오른쪽 위에 마지막 상태가 붙고, 누르면 그 사인물의 대화가 열린다 (2026-10-17 "말풍선이 해당 게시물 또는 영역을 지정해서 소통하는 창구")', async ({ page, request }) => {
  await openOwnedProject(page, request);
  await uploadPhoto(page);
  await page.keyboard.press('t');
  const b = (await page.getByTestId('photo-img').first().boundingBox())!;
  const k = b.width / 1600;
  await page.mouse.move(b.x + 300 * k, b.y + 200 * k); await page.mouse.down(); await page.mouse.move(b.x + 700 * k, b.y + 320 * k, { steps: 4 }); await page.mouse.up();
  await expect(page.getByTestId('object-bubble')).toHaveCount(0); // 대화 전에는 없음
  await page.getByTestId('object-panel').getByTestId('chat-input').fill('두께 150으로 갈까요');
  await page.getByTestId('object-panel').getByTestId('chat-input').press('Enter');
  await expect(page.getByTestId('object-bubble')).toHaveCount(1);
  await expect(page.getByTestId('object-bubble-last')).toHaveText(/나: 두께 150으로 갈까요/);
  // 선택을 풀고 말풍선을 누르면 다시 선택되고 대화가 보인다
  await page.keyboard.press('Escape');
  await page.getByTestId('board-canvas').click({ position: { x: 20, y: 400 } });
  await expect(page.getByTestId('object-panel')).toHaveCount(0);
  await page.getByTestId('object-bubble').click();
  await expect(page.getByTestId('object-panel')).toBeVisible();
  await expect(page.getByTestId('object-panel').getByTestId('chat-bubble')).toContainText('두께 150');
});
