import { test, expect } from '@playwright/test';
import { openOwnedProject, uploadPhoto } from './helpers';

// 2026-10-29 사용자: "줌인아웃을 반복하면 다운된다" → "사진도 lod 쓸수 있나?" — 줌아웃하면 모든 사진의 표시 사본(휴대폰 긴 변 1600)이 한꺼번에 풀렸다.
// 화면에서 작게 보이면 작은 그림(긴 변 480), 크게 보일 때만 표시 사본을 그 위에
test('사진 LOD: 작게 보이면 작은 그림만, 크게 확대하면 표시 사본이 위에', async ({ page, request }) => {
  await openOwnedProject(page, request);
  await uploadPhoto(page);
  const zone = page.getByTestId('photo-zone');
  const box = (await page.getByTestId('board-canvas').boundingBox())!;
  const wheel = async (dy: number, n: number) => { await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); for (let i = 0; i < n; i++) { await page.keyboard.down('Control'); await page.mouse.wheel(0, dy); await page.keyboard.up('Control'); await page.waitForTimeout(150); } };
  await wheel(400, 6); // 줌아웃
  const base = zone.getByTestId('photo-img'); // 늘 있는 바닥 그림 — 작게 보이면 작은 그림
  const big = () => base.evaluate((e) => Math.max((e as HTMLImageElement).naturalWidth, (e as HTMLImageElement).naturalHeight));
  await expect.poll(big, { timeout: 15_000 }).toBeLessThanOrEqual(480);
  await expect.poll(big).toBeGreaterThan(0);
  await expect(zone.getByTestId('photo-full')).toHaveCount(0);
  await wheel(-400, 8); // 크게 확대
  await expect(zone.getByTestId('photo-full')).toBeVisible();
  expect(await zone.getByTestId('photo-full').evaluate((e) => (e as HTMLImageElement).naturalWidth)).toBeGreaterThan(480);
  await expect(base).toBeVisible(); // 아래에 그대로 — 바뀌는 동안 빈 화면 없음
});
