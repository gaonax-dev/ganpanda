// 치수 블록도 사인물과 같은 선택·조작·생성 규칙 (2026-11-04 사용자: "사인물 선택후 선택과 컨트롤러 제어 그리고 생성의 규칙을 블록에도 적용해줘")
/* eslint-disable @typescript-eslint/no-explicit-any */
import { expect, test, type Page } from '@playwright/test';
import { dragOnPhoto, openOwnedProject, uploadPhoto } from './helpers';

async function touch(page: Page, type: string, x: number, y: number) {
  await page.evaluate(({ type, x, y }) => {
    const target = document.elementFromPoint(x, y)!;
    target.dispatchEvent(new PointerEvent(type, { pointerId: 7, pointerType: 'touch', isPrimary: true, clientX: x, clientY: y, bubbles: true, cancelable: true, composed: true, button: 0, buttons: type === 'pointerup' ? 0 : 1 }));
  }, { type, x, y });
}
async function tdrag(page: Page, from: { x: number; y: number }, dx: number) {
  await touch(page, 'pointerdown', from.x, from.y);
  for (let i = 1; i <= 5; i++) await touch(page, 'pointermove', from.x + (dx * i) / 5, from.y);
  await touch(page, 'pointerup', from.x + dx, from.y);
}
const blocks = (page: Page) => page.evaluate(() => (window as any).__ganpanda.photos[0].blocks ?? []);

test('생성: 블록을 그리면 새 블록이 선택되고 도구는 [선택]으로 — [연속]을 켜면 블록 도구 유지 (사각과 같게)', async ({ page, request }) => {
  await openOwnedProject(page, request, '블록 생성 규칙');
  await uploadPhoto(page);
  await page.getByTestId('tool-block').click();
  await expect(page.getByTestId('tool-continuous')).toBeVisible(); // 사각처럼 [다중] 자리가 [연속]
  await dragOnPhoto(page, [200, 200], [400, 300]);
  await expect.poll(async () => (await blocks(page)).length).toBe(1);
  await expect(page.getByTestId('tool-block')).not.toHaveClass(/on/);
  await expect(page.getByTestId('tool-select')).toHaveClass(/on/);
  expect(await page.evaluate(() => (window as any).__ganpanda.selectedBlock)).toMatchObject({ i: 0 });
  // 연속: 켜면 그린 뒤에도 블록 도구
  await page.getByTestId('tool-block').click();
  await page.getByTestId('tool-continuous').click();
  await dragOnPhoto(page, [500, 200], [700, 300]);
  await dragOnPhoto(page, [800, 200], [1000, 300]);
  await expect.poll(async () => (await blocks(page)).length).toBe(3);
  await expect(page.getByTestId('tool-block')).toHaveClass(/on/);
});

test('조작: Alt+끌기 = 제자리 복사본을 끈다, ⌘D = 복제 (사인물과 같게)', async ({ page, request }) => {
  await openOwnedProject(page, request, '블록 복제 규칙');
  await uploadPhoto(page);
  await page.evaluate(() => { const g = (window as any).__ganpanda; g.project.updatePhoto(g.photos[0].id, { blocks: [{ q: [[200, 200], [400, 200], [400, 300], [200, 300]], w: 2000 }] }); g.selectBlock(g.photos[0].id, 0); });
  const poly = page.locator('[data-testid="size-block"][data-index="0"] polygon');
  const b = (await poly.boundingBox())!;
  await page.keyboard.down('Alt');
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2 + 80, b.y + b.height / 2, { steps: 5 }); await page.mouse.up();
  await page.keyboard.up('Alt');
  await expect.poll(async () => (await blocks(page)).length).toBe(2);
  const bs = await blocks(page);
  expect(bs[0].q[0][0]).toBe(200); // 원본은 그대로
  expect(bs[1].q[0][0]).toBeGreaterThan(220); // 복사본이 옮겨졌다
  expect(bs[1].w).toBe(2000); // 치수도 같이
  expect(await page.evaluate(() => (window as any).__ganpanda.selectedBlock.i)).toBe(1);
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+d' : 'Control+d');
  await expect.poll(async () => (await blocks(page)).length).toBe(3);
  expect(await page.evaluate(() => (window as any).__ganpanda.selectedBlock.i)).toBe(2);
});

test('선택(터치): 안 고른 블록을 끌면 움직이지 않고, 탭으로 고른 뒤 다시 끌면 움직인다 (사인물과 같게)', async ({ page, request }) => {
  await openOwnedProject(page, request, '블록 터치 규칙');
  await uploadPhoto(page);
  await page.evaluate(() => { const g = (window as any).__ganpanda; g.project.updatePhoto(g.photos[0].id, { blocks: [{ q: [[500, 300], [1100, 300], [1100, 600], [500, 600]], w: 2000 }] }); });
  const box = async () => (await page.locator('[data-testid="size-block"][data-index="0"] polygon').boundingBox())!;
  const x0 = async () => (await blocks(page))[0].q[0][0];
  let b = await box();
  await tdrag(page, { x: b.x + b.width / 2, y: b.y + b.height / 2 }, 60);
  expect(await x0()).toBe(500);
  expect(await page.evaluate(() => (window as any).__ganpanda.selectedBlock)).toBeNull();
  b = await box();
  const c = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  await touch(page, 'pointerdown', c.x, c.y); await touch(page, 'pointerup', c.x, c.y);
  await expect.poll(() => page.evaluate(() => (window as any).__ganpanda.selectedBlock?.i ?? null)).toBe(0);
  await tdrag(page, c, 60);
  await expect.poll(x0).toBeGreaterThan(520);
});
