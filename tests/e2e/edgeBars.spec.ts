// 이동 모드 변 막대 + Alt 복사 (2026-10-17 사용자: "메니폴레이터 이동 형태 - 영역도 막대 보이게", "alt/option 누르고 이동하면 복사")
import { expect, test, type Page } from '@playwright/test';
import { dragOnPhoto, openOwnedProject, uploadPhoto } from './helpers';

type Pt = [number, number];
const quads = (page: Page) => page.evaluate(() => (window as unknown as { __ganpanda: { objects: { id: string; quad: Pt[] }[] } }).__ganpanda.objects.map((o) => ({ id: o.id, quad: o.quad })));

test('다각형(매니퓰레이터 없음)에도 네 변 막대가 있고 끌면 옮겨진다 (2026-10-17 "이동 매니퓰레이터 막대 다 넣기로 했는데")', async ({ page, request }) => {
  await openOwnedProject(page, request);
  await uploadPhoto(page);
  const id = await page.evaluate(() => {
    const app = (window as unknown as { __ganpanda: { photos: { id: string }[]; project: { addObject(o: unknown): string }; selectObject(id: string): void } }).__ganpanda;
    const id = app.project.addObject({ photoId: app.photos[0].id, name: '다각', shape: 'polygon', quad: [[300, 200], [700, 200], [700, 400], [300, 400]], polygon: [[300, 200], [700, 230], [650, 400], [320, 380]], sheetIds: [] });
    app.selectObject(id);
    return id;
  });
  await expect(page.getByTestId('gizmo')).toHaveCount(0); // 다각형에는 매니퓰레이터가 없다
  await expect(page.locator('[data-testid^="edge-handle-"]')).toHaveCount(4); // 변 막대는 기본 컨트롤
  const before = (await quads(page)).find((o) => o.id === id)!;
  const bar = (await page.getByTestId('edge-handle-2').boundingBox())!;
  await page.mouse.move(bar.x + bar.width / 2, bar.y + bar.height / 2);
  await page.mouse.down();
  await page.mouse.move(bar.x + bar.width / 2 + 60, bar.y + bar.height / 2 + 30, { steps: 5 });
  await page.mouse.up();
  const after = (await quads(page)).find((o) => o.id === id)!;
  expect(after.quad[0][0]).toBeGreaterThan(before.quad[0][0] + 20);
  expect(after.quad[0][1]).toBeGreaterThan(before.quad[0][1] + 10);
  expect(after.quad[2][0] - after.quad[0][0]).toBeCloseTo(before.quad[2][0] - before.quad[0][0], 0);
});

test('이동 모드: 외곽선 네 변에 막대가 보이고, 변을 끌면 사인물이 옮겨진다. Alt 를 누르고 변을 끌면 복사본이 옮겨진다', async ({ page, request }) => {
  await openOwnedProject(page, request);
  await uploadPhoto(page);
  await page.keyboard.press('t');
  await dragOnPhoto(page, [300, 200], [700, 300]);
  await expect(page.getByTestId('gizmo')).toHaveAttribute('data-mode', 'none'); // 매니퓰레이터는 기본 숨김 (2026-10-18)
  await expect(page.locator('[data-testid^="edge-handle-"]')).toHaveCount(4); // 변 손잡이는 기본 컨트롤 — 늘 있다
  const [before] = await quads(page);
  const bar = (await page.getByTestId('edge-handle-0').boundingBox())!; // 위쪽 변
  await page.mouse.move(bar.x + bar.width / 2, bar.y + bar.height / 2);
  await page.mouse.down();
  await page.mouse.move(bar.x + bar.width / 2 + 50, bar.y + bar.height / 2 + 40, { steps: 5 });
  await page.mouse.up();
  const [after] = await quads(page);
  expect(after.quad[0][0]).toBeGreaterThan(before.quad[0][0] + 20);
  expect(after.quad[0][1]).toBeGreaterThan(before.quad[0][1] + 15);
  expect(after.quad[2][0] - after.quad[0][0]).toBeCloseTo(before.quad[2][0] - before.quad[0][0], 0); // 크기는 그대로
  // Alt + 변 끌기 = 복사본이 옮겨짐
  const bar2 = (await page.getByTestId('edge-handle-2').boundingBox())!; // 아래쪽 변
  await page.keyboard.down('Alt');
  await page.mouse.move(bar2.x + bar2.width / 2, bar2.y + bar2.height / 2);
  await page.mouse.down();
  await page.mouse.move(bar2.x + bar2.width / 2 - 60, bar2.y + bar2.height / 2 + 50, { steps: 5 });
  await page.mouse.up();
  await page.keyboard.up('Alt');
  await expect.poll(async () => (await quads(page)).length).toBe(2);
  const all = await quads(page);
  const orig = all.find((o) => o.id === after.id)!, copy = all.find((o) => o.id !== after.id)!;
  expect(orig.quad).toEqual(after.quad);
  expect(copy.quad[0][1]).toBeGreaterThan(after.quad[0][1] + 20);
});
