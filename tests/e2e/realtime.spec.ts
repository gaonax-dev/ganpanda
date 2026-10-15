import { expect, test, type APIRequestContext, type Browser, type Page } from '@playwright/test';
import { apiCreateInvite, apiCreateProject, apiLogin, dragOnPhoto, openInvited, openObjectSettings, uploadPhoto } from './helpers';

/** 소유자(제작자)가 만든 프로젝트와 editor 초대 링크 */
async function newRoom(request: APIRequestContext) {
  const session = await apiLogin(request);
  const projectId = await apiCreateProject(request, session);
  return { session, projectId, invite: await apiCreateInvite(request, session, projectId, 'editor') };
}
async function open(browser: Browser, room: Awaited<ReturnType<typeof newRoom>>, name: string): Promise<Page> {
  if (name === '제작자') {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto('/');
    await page.evaluate(([s, n]) => { localStorage.setItem('ganpanda.session', s); localStorage.setItem('ganpanda.nickname', n); }, [room.session, name]);
    await page.goto(`/?room=${room.projectId}`);
    await expect(page.getByTestId('sync-status')).toHaveAttribute('data-status', 'online');
    return page;
  }
  return openInvited(browser, room.invite, name);
}

test('두 사람이 같은 방에서 사진·영역·대화를 실시간으로 공유한다', async ({ browser, request }) => {
  const room = await newRoom(request);
  const a = await open(browser, room, '제작자');
  const b = await open(browser, room, '고객');

  await uploadPhoto(a);
  await expect(b.getByTestId('photo-zone')).toHaveCount(1);
  await expect(b.getByTestId('photo-img')).toBeVisible(); // 사진 바이트가 서버를 거쳐 도착

  await a.keyboard.press('r');
  await dragOnPhoto(a, [400, 200], [800, 300]);
  await expect(b.getByTestId('sign-shape')).toHaveCount(1);

  await b.getByTestId('sign-shape').click();
  await b.getByTestId('chat-input').fill('크기 확인 부탁드려요');
  await b.getByTestId('chat-input').press('Enter');
  await expect(a.getByTestId('chat-bubble')).toContainText('크기 확인 부탁드려요');
  await expect(a.getByTestId('chat-bubble')).not.toHaveClass(/mine/);
});

test('접속자 표시: 들어오면 보이고 나가면 사라진다', async ({ browser, request }) => {
  const room = await newRoom(request);
  const a = await open(browser, room, '제작자');
  const b = await open(browser, room, '고객');
  await expect(a.getByTestId('peer')).toHaveCount(1);
  await expect(a.getByTestId('peer')).toContainText('고객');
  await expect(b.getByTestId('peer')).toContainText('제작자');
  await b.context().close();
  await expect(a.getByTestId('peer')).toHaveCount(0);
});

test('상대방의 커서가 사진 보드에 보인다', async ({ browser, request }) => {
  const room = await newRoom(request);
  const a = await open(browser, room, '제작자');
  const b = await open(browser, room, '고객');
  await uploadPhoto(a);
  await expect(b.getByTestId('photo-img')).toBeVisible();
  const box = (await b.getByTestId('board-canvas').boundingBox())!;
  await b.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await b.mouse.move(box.x + box.width / 2 + 30, box.y + box.height / 2 + 10);
  await expect(a.getByTestId('peer-cursor')).toHaveCount(1);
  await expect(a.getByTestId('peer-cursor')).toContainText('고객');
});

test('나중에 들어온 사람도 이전 작업을 모두 받고, 새로고침해도 서버에서 복원된다', async ({ browser, request }) => {
  const room = await newRoom(request);
  const a = await open(browser, room, '제작자');
  await uploadPhoto(a);
  await a.keyboard.press('r');
  await dragOnPhoto(a, [400, 200], [800, 300]);
  await openObjectSettings(a);
  await a.getByTestId('width-mm').fill('4000');
  await a.waitForTimeout(300);
  await a.context().close();

  const b = await open(browser, room, '고객');
  await expect(b.getByTestId('photo-img')).toBeVisible();
  await expect(b.getByTestId('sign-shape')).toHaveCount(1);
  await b.getByTestId('sign-shape').click();
  await openObjectSettings(b);
  await expect(b.getByTestId('width-mm')).toHaveValue('4000');
});

test('접속자 표시: 상대가 탭을 숨기거나(휴대폰 백그라운드) 페이지를 떠나면 바로 사라지고, 돌아오면 다시 보인다', async ({ browser, request }) => {
  const room = await newRoom(request);
  const a = await open(browser, room, '제작자');
  const b = await open(browser, room, '고객');
  await expect(a.getByTestId('peer')).toHaveCount(1);
  const setVisibility = (state: 'hidden' | 'visible') => b.evaluate((s) => {
    Object.defineProperty(document, 'visibilityState', { value: s, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  }, state);
  await setVisibility('hidden');
  await expect(a.getByTestId('peer')).toHaveCount(0, { timeout: 5000 });
  await setVisibility('visible');
  await expect(a.getByTestId('peer')).toHaveCount(1, { timeout: 5000 });
  // 페이지를 떠남(pagehide) — 소켓이 바로 닫히지 않아도 사라진다
  await b.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })));
  await expect(a.getByTestId('peer')).toHaveCount(0, { timeout: 5000 });
});
