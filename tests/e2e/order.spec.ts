import { expect, test } from '@playwright/test';
import { dragOnPhoto, openObjectSettings, openOwnedProject, uploadPhoto } from './helpers';

test('주문 사양: 종류를 고르면 그 옵션 폼이 나오고, 요약·주문서·JSON 에 반영된다', async ({ page, request }) => {
  await openOwnedProject(page, request, '한울상사');
  await uploadPhoto(page);
  await page.keyboard.press('r');
  await dragOnPhoto(page, [400, 200], [800, 300]);
  await page.getByTestId('category-sign').click();
  await openObjectSettings(page);
  await page.getByTestId('width-mm').fill('3000');
  await page.getByTestId('height-mm').fill('600');
  // 후렉스(기본) → 단면/양면 + 내부 조명
  await expect(page.getByTestId('option-sides')).toBeVisible();
  await page.getByTestId('option-sides').selectOption('양면');
  await expect(page.getByTestId('option-light')).toBeVisible();
  // 갈바로 바꾸면 갈바 옵션으로 바뀌고(조건부 컬러코드), 후렉스 옵션은 사라진다
  await page.getByTestId('product-select').selectOption('board-galva');
  await expect(page.getByTestId('option-sides')).toHaveCount(0);
  await page.getByTestId('option-form').selectOption('일체형(전면)');
  await page.getByTestId('option-paintSystem').selectOption('RAL');
  await page.getByTestId('option-paintCode').fill('9005');
  // 시트를 더하면 시트 옵션, 시트 컷팅이면 반컷팅
  await page.getByTestId('sheet-sh-cut').click();
  await expect(page.getByTestId('option-halfCut')).toBeVisible();
  await page.getByTestId('option-halfCut').check();
  await page.getByTestId('sign-note').fill('배선은 왼쪽 위');
  await page.getByTestId('close-object-settings').click();
  await expect(page.getByTestId('object-summary')).toContainText('일체형(전면)');
  await expect(page.getByTestId('object-summary')).toContainText('반컷팅');

  // 주문 정보 → 주문서
  await page.getByTestId('view-list').click();
  await page.getByTestId('open-order').click();
  await page.getByTestId('order-customer').fill('홍길동');
  await page.getByTestId('order-phone').fill('010-1234-5678');
  await page.getByTestId('order-delivery').selectOption('install');
  await page.getByTestId('order-address').fill('경기도 이천시');
  await page.getByTestId('order-due').fill('2026-10-25');
  await page.getByTestId('order-notes').fill('크레인 진입 확인');
  await page.getByTestId('close-order').click();
  await page.getByTestId('open-quote-sheet').click();
  const sheet = page.getByTestId('quote-sheet');
  await expect(sheet).toContainText('주 문 서');
  await expect(sheet).toContainText('홍길동');
  await expect(sheet).toContainText('시공 요청');
  await expect(sheet).toContainText('2026-10-25');
  await expect(sheet).toContainText('RAL');
  await expect(sheet).toContainText('9005');
  await expect(sheet).toContainText('반컷팅');
  await expect(sheet).toContainText('배선은 왼쪽 위');
  await expect(sheet).toContainText('크레인 진입 확인');
  await expect(sheet).toContainText('CMYK');

  // JSON 내보내기
  const [download] = await Promise.all([page.waitForEvent('download'), sheet.getByTestId('order-json').click()]);
  expect(download.suggestedFilename()).toMatch(/\.json$/);
  const json = JSON.parse(await (await download.createReadStream()).toArray().then((b) => Buffer.concat(b).toString('utf-8')));
  expect(json.order_info.customer).toBe('홍길동');
  expect(json.items[0].type).toBe('갈바 간판');
  expect(json.items[0].options.paintCode).toBe('9005');
  expect(json.items[0].options.halfCut).toBe(true);
  expect(json.items[0].size.width_mm).toBe(3000);
  expect(json.items[0].note).toBe('배선은 왼쪽 위');
  expect(json.totals.total).toBeGreaterThan(0);
});
