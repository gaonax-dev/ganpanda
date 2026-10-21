// 사진 설정 메뉴 (2026-10-21 사용자: "현재 x 마크 대신 설정버튼으로 사진교체, 이미지 조절(크롭(크게도 가능하게),밝기), 삭제")
import { expect, test, type Page } from '@playwright/test';
import { dragOnPhoto, openOwnedProject, uploadPhoto } from './helpers';

type Snap = { photos: { id: string; assetId: string; w: number; h: number; x: number; width: number; source?: { crop: { x: number; y: number; w: number; h: number }; brightness: number } }[]; objects: { quad: [number, number][] }[] };
const snap = (page: Page) => page.evaluate(() => { const a = (window as unknown as { __ganpanda: { photos: unknown[]; objects: unknown[] } }).__ganpanda; return JSON.parse(JSON.stringify({ photos: a.photos, objects: a.objects })) as Snap; });

test.beforeEach(async ({ page, request }) => {
  await openOwnedProject(page, request);
  await uploadPhoto(page); // 1600×1000
  await page.keyboard.press('t');
  await dragOnPhoto(page, [400, 200], [800, 300]);
  await page.evaluate(() => (window as unknown as { __ganpanda: { selectObject(id: string | null): void } }).__ganpanda.selectObject(null)); // 패널이 머리글 단추를 가린다
  await expect(page.getByTestId('object-panel')).toHaveCount(0);
});

test('⚙ 메뉴: 사진 교체 · 이미지 조절 · 사진 삭제 (✕ 대신)', async ({ page }) => {
  const zone = page.getByTestId('photo-zone').first();
  await expect(zone.getByTitle('사진 삭제')).toHaveCount(0);
  await zone.getByTestId('photo-menu').click();
  const menu = page.getByTestId('photo-menu-list');
  await expect(menu.getByTestId('photo-replace')).toBeVisible();
  await expect(menu.getByTestId('photo-adjust')).toBeVisible();
  page.once('dialog', (d) => d.accept());
  await menu.getByTestId('photo-delete').click();
  await expect(page.getByTestId('photo-zone')).toHaveCount(0);
});

test('이미지 조절: 왼쪽 100px 자르고 오른쪽으로 300px 여백, 밝기 120% → 새 그림(1800×1000), 영역은 같은 자리(x −100), 원본 보관 → [원본으로] 되돌리기', async ({ page }) => {
  const before = await snap(page);
  const q0 = before.objects[0].quad;
  await page.getByTestId('photo-menu').first().click();
  await page.getByTestId('photo-adjust').click();
  const dlg = page.getByTestId('photo-adjust-dialog');
  await expect(dlg.getByTestId('crop-box')).toBeVisible();
  await dlg.getByTestId('crop-x').fill('100'); await dlg.getByTestId('crop-x').press('Tab');
  await dlg.getByTestId('crop-w').fill('1800'); await dlg.getByTestId('crop-w').press('Tab');
  await dlg.getByTestId('brightness').fill('1.2');
  await dlg.getByTestId('photo-adjust-apply').click();
  await expect(dlg).toHaveCount(0);
  await expect.poll(async () => (await snap(page)).photos[0].w).toBe(1800);
  const after = await snap(page);
  const p = after.photos[0];
  expect(p.h).toBe(1000);
  expect(p.assetId).not.toBe(before.photos[0].assetId);
  expect(p.source).toEqual({ assetId: before.photos[0].assetId, w: 1600, h: 1000, crop: { x: 100, y: 0, w: 1800, h: 1000 }, brightness: 1.2 });
  expect(after.objects[0].quad[0][0]).toBeCloseTo(q0[0][0] - 100, 5); // 영역은 사진 속 같은 자리
  expect(after.objects[0].quad[0][1]).toBeCloseTo(q0[0][1], 5);
  expect(p.width).toBeCloseTo(before.photos[0].width * 1800 / 1600, 3); // 사진 px 당 보드 px 유지
  expect(p.x).toBeCloseTo(before.photos[0].x + 100 * (before.photos[0].width / 1600), 3);
  // 다시 열면 지금 크롭·밝기부터, [원본으로] → 원본 에셋으로 되돌아오고 source 가 없어진다
  await page.getByTestId('photo-menu').first().click();
  await page.getByTestId('photo-adjust').click();
  await expect(dlg.getByTestId('crop-x')).toHaveValue('100');
  await dlg.getByTestId('photo-adjust-reset').click();
  await dlg.getByTestId('photo-adjust-apply').click();
  await expect.poll(async () => (await snap(page)).photos[0].w).toBe(1600);
  const back = await snap(page);
  expect(back.photos[0].assetId).toBe(before.photos[0].assetId);
  expect(back.photos[0].source).toBeUndefined();
  expect(back.objects[0].quad[0][0]).toBeCloseTo(q0[0][0], 5);
});

test('사진 교체: 2배 큰 사진으로 바꾸면 이름·보드 폭은 그대로, 영역 좌표는 새 px 로(2배)', async ({ page }) => {
  const before = await snap(page);
  const q0 = before.objects[0].quad;
  const buffer = Buffer.from((await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 3200; c.height = 2000; const g = c.getContext('2d')!; g.fillStyle = '#cfd9c0'; g.fillRect(0, 0, 3200, 2000); return c.toDataURL('image/png'); })).split(',')[1], 'base64');
  await page.getByTestId('photo-menu').first().click();
  await page.getByTestId('photo-replace').click();
  await page.getByTestId('photo-replace-input').setInputFiles({ name: '다시.png', mimeType: 'image/png', buffer });
  await expect.poll(async () => (await snap(page)).photos[0].w).toBe(3200);
  const after = await snap(page);
  expect(after.photos[0].h).toBe(2000);
  expect(after.photos[0].width).toBe(before.photos[0].width);
  expect(after.photos[0].assetId).not.toBe(before.photos[0].assetId);
  expect(after.objects[0].quad[2]).toEqual([q0[2][0] * 2, q0[2][1] * 2]);
  await expect(page.getByTestId('photo-zone').locator('.name')).toHaveText('테스트 매장_img_1');
  await expect(page.getByTestId('notice')).toHaveCount(0); // 비율 같음 → 안내 없음
});
