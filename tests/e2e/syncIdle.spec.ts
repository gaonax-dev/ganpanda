// 실시간 방 비용 줄이기 (2026-10-27 사용자: "하루에 1000$는 감당하기 어렵지" → "진행해주고")
// 실시간 방(Durable Object)은 할 일이 없으면 잠들어 과금이 멈춘다. 그런데 ① 접속자 표시가 15초마다 갱신되고
// ② 서버에서 30초 동안 아무것도 안 오면 y-websocket 이 다시 연결해서 방이 계속 깨어 있었다.
// → 혼자일 땐 표시 갱신을 멈추고, 연결 유지는 방을 깨우지 않는 ping/pong(서버 자동 응답)으로, 화면을 안 보거나 오래 손대지 않으면 연결을 쉰다.
import { expect, test, type Browser, type Page, type WebSocket } from '@playwright/test';
import { apiCreateInvite, apiCreateProject, apiLogin, apiSetPlan, openInvited } from './helpers';

async function newRoom(request: import('@playwright/test').APIRequestContext) {
  const session = await apiLogin(request);
  await apiSetPlan(request, session, 'basic');
  const projectId = await apiCreateProject(request, session);
  return { session, projectId, invite: await apiCreateInvite(request, session, projectId, 'editor') };
}
/** 방 소켓과 보낸 프레임 기록 */
function watch(page: Page) {
  const log = { sockets: 0, frames: [] as { t: number; text: boolean; payload: string }[] };
  page.on('websocket', (ws: WebSocket) => {
    if (!ws.url().includes('/rooms/')) return;
    log.sockets++;
    ws.on('framesent', (f) => log.frames.push({ t: Date.now(), text: typeof f.payload === 'string', payload: typeof f.payload === 'string' ? f.payload : `bin${f.payload.length}` }));
  });
  return log;
}
async function openOwner(browser: Browser, room: Awaited<ReturnType<typeof newRoom>>, timing?: { hiddenMs: number; idleMs: number }) {
  const page = await (await browser.newContext()).newPage();
  const log = watch(page);
  await page.goto('/');
  await page.evaluate(([s, t]) => { localStorage.setItem('ganpanda.session', s); localStorage.setItem('ganpanda.nickname', '제작자'); localStorage.setItem('ganpanda.touchHelp', 'off'); if (t) localStorage.setItem('ganpanda.test.syncTiming', t); }, [room.session, timing ? JSON.stringify(timing) : ''] as const);
  await page.goto(`/?room=${room.projectId}`);
  await expect(page.getByTestId('sync-status')).toHaveAttribute('data-status', 'online');
  return { page, log };
}
const setHidden = (page: Page, hidden: boolean) => page.evaluate((h) => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (h ? 'hidden' : 'visible') });
  document.dispatchEvent(new Event('visibilitychange'));
}, hidden);

test('혼자 연 프로젝트는 40초 동안 다시 연결하지 않고, 서버로 보내는 건 방을 깨우지 않는 ping 뿐', async ({ browser, request }) => {
  test.setTimeout(90_000);
  const room = await newRoom(request);
  const { page, log } = await openOwner(browser, room);
  await page.waitForTimeout(8000); // 처음 동기화·알리기
  const from = Date.now();
  await page.waitForTimeout(40_000); // y-websocket 재연결 기준(30초)·표시 갱신(15초)보다 길게
  expect(log.sockets).toBe(1);
  const later = log.frames.filter((f) => f.t >= from);
  expect(later.filter((f) => !f.text)).toEqual([]); // 표시 갱신(바이너리) 없음
  expect(later.filter((f) => f.text).map((f) => f.payload)).toContain('ping');
  await expect(page.getByTestId('sync-status')).toHaveAttribute('data-status', 'online');
});

test('혼자였다가 다른 사람이 들어오면 서로 보이고, 나가면 사라진다', async ({ browser, request }) => {
  const room = await newRoom(request);
  const { page: a } = await openOwner(browser, room);
  await a.waitForTimeout(7000); // 혼자 → 표시 갱신 멈춤
  const b = await openInvited(browser, room.invite, '고객');
  await expect(a.getByTestId('peer')).toContainText('고객');
  await expect(b.getByTestId('peer')).toContainText('제작자');
  await b.ctx.close();
  await expect(a.getByTestId('peer')).toHaveCount(0);
});

test('화면을 안 보면(숨김) 잠시 뒤 연결을 쉬고, 다시 보면 바로 이어 붙인다', async ({ browser, request }) => {
  const room = await newRoom(request);
  const { page, log } = await openOwner(browser, room, { hiddenMs: 1000, idleMs: 600_000 });
  await setHidden(page, true);
  await expect(page.getByTestId('sync-status')).toHaveAttribute('data-status', 'paused', { timeout: 5000 });
  await setHidden(page, false);
  await expect(page.getByTestId('sync-status')).toHaveAttribute('data-status', 'online');
  expect(log.sockets).toBe(2);
});

test('오래 손대지 않으면 연결을 쉬고, 손대면 이어 붙인다', async ({ browser, request }) => {
  const room = await newRoom(request);
  const { page } = await openOwner(browser, room, { hiddenMs: 60_000, idleMs: 2000 });
  await expect(page.getByTestId('sync-status')).toHaveAttribute('data-status', 'paused', { timeout: 8000 });
  await expect(page.getByTestId('sync-status')).toHaveAttribute('title', /쉬는 중/);
  await page.mouse.click(300, 300);
  await expect(page.getByTestId('sync-status')).toHaveAttribute('data-status', 'online');
});
