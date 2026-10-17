import { expect, test } from '@playwright/test';
import { apiCreateInvite, dragOnPhoto, openInvited, openOwnedProject, uploadPhoto, apiSetPlan } from './helpers';

test('⌘Z 로 내 편집을 되돌리고 ⌘⇧Z 로 다시 실행한다; 상대의 편집은 그대로', async ({ page, request, browser }) => {
  const { session, projectId } = await openOwnedProject(page, request);
  await uploadPhoto(page);
  await page.keyboard.press('t');
  await dragOnPhoto(page, [300, 150], [700, 250]);
  await expect(page.getByTestId('sign-shape')).toHaveCount(1);

  // 상대(editor)가 하나 더 그림
  await apiSetPlan(request, session, 'basic'); // 소유자 + 직원 동시 작업 (무료는 1명)
  const guest = await openInvited(browser, await apiCreateInvite(request, session, projectId, 'editor'), '디자이너');
  await guest.keyboard.press('t');
  await dragOnPhoto(guest, [900, 150], [1300, 250]);
  await expect(page.getByTestId('sign-shape')).toHaveCount(2);

  await page.getByTestId('board-canvas').hover();
  await page.keyboard.press('Escape');
  await page.keyboard.press('ControlOrMeta+z');
  await expect(page.getByTestId('sign-shape')).toHaveCount(1); // 내 것만 사라짐
  await expect(guest.getByTestId('sign-shape')).toHaveCount(1);
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await expect(page.getByTestId('sign-shape')).toHaveCount(2);
  await expect(guest.getByTestId('sign-shape')).toHaveCount(2);

  // 도구 막대 버튼으로도
  await page.getByTestId('undo').click();
  await expect(page.getByTestId('sign-shape')).toHaveCount(1);
  await page.getByTestId('redo').click();
  await expect(page.getByTestId('sign-shape')).toHaveCount(2);
  await guest.ctx.close();
});

test('입력칸에서는 ⌘Z 가 글자 되돌리기로 남는다 (앱 실행 취소 아님)', async ({ page, request }) => {
  await openOwnedProject(page, request);
  await uploadPhoto(page);
  await page.keyboard.press('t');
  await dragOnPhoto(page, [300, 150], [700, 250]);
  await page.getByTestId('chat-input').fill('메모');
  await page.getByTestId('chat-input').press('ControlOrMeta+z');
  await expect(page.getByTestId('sign-shape')).toHaveCount(1);
});
