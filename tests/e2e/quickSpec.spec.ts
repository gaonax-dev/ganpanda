// 빠른 설정 칩 (2026-10-17 사용자: "현재설정창과 퀵설정으로 만들수 있을까? 사이즈 아래에 갈바 흰색 / 체널 갈색 / 후광4000k")
import { expect, test, type Page } from '@playwright/test';
import { dragOnPhoto, openObjectSettings, openOwnedProject, pickCategory, uploadPhoto } from './helpers';

const objOf = (page: Page) => page.evaluate(() => JSON.parse(JSON.stringify((window as unknown as { __ganpanda: { objects: unknown[] } }).__ganpanda.objects[0])));

test('설정 창 치수 아래 세 칩: 갈바 흰색 · 후광 채널 갈색 · 주백색 4000K — 옵션·구성 요소·3D 색에 저장되고 요약에 보인다', async ({ page, request }) => {
  await openOwnedProject(page, request, '빠른 설정');
  await uploadPhoto(page);
  await page.keyboard.press('t');
  await dragOnPhoto(page, [400, 200], [800, 300]);
  await pickCategory(page, 'sign');
  await openObjectSettings(page);
  const q = page.getByTestId('quick-section');
  await expect(q).toBeVisible();
  // 치수 바로 아래에 있다
  const sizeBox = (await page.getByTestId('size-section').boundingBox())!, quickBox = (await q.boundingBox())!;
  expect(quickBox.y).toBeGreaterThan(sizeBox.y);
  expect(quickBox.y).toBeLessThan(sizeBox.y + sizeBox.height + 40);
  // 몸통: 갈바 + 흰색
  await page.getByTestId('quick-body').click();
  await page.getByTestId('quick-product').selectOption('board-galva');
  await page.getByTestId('quick-body-color').selectOption('흰색');
  await expect(page.getByTestId('quick-body')).toContainText('갈바');
  await expect(page.getByTestId('quick-body')).toContainText('흰색');
  // 채널: 후광 + 갈색
  await page.getByTestId('quick-channel').click();
  await page.getByTestId('quick-channel-type').selectOption('ch-halo');
  await page.getByTestId('quick-channel-color').selectOption('갈색');
  await expect(page.getByTestId('quick-channel')).toContainText('후광');
  await expect(page.getByTestId('quick-channel')).toContainText('갈색');
  // LED: 주백색 → 4000K
  await page.getByTestId('quick-led').click();
  await page.getByTestId('quick-led-color').selectOption('주백색');
  await expect(page.getByTestId('quick-led')).toContainText('4000K');
  const o = await objOf(page);
  expect(o.options).toMatchObject({ paintSystem: '기본색', paintCode: '흰색' });
  expect(o.parts).toHaveLength(1);
  expect(o.parts[0]).toMatchObject({ kind: 'channel', type: 'ch-halo', options: { bodySystem: '기본색', bodyCode: '갈색', ledColor: '주백색' } });
  expect(o.letter3d.sideColor).toMatch(/^#/);
  // 아래 사양 묶음에도 같은 값 (세부는 거기서): 도색 색상 체계 = 기본색, 색 = 흰색
  await expect(page.getByTestId('option-paintSystem')).toHaveValue('기본색');
  await expect(page.getByTestId('option-paintCode')).toHaveValue('흰색');
  // 구성 요소 카드의 LED 색 표시에 색온도
  await expect(page.getByTestId('part-option-ledColor').locator('option[value="주백색"]')).toHaveText('주백색 (4000K)');
  await page.getByTestId('close-object-settings').click();
  await expect(page.getByTestId('object-summary')).toContainText('흰색');
  await expect(page.getByTestId('object-summary')).toContainText('갈색');
});

test.describe('휴대폰', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  test('빠른 막대에도 같은 칩이 있고, 거기서 바꾸면 저장된다', async ({ page, request }) => {
    await openOwnedProject(page, request, '휴대폰 빠른 설정');
    await uploadPhoto(page);
    await page.evaluate(() => {
      const app = (window as unknown as { __ganpanda: { photos: { id: string }[]; project: { addObject(o: unknown): string }; selectObject(id: string): void } }).__ganpanda;
      const id = app.project.addObject({ photoId: app.photos[0].id, name: '정면', shape: 'rect', quad: [[200, 100], [800, 100], [800, 300], [200, 300]], sheetIds: [], productId: 'board-galva' });
      app.selectObject(id);
    });
    const bar = page.getByTestId('quick-bar');
    await expect(bar.getByTestId('quick-spec')).toBeVisible();
    await bar.getByTestId('quick-channel').click();
    await bar.getByTestId('quick-channel-type').selectOption('ch-front');
    await expect(bar.getByTestId('quick-channel')).toContainText('전광');
    const o = await objOf(page);
    expect(o.parts[0]).toMatchObject({ kind: 'channel', type: 'ch-front' });
  });
});
