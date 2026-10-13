import { expect, test, type Browser, type Page } from '@playwright/test';
import { dragOnPhoto, uploadPhoto } from './helpers';

async function open(browser: Browser, room: string, name: string): Promise<Page> {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`/?room=${room}`);
  await page.evaluate((n) => localStorage.setItem('ganpanda.nickname', n), name);
  await page.reload();
  await expect(page.getByTestId('sync-status')).toHaveAttribute('data-status', 'online');
  return page;
}
const newRoom = () => 'e2e-rt-' + Math.random().toString(36).slice(2, 10);

test('두 사람이 같은 방에서 사진·영역·대화를 실시간으로 공유한다', async ({ browser }) => {
  const room = newRoom();
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

test('접속자 표시: 들어오면 보이고 나가면 사라진다', async ({ browser }) => {
  const room = newRoom();
  const a = await open(browser, room, '제작자');
  const b = await open(browser, room, '고객');
  await expect(a.getByTestId('peer')).toHaveCount(1);
  await expect(a.getByTestId('peer')).toContainText('고객');
  await expect(b.getByTestId('peer')).toContainText('제작자');
  await b.context().close();
  await expect(a.getByTestId('peer')).toHaveCount(0);
});

test('상대방의 커서가 사진 보드에 보인다', async ({ browser }) => {
  const room = newRoom();
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

test('나중에 들어온 사람도 이전 작업을 모두 받고, 새로고침해도 서버에서 복원된다', async ({ browser }) => {
  const room = newRoom();
  const a = await open(browser, room, '제작자');
  await uploadPhoto(a);
  await a.keyboard.press('r');
  await dragOnPhoto(a, [400, 200], [800, 300]);
  await a.getByTestId('width-mm').fill('4000');
  await a.waitForTimeout(300);
  await a.context().close();

  const b = await open(browser, room, '고객');
  await expect(b.getByTestId('photo-img')).toBeVisible();
  await expect(b.getByTestId('sign-shape')).toHaveCount(1);
  await b.getByTestId('sign-shape').click();
  await expect(b.getByTestId('width-mm')).toHaveValue('4000');
});
