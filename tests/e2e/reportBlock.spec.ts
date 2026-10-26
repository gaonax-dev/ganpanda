// 신고·차단 (2026-10-26 사용자: "신고·차단 기능 진행해줘" — 앱스토어 1.2 사용자 생성 콘텐츠: 신고 · 사용자 차단 · 욕설 거르기 · 연락처)
import { expect, test } from '@playwright/test';
import { apiCreateInvite, apiLogin, openInvited, openOwnedProject, uploadPhoto } from './helpers';

type G = { __ganpanda: { photos: { id: string }[]; project: { addObject(o: unknown): string }; openChat(id: string): void } };

test('남의 말풍선 ⋮ → 신고(이유) · 이 사용자 차단(안 보임) → 설정에서 해제, 보낼 때 욕설은 가려진다, 계정 메뉴에 문의', async ({ page, request, browser }) => {
  const { session, projectId } = await openOwnedProject(page, request, '신고 매장');
  await uploadPhoto(page);
  const signId = await page.evaluate(() => { const g = (window as unknown as G).__ganpanda; return g.project.addObject({ photoId: g.photos[0].id, name: '간판', shape: 'rect', quad: [[100, 100], [600, 100], [600, 300], [100, 300]], sheetIds: [] }); });
  // 사장이 말풍선에 보냄 — 욕설은 가려진다
  await page.evaluate((id) => (window as unknown as G).__ganpanda.openChat(id), signId);
  await page.getByTestId('chat-input').fill('씨발 이거 광고');
  await page.getByTestId('chat-send').click();
  await expect(page.getByTestId('chat-bubble')).toHaveText('** 이거 광고');
  await expect(page.getByTestId('chat-more')).toHaveCount(0); // 내 메시지에는 신고·차단 없음

  // 고객(계정으로 들어옴)이 본다
  const cus = await apiLogin(request);
  const guest = await openInvited(browser, await apiCreateInvite(request, session, projectId, 'viewer'), '고객', cus);
  await guest.evaluate((id) => (window as unknown as G).__ganpanda.openChat(id), signId);
  const bubble = guest.getByTestId('chat-bubble');
  await expect(bubble).toHaveText('** 이거 광고');
  // 신고: ⋮ → 신고하기 → 이유 → (자세한 내용) → 접수
  await guest.getByTestId('chat-more').click();
  const sheet = guest.getByTestId('message-actions');
  await expect(sheet.getByRole('button')).toHaveText([/신고하기/, /이 사용자 차단/, '취소']);
  await sheet.getByTestId('sheet-item-report').click();
  const reasons = guest.getByTestId('report-reasons');
  await expect(reasons).toContainText('스팸·광고');
  guest.once('dialog', (d) => void d.accept('광고만 계속 보냅니다'));
  await reasons.getByTestId('sheet-item-spam').click();
  await expect(guest.locator('.flash')).toContainText('신고했습니다'); // 운영자 목록·숨김은 server/test/moderation.test.ts
  // 차단: 확인 → 그 사람의 메시지가 내 화면에서 사라진다
  await guest.getByTestId('chat-more').click();
  guest.once('dialog', (d) => { expect(d.message()).toContain('차단'); void d.accept(); });
  await guest.getByTestId('message-actions').getByTestId('sheet-item-block').click();
  await expect(bubble).toHaveCount(0);
  // 설정 → 차단한 사용자 → 해제하면 다시 보인다
  await guest.getByTestId('account-menu').click();
  await expect(guest.getByTestId('account-support')).toHaveAttribute('href', /mailto:support@ganpanda\.co\.kr/); // 문의·신고 연락처
  await guest.getByTestId('open-settings').click();
  const blocked = guest.getByTestId('blocked-user');
  await expect(blocked).toHaveCount(1);
  await blocked.getByTestId('unblock').click();
  await expect(blocked).toHaveCount(0);
  await guest.keyboard.press('Escape');
  await guest.evaluate((id) => (window as unknown as G).__ganpanda.openChat(id), signId);
  await expect(guest.getByTestId('chat-bubble')).toHaveCount(1);
  await guest.ctx.close();
});
