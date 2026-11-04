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

test('원근이 강한 곳의 블록을 눌러도 사라지지 않는다 (2026-11-04 "블록이 클릭하면 갑자기 사라진다" — 씽크대 블록테스트의 자동 원근)', async ({ page, request }) => {
  await openOwnedProject(page, request, '블록 클릭');
  await uploadPhoto(page);
  await page.evaluate(() => {
    const g = (window as any).__ganpanda, p = g.photos[0];
    g.project.updatePhoto(p.id, { w: 3200, h: 2400, camera: { x: [{ a: [1216.4, 3.2], b: [2369.5, 533.5] }, { a: [1305.4, 2399.8], b: [2326.2, 1695.2] }], y: [{ a: [2292.6, 634], b: [3192.7, 406.9] }, { a: [2564.2, 1966.2], b: [3197.2, 2256.7] }], origin: [800, 1680], principal: 'center', axes: { first: '+x', second: '+y' }, auto: true } });
  });
  // 아래쪽(원근이 강한 곳)에 블록 — 그리기와 같은 길(addBlock: 원근에 맞추기 포함)
  await page.evaluate(() => { const g = (window as any).__ganpanda, p = g.photos[0]; g.addBlock(p.id, [[1600, 2000], [1900, 2000], [1900, 2200], [1600, 2200]], [1600, 2000], [1900, 2200], 1); g.selectObject(null); });
  await expect.poll(async () => (await blocks(page)).length).toBe(1);
  const area = (q: number[][]) => Math.abs(q.reduce((a, p, i) => a + p[0] * q[(i + 1) % 4][1] - q[(i + 1) % 4][0] * p[1], 0) / 2);
  const before = (await blocks(page))[0].q;
  expect(area(before)).toBeGreaterThan(1000);
  // 누르기 = 아주 작은 끌기 (트랙패드 클릭처럼 1px 흔들림) 를 몇 번
  for (let k = 0; k < 3; k++) {
    const b = (await page.locator('[data-testid="size-block"][data-index="0"] polygon').boundingBox())!;
    const c = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
    await page.mouse.move(c.x, c.y); await page.mouse.down(); await page.mouse.move(c.x + 1, c.y, { steps: 1 }); await page.mouse.up();
  }
  // 클릭이 결국 하는 일: 같은 외곽선으로 블록 고치기(원근에 다시 맞추기) — 여러 번 해도 그대로여야
  for (let k = 0; k < 3; k++) await page.evaluate(() => { const g = (window as any).__ganpanda, p = g.photos[0]; g.updateBlock(p.id, 0, g.photos[0].blocks[0].q); });
  const after = (await blocks(page))[0].q;
  expect(area(after)).toBeGreaterThan(area(before) * 0.8); // 한 점으로 접히지 않는다
  await expect(page.locator('[data-testid="size-block"][data-index="0"] polygon')).toBeVisible();
  // 골랐을 때 그리드가 지평선을 넘어 사진 밖 멀리 튀지 않는다 (2026-11-04 "치수 블록 1 선택하면 그리드 에러")
  await page.evaluate(() => { const g = (window as any).__ganpanda; g.selectBlock(g.photos[0].id, 0); });
  const grid = page.getByTestId('block-grid');
  await expect(grid).toBeVisible();
  const ph = (await page.getByTestId('photo-img').boundingBox())!;
  const gb = await grid.evaluate((e) => { const b = (e as SVGGraphicsElement).getBBox(); return { width: b.width, height: b.height }; });
  const k = ph.width / 3200; // 사진 px → 화면
  expect(gb.width * k).toBeLessThan(ph.width * 4);
  expect(gb.height * k).toBeLessThan(ph.height * 4);
});

test('블록 패널: 치수를 넣고 엔터 → 입력 반영·포커스 해제, 화면 빈 곳을 눌러도 포커스 해제·반영 (2026-11-04 "입력 후 엔터나 화면밖 클릭에 포스해제와 입력이 안된다")', async ({ page, request }) => {
  await openOwnedProject(page, request, '블록 입력');
  await uploadPhoto(page);
  await page.evaluate(() => { const g = (window as any).__ganpanda; g.project.updatePhoto(g.photos[0].id, { blocks: [{ q: [[200, 200], [400, 200], [400, 300], [200, 300]] }, { q: [[600, 200], [800, 200], [800, 300], [600, 300]] }] }); g.selectBlock(g.photos[0].id, 0); });
  const w = page.getByTestId('block-width');
  await w.click();
  await page.keyboard.type('3000');
  await page.keyboard.press('Enter');
  await expect(w).not.toBeFocused();
  await expect.poll(async () => (await blocks(page))[0].w).toBe(3000);
  // 세로를 넣고 화면(보드 빈 곳)을 누르면
  const h = page.getByTestId('block-height');
  await h.click();
  await page.keyboard.type('600');
  const cv = (await page.getByTestId('board-canvas').boundingBox())!;
  await page.mouse.click(cv.x + 30, cv.y + cv.height - 120);
  expect(await page.evaluate(() => document.activeElement?.tagName)).not.toBe('INPUT'); // 포커스 해제 (빈 곳을 누르면 선택도 풀려 패널이 닫힌다)
  await expect.poll(async () => (await blocks(page))[0].h).toBe(600);
  // 다른 블록(2번)을 골라도 1번 값은 그대로, 2번 칸은 비어 있다
  await page.evaluate(() => { const g = (window as any).__ganpanda; g.selectBlock(g.photos[0].id, 1); });
  await expect(page.getByTestId('block-width')).toHaveValue('');
  expect((await blocks(page))[0]).toMatchObject({ w: 3000, h: 600 });
});

test('블록은 사인물 아래 층 — 겹친 곳을 누르면 사인물이 선택된다, 블록만 있는 곳은 블록 (2026-11-04 "치수카드는 사인물 카드 아래에 클릭하면 사인물 컨트롤러 우선")', async ({ page, request }) => {
  await openOwnedProject(page, request, '블록 아래 층');
  await uploadPhoto(page);
  await page.evaluate(() => {
    const g = (window as any).__ganpanda;
    g.project.updatePhoto(g.photos[0].id, { blocks: [{ q: [[300, 200], [1100, 200], [1100, 700], [300, 700]], w: 2000 }] });
    g.project.addObject({ photoId: g.photos[0].id, name: '겹친', shape: 'rect', quad: [[600, 350], [800, 350], [800, 500], [600, 500]], sheetIds: [] });
  });
  const sign = (await page.locator('polygon[data-testid="sign-shape"]').first().boundingBox())!;
  await page.mouse.click(sign.x + sign.width / 2, sign.y + sign.height / 2);
  await expect.poll(() => page.evaluate(() => { const g = (window as any).__ganpanda; return [g.selectedId ? 'sign' : null, g.selectedBlock?.i ?? null]; })).toEqual(['sign', null]);
  const blk = (await page.locator('[data-testid="size-block"][data-index="0"] polygon').boundingBox())!;
  await page.mouse.click(blk.x + 30, blk.y + 30);
  await expect.poll(() => page.evaluate(() => (window as any).__ganpanda.selectedBlock?.i ?? null)).toBe(0);
});
