import { expect, test, type Page } from '@playwright/test';
import { apiCreateInvite, dragOnPhoto, makePhoto, openInvited, openOwnedProject, uploadPhoto } from './helpers';

async function attachImage(page: Page, name: string) {
  await page.getByTestId('chat-attach').setInputFiles({ name, mimeType: 'image/png', buffer: await makePhoto(page) });
  await expect(page.getByTestId('chat-pending')).toContainText(name);
}

test('대화에 사진을 첨부하면 썸네일로 보이고 상대도 본다; PDF 는 파일 링크', async ({ page, request, browser }) => {
  const { session, projectId } = await openOwnedProject(page, request);
  await uploadPhoto(page);
  await page.keyboard.press('r');
  await dragOnPhoto(page, [300, 150], [700, 250]);
  await attachImage(page, '참고.png');
  await page.getByTestId('chat-input').fill('이런 느낌으로요');
  await page.getByTestId('chat-input').press('Enter');
  await expect(page.getByTestId('chat-bubble')).toHaveCount(1);
  await expect(page.getByTestId('chat-image')).toHaveCount(1);
  await expect(page.getByTestId('chat-pending')).toHaveCount(0);

  // PDF: 글 없이 첨부만
  await page.getByTestId('chat-attach').setInputFiles({ name: '도면.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 test') });
  await page.getByTestId('chat-send').click();
  await expect(page.getByTestId('chat-file')).toContainText('도면.pdf');

  const guest = await openInvited(browser, await apiCreateInvite(request, session, projectId, 'viewer'));
  await guest.getByTestId('sign-shape').click();
  await expect(guest.getByTestId('chat-image')).toHaveCount(1);
  await expect(guest.getByTestId('chat-image')).toHaveJSProperty('complete', true);
  await expect(guest.getByTestId('chat-file')).toContainText('도면.pdf');
  await guest.ctx.close();
});

test('고객(viewer)도 현장 사진을 첨부해 보낼 수 있다', async ({ page, request, browser }) => {
  const { session, projectId } = await openOwnedProject(page, request);
  await uploadPhoto(page);
  await page.keyboard.press('r');
  await dragOnPhoto(page, [300, 150], [700, 250]);
  const guest = await openInvited(browser, await apiCreateInvite(request, session, projectId, 'viewer'));
  await guest.getByTestId('sign-shape').click();
  await attachImage(guest, '현장.png');
  await guest.getByTestId('chat-send').click();
  await expect(guest.getByTestId('chat-image')).toHaveCount(1);
  await expect(page.getByTestId('chat-image')).toHaveCount(1);
  await expect(page.getByTestId('chat-image')).toHaveJSProperty('complete', true);
  await guest.ctx.close();
});
