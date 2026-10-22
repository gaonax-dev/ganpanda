import { expect, test } from '@playwright/test';
import { apiCreateInvite, openInvited, openOwnedProject, uploadPhoto } from './helpers';

type G = { __ganpanda: { photos: { id: string }[]; selectedId: string | null; nickname: string; project: { addObject(o: unknown): string } } };

// 2026-10-22 사용자: "톡은 메인화면의 상단에 톡버튼. 톡은 프로젝트에서 대화 대상을 선택하고 대화방 이름을 지정하고 생성한다 … 같은 방 상대에게 알림 …
// 톡방이 켜진 상태에서 사인물을 선택하면 대화에 사인물 링크가 생기고 대화에서 해당 링크를 누르면 해당 링크가 화면에 잡힌다 … 기본으로 회사 맴버 톡방이 있다"
test('톡: 회사 멤버 방이 기본, 방을 만들어 고객을 넣고 사인물 링크를 보내면 고객이 알림을 받고 링크를 눌러 그 사인물로 간다', async ({ page, request, browser }) => {
  const { session, projectId } = await openOwnedProject(page, request);
  await uploadPhoto(page);
  const signId = await page.evaluate(() => {
    const a = (window as unknown as G).__ganpanda;
    return a.project.addObject({ photoId: a.photos[0].id, name: '간판', shape: 'rect', quad: [[300, 200], [1100, 200], [1100, 420], [300, 420]], sheetIds: [], widthMm: 4000, heightMm: 1000 });
  });
  const guest = await openInvited(browser, await apiCreateInvite(request, session, projectId, 'viewer'), '고객');

  await page.getByTestId('talk-open').click();
  await expect(page.getByTestId('talk-room')).toHaveCount(1);
  await expect(page.getByTestId('talk-room').first()).toHaveAttribute('data-id', 'team');
  await expect(page.getByTestId('talk-room').first()).toContainText('회사 멤버');

  await page.getByTestId('talk-new').click();
  await page.getByTestId('talk-new-name').fill('고객 상담');
  await page.getByTestId('talk-member').filter({ has: page.locator('[value="고객"]') }).or(page.locator('[data-testid="talk-member"][value="고객"]')).first().check();
  await page.getByTestId('talk-create').click();
  await expect(page.getByTestId('talk-title')).toHaveText('고객 상담');

  // 방이 열린 채 사인물을 고르면 링크가 붙는다 — 속성창은 뜨지 않는다
  await page.getByTestId('sign-shape').first().click();
  await expect(page.getByTestId('talk-pending-ref')).toHaveText(/간판/);
  await expect(page.getByTestId('object-panel')).toHaveCount(0);
  await page.getByTestId('chat-input').fill('이 간판 크기 보세요');
  await page.getByTestId('chat-send').click();
  await expect(page.getByTestId('talk-ref')).toHaveCount(1);
  await expect(page.getByTestId('talk-pending-ref')).toHaveCount(0);

  // 고객: 상단 [톡]에 안 읽은 수, 회사 멤버 방은 안 보이고 초대된 방만
  await expect(guest.getByTestId('talk-unread')).toHaveText('1');
  await guest.getByTestId('talk-open').click();
  await expect(guest.getByTestId('talk-room')).toHaveCount(1);
  await expect(guest.getByTestId('talk-room')).toContainText('고객 상담');
  await guest.getByTestId('talk-room').click();
  await expect(guest.getByTestId('chat-bubble')).toContainText('이 간판 크기 보세요');
  await expect(guest.getByTestId('talk-unread')).toHaveCount(0);
  await guest.getByTestId('talk-ref').click();
  await expect.poll(() => guest.evaluate(() => (window as unknown as G).__ganpanda.selectedId)).toBe(signId);
  await expect(guest.getByTestId('talk-pending-ref')).toHaveCount(0); // 링크로 고른 건 다시 붙지 않는다

  // 고객 답장(서버 경유) — 사진 빈 곳을 탭하면 사진 링크
  const img = (await guest.getByTestId('photo-img').first().boundingBox())!;
  await guest.mouse.click(img.x + img.width * 0.5, img.y + img.height * 0.9);
  await expect(guest.getByTestId('talk-pending-ref')).toHaveText(/📷/);
  await guest.getByTestId('chat-input').fill('네 확인했어요');
  await guest.getByTestId('chat-send').click();
  await expect(page.getByTestId('chat-bubble')).toHaveCount(2);
  await expect(page.getByTestId('talk-ref')).toHaveCount(2);

  // 📍: 사진에 번호(숫자만)를 찍으면 그 번호가 링크로 — 말풍선 창은 뜨지 않는다
  await page.getByTestId('talk-pin').click();
  const pb = (await page.getByTestId('photo-img').first().boundingBox())!;
  await page.mouse.click(pb.x + pb.width * 0.2, pb.y + pb.height * 0.8);
  await expect(page.getByTestId('talk-pending-ref')).toHaveText(/📍 #1/);
  await expect(page.getByTestId('pin-num')).toHaveText('1');
  await expect(page.getByTestId('pin-panel')).toHaveCount(0);
  await guest.ctx.close();
});

test('톡: 회사 멤버 방은 고객에게 보이지 않고 알림도 가지 않는다', async ({ page, request, browser }) => {
  const { session, projectId } = await openOwnedProject(page, request);
  const guest = await openInvited(browser, await apiCreateInvite(request, session, projectId, 'viewer'), '고객');
  await page.getByTestId('talk-open').click();
  await page.getByTestId('talk-room').first().click();
  await expect(page.getByTestId('talk-title')).toHaveText('회사 멤버');
  await page.getByTestId('chat-input').fill('내부 공유');
  await page.getByTestId('chat-send').click();
  await expect(page.getByTestId('chat-bubble')).toHaveCount(1);
  await guest.waitForTimeout(800);
  await expect(guest.getByTestId('talk-unread')).toHaveCount(0);
  await expect(guest.getByTestId('toast')).toHaveCount(0);
  await guest.getByTestId('talk-open').click();
  await expect(guest.getByTestId('talk-room')).toHaveCount(0);
  await guest.ctx.close();
});

test('휴대폰 톡: 창은 아래쪽 약 40% — 위에서 보드를 보며 사인물을 탭하면 링크가 붙고 속성창은 뜨지 않는다', async ({ page, request }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await openOwnedProject(page, request);
  await uploadPhoto(page);
  await page.evaluate(() => {
    const a = (window as unknown as G).__ganpanda;
    a.project.addObject({ photoId: a.photos[0].id, name: '간판', shape: 'rect', quad: [[300, 200], [1100, 200], [1100, 420], [300, 420]], sheetIds: [], widthMm: 4000, heightMm: 1000 });
  });
  await page.getByTestId('talk-open').click();
  const panel = (await page.getByTestId('talk-panel').boundingBox())!;
  expect(panel.y).toBeGreaterThan(800 * 0.5);
  expect(panel.height).toBeGreaterThan(800 * 0.35);
  await page.getByTestId('talk-room').first().click();
  const s = (await page.getByTestId('sign-shape').first().boundingBox())!;
  expect(s.y + s.height / 2).toBeLessThan(panel.y); // 사인물이 창 위에 보인다
  await page.mouse.click(s.x + s.width / 2, s.y + s.height / 2);
  await expect(page.getByTestId('talk-pending-ref')).toHaveText(/간판/);
  await expect(page.getByTestId('quick-bar')).toHaveCount(0);
});
