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
  // 패널에도 같은 칩이 있으므로 설정 창 안으로 범위를 좁힌다
  const dlg = page.getByTestId('object-settings');
  // 몸통: 갈바 + 흰색
  await dlg.getByTestId('quick-body').click();
  await dlg.getByTestId('quick-product').selectOption('board-galva');
  await dlg.getByTestId('quick-body-color').selectOption('흰색');
  await expect(dlg.getByTestId('quick-body')).toContainText('갈바');
  await expect(dlg.getByTestId('quick-body')).toContainText('흰색');
  // 채널: 아직 없으므로 [+] 로 더한다 → 후광 + 갈색
  await dlg.getByTestId('quick-add').click();
  await dlg.getByTestId('quick-add-channel').click();
  await dlg.getByTestId('quick-channel-type').selectOption('ch-halo');
  await dlg.getByTestId('quick-channel-color').selectOption('갈색');
  await expect(dlg.getByTestId('quick-channel')).toContainText('후광');
  await expect(dlg.getByTestId('quick-channel')).toContainText('갈색');
  // LED: [+] → 주백색 → 4000K
  await dlg.getByTestId('quick-add').click();
  await dlg.getByTestId('quick-add-led').click();
  await dlg.getByTestId('quick-led-color').selectOption('주백색');
  await expect(dlg.getByTestId('quick-led')).toContainText('4000K');
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
    await bar.getByTestId('quick-add').click(); // 채널이 없으니 [+] 로
    await bar.getByTestId('quick-add-channel').click();
    await expect(bar.getByTestId('quick-channel')).toContainText('전광');
    await bar.getByTestId('quick-channel-type').selectOption('ch-halo');
    await expect(bar.getByTestId('quick-channel')).toContainText('후광');
    const o = await objOf(page);
    expect(o.parts[0]).toMatchObject({ kind: 'channel', type: 'ch-halo' });
  });
});

test('패널: 사이즈 → 사양 글 → 확인 창에서 체크 → 적용하면 글은 비고 칩이 생긴다. 칩을 누르면 설정 창이 그 자리로, [+] 로 요소를 더한다 (2026-10-17)', async ({ page, request }) => {
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
  await expect(panelChips.getByTestId('quick-channel')).toContainText('갈색');
  await expect(panelChips.getByTestId('quick-led')).toContainText('4000K');
  const o = await objOf(page);
  expect(o).toMatchObject({ productId: 'board-galva', widthMm: 3000, heightMm: 600 });
  expect(o.note).toBeUndefined();
  // 패널 칩 → 설정 창이 열리고 그 요소의 선택지가 펼쳐져 있다
  await panelChips.getByTestId('quick-channel').click();
  await expect(page.getByTestId('object-settings')).toBeVisible();
  await expect(page.getByTestId('object-settings').getByTestId('quick-channel-pick')).toBeVisible();
  await page.getByTestId('close-object-settings').click();
  // [+] → 요청사항 더하기 → 설정 창의 메모 칸으로
  await panelChips.getByTestId('quick-add').click();
  await expect(panelChips.getByTestId('quick-add-menu')).toBeVisible();
  await panelChips.getByTestId('quick-add-note').click();
  await expect(page.getByTestId('object-settings')).toBeVisible();
  await page.getByTestId('object-settings').getByTestId('quick-note-input').fill('기존 간판 철거');
  await page.getByTestId('close-object-settings').click();
  await expect(panelChips.getByTestId('quick-note')).toContainText('기존 간판 철거');
  expect((await objOf(page)).note).toBe('기존 간판 철거');
});
