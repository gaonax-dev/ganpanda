// 빠른 설정 칩 (2026-10-17 사용자: "현재설정창과 퀵설정으로 만들수 있을까? 사이즈 아래에 갈바 흰색 / 체널 갈색 / 후광4000k")
import { expect, test, type Page } from '@playwright/test';
import { dragOnPhoto, openObjectSettings, openOwnedProject, pickCategory, uploadPhoto } from './helpers';

const objOf = (page: Page) => page.evaluate(() => JSON.parse(JSON.stringify((window as unknown as { __ganpanda: { objects: unknown[] } }).__ganpanda.objects[0])));

test('설정 창: 치수 아래 사양 글과 칩, 칩 = 탭 — 몸통 탭에서 종류·색, [+]로 채널을 더하면 채널 탭, 칩 문구에 색·LED 색온도', async ({ page, request }) => {
  await openOwnedProject(page, request, '빠른 설정');
  await uploadPhoto(page);
  await page.keyboard.press('t');
  await dragOnPhoto(page, [400, 200], [800, 300]);
  await pickCategory(page, 'sign');
  await openObjectSettings(page);
  const dlg = page.getByTestId('object-settings');
  const q = dlg.getByTestId('quick-section');
  await expect(q).toBeVisible();
  const sizeBox = (await dlg.getByTestId('size-section').boundingBox())!, quickBox = (await q.boundingBox())!;
  expect(quickBox.y).toBeGreaterThan(sizeBox.y);
  expect(quickBox.y).toBeLessThan(sizeBox.y + sizeBox.height + 40);
  // 몸통 탭(기본): 종류 갈바, 도색 기본색 흰색
  await expect(dlg.getByTestId('quick-body')).toHaveClass(/on/);
  await dlg.getByTestId('product-select').selectOption('board-galva');
  await dlg.getByTestId('option-paint-swatch-흰색').click(); // 컬러 피커 간단 모드: 견본
  await expect(dlg.getByTestId('quick-body')).toContainText('갈바');
  await expect(dlg.getByTestId('quick-body')).toContainText('흰색');
  // [+] 채널 → 채널 탭이 열리고 그 카드만 보인다
  await dlg.getByTestId('quick-add').click();
  await dlg.getByTestId('add-part-channel').click();
  await expect(dlg.getByTestId('quick-part')).toHaveClass(/on/);
  await expect(dlg.getByTestId('product-select')).toHaveCount(0); // 몸통 탭 내용은 숨김
  await dlg.getByTestId('part-type').selectOption('ch-halo');
  await dlg.getByTestId('part-option-body-swatch-갈색').click();
  await dlg.getByTestId('part-option-ledColor').selectOption('주백색');
  await expect(dlg.getByTestId('part-option-ledColor').locator('option[value="주백색"]')).toHaveText('주백색 (4000K)');
  await expect(dlg.getByTestId('quick-part')).toContainText('후광');
  await expect(dlg.getByTestId('quick-part')).toContainText('갈색');
  await expect(dlg.getByTestId('quick-part')).toContainText('4000K');
  // 몸통 칩 → 몸통 탭으로 돌아온다
  await dlg.getByTestId('quick-body').click();
  await expect(dlg.getByTestId('option-paint-now')).toContainText('흰색');
  const o = await objOf(page);
  expect(o.options).toMatchObject({ paintSystem: '기본색', paintCode: '흰색' });
  expect(o.parts[0]).toMatchObject({ kind: 'channel', type: 'ch-halo', options: { bodySystem: '기본색', bodyCode: '갈색', ledColor: '주백색' } });
  await page.getByTestId('close-object-settings').click();
  await expect(page.getByTestId('object-summary')).toContainText('흰색');
  await expect(page.getByTestId('object-summary')).toContainText('갈색');
});

test.describe('휴대폰', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  test('빠른 막대에도 같은 칩이 있고, [+] 로 채널을 더하면 설정 창이 그 탭으로 열린다', async ({ page, request }) => {
    await openOwnedProject(page, request, '휴대폰 빠른 설정');
    await uploadPhoto(page);
    await page.evaluate(() => {
      const app = (window as unknown as { __ganpanda: { photos: { id: string }[]; project: { addObject(o: unknown): string }; selectObject(id: string): void } }).__ganpanda;
      const id = app.project.addObject({ photoId: app.photos[0].id, name: '정면', shape: 'rect', quad: [[200, 100], [800, 100], [800, 300], [200, 300]], sheetIds: [], productId: 'board-galva' });
      app.selectObject(id);
    });
    const bar = page.getByTestId('quick-bar');
    await expect(bar.getByTestId('quick-spec')).toBeVisible();
    await bar.getByTestId('quick-add').click();
    await bar.getByTestId('add-part-channel').click();
    const dlg = page.getByTestId('object-settings');
    await expect(dlg).toBeVisible();
    await dlg.getByTestId('part-type').selectOption('ch-halo');
    await expect(dlg.getByTestId('quick-part')).toContainText('후광');
    const o = await objOf(page);
    expect(o.parts[0]).toMatchObject({ kind: 'channel', type: 'ch-halo' });
  });
});

test('패널: 사이즈 → 사양 글 → 확인 창에서 체크 → 적용하면 글은 비고 칩이 생긴다. 칩을 누르면 설정 창이 그 탭으로, [+] 로 요청사항을 더한다 (2026-10-17)', async ({ page, request }) => {
  await openOwnedProject(page, request, '사양 글');
  await uploadPhoto(page);
  await page.keyboard.press('t');
  await dragOnPhoto(page, [400, 200], [800, 300]);
  await pickCategory(page, 'sign');
  // 패널의 사이즈 줄
  await page.getByTestId('panel-width').fill('3000');
  await page.getByTestId('panel-height').fill('600');
  // 사양 글 → 확인 창 (항목 5개) → 하나 빼고 적용
  await page.getByTestId('spec-text').fill('갈바 흰색 채널 갈색 후광 4000K 급함');
  await page.getByTestId('spec-text').press('Enter');
  const items = page.getByTestId('spec-item');
  await expect(items).toHaveCount(6);
  await expect(items.nth(0)).toContainText('몸통: 갈바');
  await expect(items.nth(5)).toContainText('요청사항에 추가: 급함');
  await items.nth(5).locator('input').uncheck(); // 메모는 뺀다
  await page.getByTestId('spec-apply').click();
  await expect(page.getByTestId('spec-confirm')).toHaveCount(0);
  await expect(page.getByTestId('spec-text')).toHaveValue(''); // 글은 비워진다
  const panelChips = page.getByTestId('object-panel').getByTestId('quick-spec');
  await expect(panelChips.getByTestId('quick-body')).toContainText('흰색');
  await expect(panelChips.getByTestId('quick-part')).toContainText('후광');
  await expect(panelChips.getByTestId('quick-part')).toContainText('갈색');
  await expect(panelChips.getByTestId('quick-part')).toContainText('4000K');
  const o = await objOf(page);
  expect(o).toMatchObject({ productId: 'board-galva', widthMm: 3000, heightMm: 600 });
  expect(o.note).toBeUndefined();
  // 패널 칩 → 설정 창이 그 탭으로 열린다 (채널 카드)
  await panelChips.getByTestId('quick-part').click();
  await expect(page.getByTestId('object-settings')).toBeVisible();
  await expect(page.getByTestId('object-settings').getByTestId('part-type')).toHaveValue('ch-halo');
  await page.getByTestId('close-object-settings').click();
  // [+] → 요청사항 더하기 → 설정 창의 메모 칸으로
  await panelChips.getByTestId('quick-add').click();
  await expect(panelChips.getByTestId('quick-add-menu')).toBeVisible();
  await panelChips.getByTestId('quick-add-note').click();
  await expect(page.getByTestId('object-settings')).toBeVisible();
  await page.getByTestId('object-settings').getByTestId('sign-note').fill('기존 간판 철거');
  await page.getByTestId('close-object-settings').click();
  await expect(panelChips.getByTestId('quick-note')).toContainText('기존 간판 철거');
  expect((await objOf(page)).note).toBe('기존 간판 철거');
});
