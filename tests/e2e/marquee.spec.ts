// 2026-10-23 사용자: "데스크탑에서 드래그로 다중선택 가능하게 할 수 있어?" → "드래그 선택에 사인물카드와 사진의 사인물은 같이 선택할 이유가 없다.
// 또한 다른 사진의 사인물도 같이 선택되면 안된다. 드래그로 먼저 영역에 잡힌 사인물 소속이 같은 것만 드래그로 선택 가능하게"
// 빈 곳 끌기 = 화면 이동(그대로). 다중 모드([다중] 또는 Shift 를 누르는 동안)일 때만 끌어서 고른다
import { expect, test } from '@playwright/test';
import { openOwnedProject, uploadPhoto } from './helpers';

type G = { __ganpanda: { photos: { id: string; x: number }[]; selectionIds: string[]; selectionKind: string; project: { addObject(o: unknown): string } } };

async function setup(page: import('@playwright/test').Page, request: import('@playwright/test').APIRequestContext, photos = 1) {
  await openOwnedProject(page, request);
  for (let i = 0; i < photos; i++) await uploadPhoto(page);
  await expect(page.getByTestId('photo-zone')).toHaveCount(photos);
  const ids = await page.evaluate(() => {
    const a = (window as unknown as G).__ganpanda;
    const ps = [...a.photos].sort((p, q) => p.x - q.x);
    const add = (pid: string, name: string, x: number, y: number) => a.project.addObject({ photoId: pid, name, shape: 'rect', quad: [[x, y], [x + 200, y], [x + 200, y + 120], [x, y + 120]], sheetIds: [], widthMm: 1000, heightMm: 600 });
    const out: Record<string, string> = { A: add(ps[0].id, 'A', 1100, 200), B: add(ps[0].id, 'B', 1350, 200), C: add(ps[0].id, 'C', 200, 900) };
    if (ps[1]) out.D = add(ps[1].id, 'D', 100, 200);
    return out;
  });
  await page.getByTestId('zoom-fit').click();
  await page.waitForTimeout(300);
  return ids;
}
const photoPt = async (page: import('@playwright/test').Page, i: number, x: number, y: number) => {
  const bs = await page.getByTestId('photo-img').evaluateAll((els) => els.map((e) => e.getBoundingClientRect()).sort((a, b) => a.left - b.left).map((r) => [r.left, r.top, r.width]));
  const [l, t, w] = bs[i]; const k = w / 1600; return [l + x * k, t + y * k] as const;
};
const sel = (page: import('@playwright/test').Page) => page.evaluate(() => { const a = (window as unknown as G).__ganpanda; return { ids: [...a.selectionIds].sort(), kind: a.selectionKind }; });
async function drag(page: import('@playwright/test').Page, from: readonly [number, number], to: readonly [number, number]) {
  await page.mouse.move(from[0], from[1]); await page.mouse.down();
  await page.mouse.move((from[0] + to[0]) / 2, (from[1] + to[1]) / 2, { steps: 6 });
  await page.mouse.move(to[0], to[1], { steps: 6 }); await page.mouse.up();
}

test('Shift 를 누른 채 끌면 사각형 안의 사인물을 고른다 — 화면은 움직이지 않는다', async ({ page, request }) => {
  const id = await setup(page, request);
  const before = (await page.getByTestId('photo-img').first().boundingBox())!;
  await page.keyboard.down('Shift');
  const from = await photoPt(page, 0, 1050, 150), to = await photoPt(page, 0, 1600, 380);
  await page.mouse.move(from[0], from[1]); await page.mouse.down();
  await page.mouse.move(to[0], to[1], { steps: 8 });
  await expect(page.getByTestId('marquee')).toBeVisible();
  await page.mouse.up();
  await page.keyboard.up('Shift');
  await expect(page.getByTestId('marquee')).toHaveCount(0);
  expect(await sel(page)).toEqual({ ids: [id.A, id.B].sort(), kind: 'shape' }); // C 는 밖
  const after = (await page.getByTestId('photo-img').first().boundingBox())!;
  expect(Math.abs(after.x - before.x)).toBeLessThan(1);
});

test('먼저 잡힌 사인물의 사진 것만 — 다른 사진의 사인물은 사각형 안이어도 고르지 않는다', async ({ page, request }) => {
  const id = await setup(page, request, 2);
  await page.getByTestId('tool-multi').click();
  await drag(page, await photoPt(page, 0, 1050, 150), await photoPt(page, 1, 400, 380)); // A·B(첫 사진)가 먼저, D(둘째 사진)도 사각형 안
  expect(await sel(page)).toEqual({ ids: [id.A, id.B].sort(), kind: 'shape' });
});

test('카드가 먼저 잡히면 카드만 — 사진의 사인물과 섞지 않는다', async ({ page, request }) => {
  const id = await setup(page, request);
  await page.getByTestId('tool-multi').click();
  const cards = page.getByTestId('board-card');
  await expect(cards).toHaveCount(3);
  const bx = await cards.evaluateAll((els) => els.map((e) => e.getBoundingClientRect()).map((q) => [q.left, q.top, q.right, q.bottom]));
  const R = Math.max(...bx.map((b) => b[2])) + 20, B = Math.max(...bx.map((b) => b[3])) + 20;
  const top = await photoPt(page, 0, 0, 100); // 사진 위쪽까지 — 외곽선도 사각형 안에 들어온다
  await drag(page, [R, B], [Math.min(...bx.map((b) => b[0])) - 20, top[1]]);
  expect(await sel(page)).toEqual({ ids: [id.A, id.B, id.C].sort(), kind: 'card' });
});

test('다중 모드가 아니면 빈 곳 끌기는 그대로 화면 이동', async ({ page, request }) => {
  await setup(page, request);
  const before = (await page.getByTestId('photo-img').first().boundingBox())!;
  const from = await photoPt(page, 0, 700, 600);
  await page.mouse.move(from[0], from[1]); await page.mouse.down(); await page.mouse.move(from[0] + 120, from[1] + 60, { steps: 4 }); await page.mouse.up();
  const after = (await page.getByTestId('photo-img').first().boundingBox())!;
  expect(after.x - before.x).toBeGreaterThan(80);
  expect((await sel(page)).ids).toEqual([]);
});
