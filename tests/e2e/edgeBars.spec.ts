// 이동 모드 변 막대 + Alt 복사 (2026-10-17 사용자: "메니폴레이터 이동 형태 - 영역도 막대 보이게", "alt/option 누르고 이동하면 복사")
import { expect, test, type Page } from '@playwright/test';
import { dragOnPhoto, openOwnedProject, uploadPhoto } from './helpers';

type Pt = [number, number];
const quads = (page: Page) => page.evaluate(() => (window as unknown as { __ganpanda: { objects: { id: string; quad: Pt[] }[] } }).__ganpanda.objects.map((o) => ({ id: o.id, quad: o.quad })));

test('이동 모드: 외곽선 네 변에 막대가 보이고, 변을 끌면 사인물이 옮겨진다. Alt 를 누르고 변을 끌면 복사본이 옮겨진다', async ({ page, request }) => {
  await openOwnedProject(page, request);
  await uploadPhoto(page);
  await page.keyboard.press('t');
  await dragOnPhoto(page, [300, 200], [700, 300]);
  await expect(page.getByTestId('gizmo')).toHaveAttribute('data-mode', 'move');
  await expect(page.locator('[data-testid^="gizmo-edge-"]')).toHaveCount(4); // 가로 변은 높이 0 이라 toBeVisible 대신 개수로
  const [before] = await quads(page);
  const bar = (await page.getByTestId('gizmo-edge-0').boundingBox())!; // 위쪽 변
  await page.mouse.move(bar.x + bar.width / 2, bar.y + bar.height / 2);
  await page.mouse.down();
  await page.mouse.move(bar.x + bar.width / 2 + 50, bar.y + bar.height / 2 + 40, { steps: 5 });
  await page.mouse.up();
  const [after] = await quads(page);
  expect(after.quad[0][0]).toBeGreaterThan(before.quad[0][0] + 20);
  expect(after.quad[0][1]).toBeGreaterThan(before.quad[0][1] + 15);
  expect(after.quad[2][0] - after.quad[0][0]).toBeCloseTo(before.quad[2][0] - before.quad[0][0], 0); // 크기는 그대로
  // Alt + 변 끌기 = 복사본이 옮겨짐
  const bar2 = (await page.getByTestId('gizmo-edge-2').boundingBox())!; // 아래쪽 변
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
