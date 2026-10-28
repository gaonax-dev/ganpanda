// 사진 옮기기 (2026-10-29 사용자: "사진도 제목을 클릭하면 하일라이트 되면 그때 이동 가능하게 그때는 사진 어디를 잡든 이동")
import { expect, test } from '@playwright/test';
import { openOwnedProject, uploadPhoto } from './helpers';

const photoX = (page: import('@playwright/test').Page) => page.evaluate(() => (window as unknown as { __ganpanda: { photos: { x: number }[] } }).__ganpanda.photos[0].x);

test('제목을 누르면 사진이 강조되고, 그때는 사진 어디를 잡아 끌어도 사진이 옮겨진다 — 빈 곳을 누르면 풀린다, 강조 전에는 끌어도 사진이 안 움직인다', async ({ page, request }) => {
  await openOwnedProject(page, request);
  await uploadPhoto(page);
  await page.getByTestId('zoom-fit').click();
  const zone = page.getByTestId('photo-zone');
  const x0 = await photoX(page);
  // 강조 전: 제목을 끌어도 안 움직인다
  const nb = (await zone.locator('.name').boundingBox())!;
  await page.mouse.move(nb.x + 10, nb.y + nb.height / 2); await page.mouse.down(); await page.mouse.move(nb.x + 110, nb.y + nb.height / 2, { steps: 5 }); await page.mouse.up();
  expect(await photoX(page)).toBe(x0);
  // 제목을 누르면 강조
  await zone.locator('.name').click();
  await expect(zone).toHaveAttribute('data-moving', 'true');
  // 사진 가운데를 잡아 끌면 사진이 옮겨진다
  const b = (await zone.boundingBox())!;
  const zoom = await page.evaluate(() => parseFloat(document.querySelector('[data-testid="zoom-label"]')!.textContent!) / 100);
  await page.mouse.move(b.x + b.width / 2, b.y + b.height * 0.6); await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2 + 100, b.y + b.height * 0.6, { steps: 6 }); await page.mouse.up();
  await expect.poll(() => photoX(page)).toBeCloseTo(x0 + 100 / zoom, -1);
  await expect(zone).toHaveAttribute('data-moving', 'true'); // 옮긴 뒤에도 강조 그대로 — 이어서 옮길 수 있다
  // 빈 곳을 누르면 풀린다
  const c = (await page.getByTestId('board-canvas').boundingBox())!;
  await page.mouse.click(c.x + 20, c.y + c.height - 120);
  await expect(zone).not.toHaveAttribute('data-moving', 'true');
  const x1 = await photoX(page);
  const b2 = (await zone.boundingBox())!;
  await page.mouse.move(b2.x + b2.width / 2, b2.y + b2.height * 0.6); await page.mouse.down();
  await page.mouse.move(b2.x + b2.width / 2 + 100, b2.y + b2.height * 0.6, { steps: 6 }); await page.mouse.up();
  expect(await photoX(page)).toBe(x1);
});

test('사진을 끄는 동안은 문서에 쓰지 않고 놓을 때 한 번만 — 안드로이드에서 프레임마다 갱신되던 것 (2026-10-29)', async ({ page, request }) => {
  await openOwnedProject(page, request);
  await uploadPhoto(page);
  await page.getByTestId('zoom-fit').click();
  const zone = page.getByTestId('photo-zone');
  await zone.locator('.name').click();
  await expect(zone).toHaveAttribute('data-moving', 'true');
  const x0 = await photoX(page);
  await page.evaluate(() => { const w = window as unknown as { __ganpanda: { project: { doc: { on(e: string, f: () => void): void } } }; __writes: number }; w.__writes = 0; w.__ganpanda.project.doc.on('update', () => w.__writes++); });
  const b = (await zone.boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height * 0.6); await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2 + 100, b.y + b.height * 0.6, { steps: 20 });
  // 끄는 중: 화면에서는 따라오지만 문서는 그대로
  expect(await page.evaluate(() => (window as unknown as { __writes: number }).__writes)).toBe(0);
  expect((await zone.boundingBox())!.x).toBeGreaterThan(b.x + 90);
  await page.mouse.up();
  await expect.poll(() => photoX(page)).toBeGreaterThan(x0);
  expect(await page.evaluate(() => (window as unknown as { __writes: number }).__writes)).toBe(1);
});

test.describe('휴대폰', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  test('제목을 탭하면 사진이 강조된다 (사인물을 고르지 않는다)', async ({ page, request }) => {
    await openOwnedProject(page, request);
    await uploadPhoto(page);
    await page.getByTestId('photo-zone').locator('.name').tap();
    await expect(page.getByTestId('photo-zone')).toHaveAttribute('data-moving', 'true');
    await expect(page.getByTestId('quick-bar')).toHaveCount(0);
  });
});
