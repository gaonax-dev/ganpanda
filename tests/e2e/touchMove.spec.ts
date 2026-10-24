// 터치: 사인물 이동은 먼저 탭으로 고른 뒤(손을 뗀 뒤) 다시 끌 때만 (2026-10-24 사용자: "사인물 이동은 터치에서는 선택 터치업 이후에 다시 드래그에서 작동하게")
import { expect, test, type Page } from '@playwright/test';
import { openOwnedProject, uploadPhoto } from './helpers';

async function touch(page: Page, type: string, x: number, y: number) {
  await page.evaluate(({ type, x, y }) => {
    const target = document.elementFromPoint(x, y)!;
    target.dispatchEvent(new PointerEvent(type, { pointerId: 7, pointerType: 'touch', isPrimary: true, clientX: x, clientY: y, bubbles: true, cancelable: true, composed: true, button: 0, buttons: type === 'pointerup' ? 0 : 1 }));
  }, { type, x, y });
}
async function drag(page: Page, from: { x: number; y: number }, dx: number) {
  await touch(page, 'pointerdown', from.x, from.y);
  for (let i = 1; i <= 5; i++) await touch(page, 'pointermove', from.x + (dx * i) / 5, from.y);
  await touch(page, 'pointerup', from.x + dx, from.y);
}
type W = { __ganpanda: { photos: { id: string }[]; selectedId: string | null; objects: { id: string; quad: number[][] }[]; project: { addObject(o: unknown): string } } };

test('사진 위 사인물: 안 고른 것을 끌면 움직이지 않고(화면 이동), 탭 → 손 뗌 → 다시 끌면 움직인다', async ({ page, request }) => {
  await openOwnedProject(page, request);
  await uploadPhoto(page);
  const id = await page.evaluate(() => { const a = (window as unknown as W).__ganpanda; return a.project.addObject({ photoId: a.photos[0].id, name: 'A', shape: 'rect', quad: [[500, 300], [1100, 300], [1100, 600], [500, 600]], sheetIds: [], widthMm: 3000, heightMm: 1500 }); });
  const quadX = () => page.evaluate((id) => (window as unknown as W).__ganpanda.objects.find((o) => o.id === id)!.quad[0][0], id);
  const sel = () => page.evaluate(() => (window as unknown as W).__ganpanda.selectedId);
  const box = async () => (await page.locator(`[data-testid="sign-shape"][data-id="${id}"]`).boundingBox())!;
  let b = await box();
  await drag(page, { x: b.x + b.width / 2, y: b.y + b.height / 2 }, 60);
  expect(await quadX()).toBe(500); // 안 움직임
  expect(await sel()).toBeNull(); // 끌기는 고르기도 아님
  b = await box();
  const c = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  await touch(page, 'pointerdown', c.x, c.y);
  await touch(page, 'pointerup', c.x, c.y); // 탭 = 고르기
  await expect.poll(sel).toBe(id);
  expect(await quadX()).toBe(500);
  await drag(page, c, 60); // 고른 뒤 다시 끌기 = 이동
  await expect.poll(quadX).toBeGreaterThan(520);
});

test('보드 카드도: 안 고른 카드를 끌면 그대로, 탭 → 손 뗌 → 다시 끌면 옮겨진다', async ({ page, request }) => {
  await openOwnedProject(page, request);
  await uploadPhoto(page);
  const id = await page.evaluate(() => { const a = (window as unknown as W).__ganpanda; return a.project.addObject({ photoId: a.photos[0].id, name: 'A', shape: 'rect', quad: [[500, 300], [1100, 300], [1100, 600], [500, 600]], sheetIds: [], widthMm: 3000, heightMm: 1500 }); });
  const card = page.locator(`[data-testid="board-card"][data-id="${id}"]`);
  await expect(card).toBeVisible();
  await page.getByTestId('zoom-fit').click(); // 카드가 화면 안에
  const cx = async () => { const b = (await card.boundingBox())!; return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };
  const sel = () => page.evaluate(() => (window as unknown as W).__ganpanda.selectedId);
  const c0 = await cx();
  const placed = () => page.evaluate((id) => (window as unknown as { __ganpanda: { flatPlaced: Map<string, { x: number }> } }).__ganpanda.flatPlaced.get(id)!.x, id);
  const x0 = await placed();
  await drag(page, c0, 80);
  expect(await placed()).toBeCloseTo(x0, 0); // 카드는 제자리
  expect((await cx()).x).toBeGreaterThan(c0.x + 40); // 화면이 움직였다 (한 손가락 팬)
  expect(await sel()).toBeNull();
  const c1 = await cx();
  await touch(page, 'pointerdown', c1.x, c1.y);
  await touch(page, 'pointerup', c1.x, c1.y);
  await expect.poll(sel).toBe(id);
  await drag(page, c1, 80);
  await expect.poll(placed).toBeGreaterThan(x0 + 1);
});

test('존: 손가락으로 끌면 존이 골라지지 않고 화면이 움직인다, 탭하면 골라진다 (2026-10-24 "터치 드래그에 존이 선택된다")', async ({ page, request }) => {
  await openOwnedProject(page, request);
  await uploadPhoto(page);
  await page.evaluate(() => { const a = (window as unknown as { __ganpanda: { photos: { id: string }[]; addZone(p: string, z: number[][]): void } }).__ganpanda; a.addZone(a.photos[0].id, [[300, 300], [1200, 300], [1200, 800], [300, 800]]); (a as unknown as { selectZone(z: null): void }).selectZone(null); }); // 만들면 골라지므로 비우고 시작
  const zone = page.getByTestId('zone-shape').first();
  const zsel = () => page.evaluate(() => (window as unknown as { __ganpanda: { zoneSel: unknown } }).__ganpanda.zoneSel);
  const b = (await zone.boundingBox())!;
  const c = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  await drag(page, c, 60);
  expect(await zsel()).toBeNull();
  expect((await zone.boundingBox())!.x - b.x).toBeGreaterThan(40);
  const b2 = (await zone.boundingBox())!;
  const c2 = { x: b2.x + b2.width / 2, y: b2.y + b2.height / 2 };
  await touch(page, 'pointerdown', c2.x, c2.y);
  await touch(page, 'pointerup', c2.x, c2.y);
  await expect.poll(zsel).not.toBeNull();
});
