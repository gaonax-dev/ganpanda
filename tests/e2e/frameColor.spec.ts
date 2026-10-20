// 출력면 색 vs 프레임 색 (2026-10-17 사용자: "갈바나 후랙스 같이 프레임이 있는 경우 컬러를 넣을 수 있게 … 프레임과 구분지어야한다")
import { expect, test, type Page } from '@playwright/test';
import { dragOnPhoto, openObjectSettings, openOwnedProject, pickCategory, uploadPhoto } from './helpers';

const objOf = (page: Page) => page.evaluate(() => JSON.parse(JSON.stringify((window as unknown as { __ganpanda: { objects: unknown[] } }).__ganpanda.objects[0])));

test('후렉스: 출력면 색과 프레임 색 피커가 따로 있고, 프레임 테는 2D 사진 위 고리로 (평면도 카드에는 테두리 없음)', async ({ page, request }) => {
  await openOwnedProject(page, request, '프레임 색');
  await uploadPhoto(page);
  await page.keyboard.press('t');
  await dragOnPhoto(page, [400, 200], [800, 300]);
  await pickCategory(page, 'sign');
  await openObjectSettings(page);
  const dlg = page.getByTestId('object-settings');
  await dlg.getByTestId('product-select').selectOption('board-flex');
  await expect(dlg.getByTestId('option-face-color')).toContainText('배경색 (미리보기)'); // 2026-10-21 미리보기 — "배경색" (출력 바탕 — 프레임 색과 구분은 그대로)
  await expect(dlg.getByTestId('option-framePaint-color')).toContainText('프레임 색');
  await dlg.getByTestId('option-face-box').click();
  await dlg.getByTestId('option-face-swatch-노랑').click();
  await dlg.getByTestId('option-framePaint-box').click();
  await dlg.getByTestId('option-framePaint-swatch-검정').click();
  expect((await objOf(page)).options).toMatchObject({ faceSystem: '기본색', faceCode: '노랑', framePaintSystem: '기본색', framePaintCode: '검정' });
  // 칩은 출력면 색(몸통 색), 2D 바탕도 출력면 색
  await expect(dlg.getByTestId('quick-body')).toContainText('노랑');
  expect(await page.getByTestId('sign-fill').evaluate((e) => getComputedStyle(e).backgroundColor)).toBe('rgb(255, 204, 0)');
  // 치수를 넣으면 2D 사진 위에 프레임 테(고리)가. 평면도 카드에는 테두리를 주지 않는다 (2026-10-17 "정면도들은 테두리를 주지 않는다")
  await expect(page.getByTestId('sign-frame')).toHaveCount(0); // 치수 전에는 테 폭을 모른다
  await dlg.getByTestId('width-mm').fill('3000');
  await dlg.getByTestId('height-mm').fill('600');
  await expect(page.getByTestId('sign-frame')).toHaveCount(1);
  expect(await page.getByTestId('sign-frame').evaluate((e) => getComputedStyle(e).backgroundColor)).toBe('rgb(20, 20, 20)');
  await dlg.getByTestId('close-object-settings').click();
  const card = page.getByTestId('board-card');
  await expect(card).toHaveCount(1);
  await expect(card.getByTestId('card-fill')).toHaveCount(1);
  await expect(card.getByTestId('card-frame')).toHaveCount(0);
});
