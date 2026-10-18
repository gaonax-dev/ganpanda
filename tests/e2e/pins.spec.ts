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
  // 소유자(작성자)가 완료 → 화면에서 사라지고 사진 머리의 ✓ 완료 목록에서 다시 연다 (2026-10-18)
  await page.getByTestId('pin-resolve').click();
  await expect(page.getByTestId('pin')).toHaveCount(0);
  await expect(guest.getByTestId('pin')).toHaveCount(0);
  await expect(page.getByTestId('photo-confirms')).toContainText('1');
  await page.getByTestId('photo-confirms').dispatchEvent('click'); // 사진 머리는 CSS 로 축소돼 있어 좌표 클릭 대신
  await page.getByTestId('confirm-item').dispatchEvent('click');
  await expect(page.getByTestId('pin-panel')).toContainText('완료됨');
  await page.getByTestId('pin-resolve').click(); // 다시 열기 → 화면에 돌아온다
  await expect(page.getByTestId('pin')).toHaveCount(1);
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

test('편집 권한은 말풍선을 끌어 옮기고(안쪽 = 전체, 변 = 몸통만, 꼭지 손잡이 = 꼭지만) 삭제할 수 있다', async ({ page, request }) => {
  await openOwnedProject(page, request);
  await uploadPhoto(page);
  await page.keyboard.press('p');
  await clickPhoto(page, 800, 300);
  const pinOf = () => page.evaluate(() => { const p = (window as unknown as { __ganpanda: { pins: { x: number; y: number; bx?: number; by?: number }[] } }).__ganpanda.pins[0]; return { x: p.x, y: p.y, bx: p.bx, by: p.by }; });
  const drag = async (b: { x: number; y: number; width: number; height: number }, fx: number, fy: number, dx: number, dy: number) => { await page.mouse.move(b.x + b.width * fx, b.y + b.height * fy); await page.mouse.down(); await page.mouse.move(b.x + b.width * fx + dx, b.y + b.height * fy + dy, { steps: 6 }); await page.mouse.up(); };
  // 안쪽 끌기 = 전체 이동 (꼭지도 움직인다, 몸통 오프셋은 그대로)
  const p0 = await pinOf();
  await drag((await page.getByTestId('pin-inner').boundingBox())!, 0.5, 0.5, 80, 40);
  const p1 = await pinOf();
  expect(p1.x - p0.x).toBeGreaterThan(60);
  expect(p1.bx).toBeUndefined();
  // 변 끌기 = 몸통만 (꼭지 그대로) — 2026-10-18 "말풍선의 변을 클릭드래그하면 풍선만 이동 꼭지점은 같은자리 유지"
  const ib = (await page.getByTestId('pin-inner').boundingBox())!; // 안쪽 상자는 변에서 5px 안 → 윗변은 그 5px 위
  await drag({ x: ib.x, y: ib.y - 5, width: ib.width, height: 1 }, 0.5, 0, 60, -30); // 윗변 가운데
  const p2 = await pinOf();
  expect(p2.x).toBe(p1.x); expect(p2.y).toBe(p1.y);
  expect(p2.bx).toBeDefined(); expect(p2.by).toBeDefined();
  // 꼭지 손잡이 끌기 = 꼭지만 (몸통은 그 자리)
  const bodyBefore = (await page.getByTestId('pin-inner').boundingBox())!;
  await drag((await page.getByTestId('pin-tip').boundingBox())!, 0.5, 0.5, -50, 30);
  const p3 = await pinOf();
  expect(p3.x).toBeLessThan(p2.x);
  const bodyAfter = (await page.getByTestId('pin-inner').boundingBox())!;
  expect(Math.abs(bodyAfter.x - bodyBefore.x)).toBeLessThan(3);
  await page.getByTestId('pin-inner').click(); // 안쪽 클릭 = 열기
  await expect(page.getByTestId('pin-panel')).toBeVisible();
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
  await page.getByTestId('object-chat-open').click(); // 속성 패널의 💬 → 말풍선 창 (2026-10-18)
  await page.getByTestId('object-chat').getByTestId('chat-input').fill('두께 150으로 갈까요');
  await page.getByTestId('object-chat').getByTestId('chat-input').press('Enter');
  await expect(page.getByTestId('object-bubble')).toHaveCount(1);
  await expect(page.getByTestId('object-bubble-last')).toHaveText(/나: 두께 150으로 갈까요/);
  // 치수를 넣으면 정면도 카드에도 같은 말풍선 (2026-10-18 "정면도들에게도 적용")
  await page.evaluate(() => { const app = (window as unknown as { __ganpanda: { objects: { id: string }[]; project: { updateObject(id: string, p: unknown): void } } }).__ganpanda; app.project.updateObject(app.objects[0].id, { widthMm: 3000, heightMm: 600 }); });
  await expect(page.getByTestId('board-card')).toHaveCount(1);
  await expect(page.getByTestId('board-card').getByTestId('card-bubble')).toHaveCount(1);
  // 선택을 풀고 말풍선을 누르면 다시 선택되고 대화가 보인다
  await page.keyboard.press('Escape');
  await page.getByTestId('board-canvas').click({ position: { x: 20, y: 400 } });
  await expect(page.getByTestId('object-panel')).toHaveCount(0);
  await page.getByTestId('object-bubble').click();
  await expect(page.getByTestId('object-chat')).toBeVisible();
  await expect(page.getByTestId('object-chat').getByTestId('chat-bubble')).toContainText('두께 150');
  await page.getByTestId('object-chat-close').click();
  await expect(page.getByTestId('object-panel')).toBeVisible(); // 닫으면 속성 패널
});

test('꼭지가 가리키는 사인물: 말풍선 창의 [속성] 단추로 사인물 선택, 사인물 패널의 [💬 #n] 단추로 말풍선 선택 (2026-10-18)', async ({ page, request }) => {
  await openOwnedProject(page, request);
  await uploadPhoto(page);
  await page.keyboard.press('t');
  const b = (await page.getByTestId('photo-img').first().boundingBox())!;
  const k = b.width / 1600;
  await page.mouse.move(b.x + 300 * k, b.y + 200 * k); await page.mouse.down(); await page.mouse.move(b.x + 700 * k, b.y + 320 * k, { steps: 4 }); await page.mouse.up();
  await page.keyboard.press('Escape');
  await page.keyboard.press('p');
  await clickPhoto(page, 500, 260); // 사인물 안
  await expect(page.getByTestId('pin-panel')).toBeVisible();
  await expect(page.getByTestId('pin-goto-object')).toContainText('속성');
  await page.getByTestId('pin-goto-object').click();
  await expect(page.getByTestId('object-panel')).toBeVisible();
  await expect(page.getByTestId('object-goto-bubble')).toHaveCount(1);
  await page.getByTestId('object-goto-bubble').click();
  await expect(page.getByTestId('pin-panel')).toBeVisible();
  // 완료 → 사인물 속성의 컨펌 리스트에 남고 화면에서는 사라진다 (2026-10-18)
  await page.getByTestId('pin-resolve').click();
  await expect(page.getByTestId('pin')).toHaveCount(0);
  await page.getByTestId('pin-goto-object').click();
  await expect(page.getByTestId('object-goto-bubble')).toHaveCount(0);
  await expect(page.getByTestId('object-confirm-item')).toHaveCount(1);
  await page.getByTestId('object-confirm-item').click();
  await expect(page.getByTestId('pin-panel')).toContainText('완료됨');
  await page.keyboard.press('Escape');
  // 사인물 밖의 말풍선에는 단추가 없다
  await page.keyboard.press('Escape');
  await page.keyboard.press('p');
  await clickPhoto(page, 1000, 650); // 오른쪽 말풍선 창에 가리지 않는 자리
  await expect(page.getByTestId('pin-panel')).toContainText('#2');
  await expect(page.getByTestId('pin-goto-object')).toHaveCount(0);
});
