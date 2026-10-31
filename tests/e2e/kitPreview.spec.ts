// 채널 미리보기 (2026-10-31): 키트 모델(G) + 구운 라이트맵 — 종류에 맞는 모델, 색을 바꾸면 바로, 밤에는 불 켠 모습
import { expect, test, type Page } from '@playwright/test';
import { dragOnPhoto, openObjectSettings, openOwnedProject, pickCategory, uploadPhoto } from './helpers';

const SHOTS = process.env.KIT_SHOTS; // 확인용 화면 저장 위치 (선택)
const centerPixel = (page: Page) => page.getByTestId('kit-preview').locator('canvas').evaluate((c: HTMLCanvasElement) => {
  const t = document.createElement('canvas'); t.width = c.width; t.height = c.height;
  const g = t.getContext('2d')!; g.drawImage(c, 0, 0);
  let r = 0, gg = 0, b = 0, n = 0;
  for (let y = Math.round(c.height * 0.35); y < c.height * 0.65; y += 4) for (let x = Math.round(c.width * 0.35); x < c.width * 0.65; x += 4) { const d = g.getImageData(x, y, 1, 1).data; if (d[3] > 0) { r += d[0]; gg += d[1]; b += d[2]; n++; } }
  return n ? [Math.round(r / n), Math.round(gg / n), Math.round(b / n), n] : [0, 0, 0, 0];
});

test('채널을 고르면 그 형태의 G 한 글자가 보이고, 앞면 색을 바꾸면 바로 바뀐다, 밤에는 불 켠 모습', async ({ page, request }) => {
  await openOwnedProject(page, request, '채널 키트');
  await uploadPhoto(page);
  await page.keyboard.press('t');
  await dragOnPhoto(page, [400, 200], [800, 300]);
  await pickCategory(page, 'sign');
  await openObjectSettings(page);
  await page.getByTestId('object-settings').getByTestId('quick-add').click();
  await page.getByTestId('add-part-channel').click();
  const ch = page.getByTestId('part-card').filter({ has: page.locator('[data-kind="channel"]') });
  await ch.getByTestId('preset-pick').nth(6).click(); // 07 캡 전후광
  const kit = ch.getByTestId('kit-preview');
  await expect(kit).toHaveAttribute('data-variant', 'both-cap');
  await expect(kit).toHaveAttribute('data-ready', 'true', { timeout: 20_000 });
  const before = await centerPixel(page);
  expect(before[3]).toBeGreaterThan(10); // 무언가 그려졌다
  if (SHOTS) await kit.screenshot({ path: `${SHOTS}/kit-day.png` });
  // 앞면 색을 파랑으로
  await page.evaluate(() => {
    const a = (window as unknown as { __ganpanda: { objects: { id: string; parts: { options?: Record<string, unknown> }[] }[]; project: { updateObject(id: string, p: unknown): void } } }).__ganpanda;
    const o = a.objects[0];
    const parts = JSON.parse(JSON.stringify(o.parts));
    parts[0].options = { ...parts[0].options, faceSystem: '기본색', faceCode: '파랑' };
    a.project.updateObject(o.id, { parts });
  });
  await expect(kit).not.toHaveAttribute('data-face', '#ffffff');
  await expect.poll(() => centerPixel(page).then((p) => p.slice(0, 3).join())).not.toBe(before.slice(0, 3).join());
  if (SHOTS) { await page.waitForTimeout(300); await kit.screenshot({ path: `${SHOTS}/kit-blue.png` }); }
  // 밤
  await kit.getByTestId('kit-night').click();
  await expect(kit).toHaveAttribute('data-night', 'true');
  if (SHOTS) { await page.waitForTimeout(300); await kit.screenshot({ path: `${SHOTS}/kit-night.png` }); }
  // 그림 카드: 키트에 있는 묶음은 키트 모델 그림 (사진 대신)
  await ch.getByTestId('preset-open').click();
  const grid = ch.getByTestId('preset-grid');
  await expect(grid.locator('img[data-kit="true"]').first()).toBeVisible({ timeout: 30_000 });
  expect(await grid.locator('img[data-kit="true"]').count()).toBeGreaterThanOrEqual(5);
  expect(await grid.locator('img[data-kit="true"]').first().getAttribute('src')).toMatch(/^blob:/);
  if (SHOTS) { await page.waitForTimeout(500); await grid.screenshot({ path: `${SHOTS}/kit-cards.png` }); }
});
