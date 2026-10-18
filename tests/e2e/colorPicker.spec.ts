// 컬러 피커 (2026-10-17 사용자: "후랙스 갈바 모두 컬러피커로 색상지정할 수 있게해줘 컬러가 필요한 곳에 컬러피커 간단모드와 확장모드")
import { expect, test, type Page } from '@playwright/test';
import { dragOnPhoto, openObjectSettings, openOwnedProject, pickCategory, uploadPhoto } from './helpers';

const objOf = (page: Page) => page.evaluate(() => JSON.parse(JSON.stringify((window as unknown as { __ganpanda: { objects: unknown[] } }).__ganpanda.objects[0])));

test('후렉스 바탕색: 간단 모드 견본 → 기본색, 확장 모드 피커 → 직접 #hex, 체계 RAL 코드. 칩·요약·3D 색에 반영', async ({ page, request }) => {
  await openOwnedProject(page, request, '컬러');
  await uploadPhoto(page);
  await page.keyboard.press('t');
  await dragOnPhoto(page, [400, 200], [800, 300]);
  await pickCategory(page, 'sign');
  await openObjectSettings(page);
  const dlg = page.getByTestId('object-settings');
  await dlg.getByTestId('product-select').selectOption('board-flex');
  const field = dlg.getByTestId('option-face-color');
  await expect(field).toBeVisible();
  await expect(dlg.getByTestId('option-face-now')).toContainText('도색 없음');
  // 색 상자 ■ → 색 고르기 창 → 견본 (2026-10-18 "컬러선택을 색상 ㅁ 상자로")
  await dlg.getByTestId('option-face-box').click();
  await dlg.getByTestId('option-face-swatch-노랑').click();
  await expect(dlg.getByTestId('option-face-now')).toContainText('노랑');
  expect((await objOf(page)).options).toMatchObject({ faceSystem: '기본색', faceCode: '노랑' });
  await expect(dlg.getByTestId('quick-body')).toContainText('노랑');
  // 확장: 브라우저 컬러 피커 → 직접 + hex
  await dlg.getByTestId('option-face-expand').click();
  await expect(dlg.getByTestId('option-faceSystem')).toHaveValue('기본색');
  await dlg.getByTestId('option-face-box').click();
  await dlg.getByTestId('option-face-picker').fill('#1a2b3c');
  await dlg.getByTestId('color-close').click();
  await expect(dlg.getByTestId('option-faceSystem')).toHaveValue('직접');
  await expect(dlg.getByTestId('option-faceCode')).toHaveValue('#1a2b3c');
  await expect(dlg.getByTestId('quick-body')).toContainText('#1a2b3c');
  // 체계 RAL + 코드 + 광택
  await dlg.getByTestId('option-faceSystem').selectOption('RAL');
  await dlg.getByTestId('option-faceCode').fill('1003');
  await dlg.getByTestId('option-faceGloss').selectOption('무광');
  expect((await objOf(page)).options).toMatchObject({ faceSystem: 'RAL', faceCode: '1003', faceGloss: '무광' });
  await expect(dlg.getByTestId('quick-body')).toContainText('RAL 1003');
  // 투명도: 확장 모드 슬라이더 → 2D 바탕이 반투명
  await dlg.getByTestId('option-face-box').click();
  await dlg.getByTestId('option-face-swatch-노랑').click();
  await dlg.getByTestId('option-faceAlpha').fill('40');
  expect((await objOf(page)).options.faceAlpha).toBe('40');
  await page.getByTestId('close-object-settings').click();
  await expect(page.getByTestId('sign-fill')).toHaveCount(1);
  expect(await page.getByTestId('sign-fill').evaluate((e) => getComputedStyle(e).opacity)).toBe('0.6');
  await openObjectSettings(page);
  await dlg.getByTestId('option-face-expand').click();
  // ✕ 도색 없음
  await dlg.getByTestId('option-face-box').click();
  await dlg.getByTestId('option-face-none').click();
  await expect(dlg.getByTestId('option-face-now')).toContainText('도색 없음');
  // 갈바 도색도 같은 피커, 채널 측면도
  await dlg.getByTestId('product-select').selectOption('board-galva');
  await expect(dlg.getByTestId('option-paint-color')).toBeVisible();
  await dlg.getByTestId('option-paint-box').click();
  await dlg.getByTestId('option-paint-swatch-검정').click();
  await dlg.getByTestId('quick-add').click();
  await dlg.getByTestId('add-part-channel').click();
  await expect(dlg.getByTestId('part-option-body-color')).toBeVisible();
  await dlg.getByTestId('part-option-body-box').click();
  await dlg.getByTestId('part-option-body-swatch-금색').click();
  await expect(dlg.getByTestId('quick-part')).toContainText('금색');
  // 채널 앞면 색(시트): 전광 채널에 있고, 고르면 사진 위 2D 글자 색이 된다
  await expect(dlg.getByTestId('part-option-face-color')).toBeVisible();
  await dlg.getByTestId('part-option-face-box').click();
  await dlg.getByTestId('part-option-face-swatch-노랑').click();
  await dlg.getByTestId('add-item-text').click();
  await dlg.getByTestId('item-text').fill('간판');
  await page.getByTestId('width-mm').fill('3000');
  await page.getByTestId('height-mm').fill('600');
  await page.getByTestId('close-object-settings').click();
  await expect(page.getByTestId('photo-zone').getByTestId('parts-overlay').locator('text')).toHaveAttribute('fill', '#ffcc00');
  await openObjectSettings(page);
  await page.getByTestId('close-object-settings').click();
  await expect(page.getByTestId('object-summary')).toContainText('검정');
  await expect(page.getByTestId('object-summary')).toContainText('금색');
});
