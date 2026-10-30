import { test, expect } from '@playwright/test';
import { openOwnedProject, uploadPhoto } from './helpers';

// 2026-10-30 사용자: "아이폰 문제다 … 두손가락 터치가 간헐적으로 끊어지는 경우가 있어. 이때 화면 위치가 널뛴다."
// 한 손가락이 잠깐 떨어지면(또는 아이폰이 터치를 취소하면) 남은 손가락까지 추적을 잃어, 다시 대도 두 손가락이 안 되고 한 손가락 끌기로 화면이 움직였다
async function ptr(page: import('@playwright/test').Page, type: string, id: number, x: number, y: number) {
  await page.evaluate(({ type, id, x, y }) => {
    const t = document.querySelector('[data-testid="board-canvas"]')!;
    t.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: 'touch', isPrimary: id === 1, clientX: x, clientY: y, bubbles: true, cancelable: true, composed: true, button: 0, buttons: type === 'pointerup' || type === 'pointercancel' ? 0 : 1 }));
  }, { type, id, x, y });
}
const zoomOf = (page: import('@playwright/test').Page) => page.getByTestId('zoom-label').textContent();

test('두 손가락 중 하나가 잠깐 떨어졌다 다시 닿으면 두 손가락 조작이 이어지고 화면이 튀지 않는다', async ({ page, request }) => {
  await openOwnedProject(page, request);
  await uploadPhoto(page);
  const c = (await page.getByTestId('board-canvas').boundingBox())!;
  const cx = c.x + c.width / 2, cy = c.y + c.height / 2;
  // A·B 로 벌려 확대
  await ptr(page, 'pointerdown', 1, cx - 50, cy); await ptr(page, 'pointerdown', 2, cx + 50, cy);
  for (let i = 1; i <= 5; i++) { await ptr(page, 'pointermove', 1, cx - 50 - i * 10, cy); await ptr(page, 'pointermove', 2, cx + 50 + i * 10, cy); }
  const z1 = await zoomOf(page);
  // B 가 잠깐 끊김(취소) — A 는 그대로 닿아 있고 조금 움직인다
  await ptr(page, 'pointercancel', 2, cx + 100, cy);
  await ptr(page, 'pointermove', 1, cx - 102, cy);
  const box1 = (await page.getByTestId('photo-img').boundingBox())!;
  // B 가 새 번호로 다시 닿는다 — 두 손가락이 이어져야 한다 (튀지 않고)
  await ptr(page, 'pointerdown', 3, cx + 100, cy);
  await ptr(page, 'pointermove', 3, cx + 101, cy);
  const box2 = (await page.getByTestId('photo-img').boundingBox())!;
  expect(Math.abs(box2.x - box1.x)).toBeLessThan(5);
  for (let i = 1; i <= 5; i++) { await ptr(page, 'pointermove', 1, cx - 102 - i * 12, cy); await ptr(page, 'pointermove', 3, cx + 101 + i * 12, cy); }
  expect(await zoomOf(page)).not.toBe(z1); // 다시 확대됐다 = 두 손가락으로 이어짐
  await ptr(page, 'pointerup', 1, cx - 162, cy); await ptr(page, 'pointerup', 3, cx + 161, cy);
});

test('한 번에 말이 안 되게 큰 변화(끊긴 터치의 낡은 좌표)는 무시한다', async ({ page, request }) => {
  await openOwnedProject(page, request);
  await uploadPhoto(page);
  const c = (await page.getByTestId('board-canvas').boundingBox())!;
  const cx = c.x + c.width / 2, cy = c.y + c.height / 2;
  await ptr(page, 'pointerdown', 1, cx - 50, cy); await ptr(page, 'pointerdown', 2, cx + 50, cy);
  for (let i = 1; i <= 4; i++) { await ptr(page, 'pointermove', 1, cx - 50 + i * 5, cy + i * 5); await ptr(page, 'pointermove', 2, cx + 50 + i * 5, cy + i * 5); } // 이동으로 정해짐
  const before = (await page.getByTestId('photo-img').boundingBox())!;
  const z = await zoomOf(page);
  await ptr(page, 'pointermove', 2, cx + 50 + 20 + 400, cy + 20 + 300); // 한 번에 500px — 끊긴 터치
  const after = (await page.getByTestId('photo-img').boundingBox())!;
  expect(Math.abs(after.x - before.x)).toBeLessThan(5);
  expect(await zoomOf(page)).toBe(z);
  await ptr(page, 'pointerup', 1, cx, cy); await ptr(page, 'pointerup', 2, cx, cy);
});
