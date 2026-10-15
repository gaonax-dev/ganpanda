import { expect, test } from '@playwright/test';
import { dragOnPhoto, openObjectSettings, openOwnedProject, pickCategory, uploadPhoto } from './helpers';

test('주문 사양: 종류를 고르면 그 옵션 폼이 나오고, 요약·주문서·JSON 에 반영된다', async ({ page, request }) => {
  await openOwnedProject(page, request, '한울상사');
  await uploadPhoto(page);
  await page.keyboard.press('t');
  await dragOnPhoto(page, [400, 200], [800, 300]);
  await pickCategory(page, 'sign');
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
  expect(json.items[0].type).toBe('갈바');
  expect(json.items[0].options.paintCode).toBe('9005');
  expect(json.items[0].options.halfCut).toBe(true);
  expect(json.items[0].size.width_mm).toBe(3000);
  expect(json.items[0].note).toBe('배선은 왼쪽 위');
  expect(json.totals.total).toBeGreaterThan(0);
});

test('한울 조합형: 새 종류(라이트패널·사인미러)와 채널 조합 옵션이 폼에 나오고, 개 단위는 1식으로 견적', async ({ page, request }) => {
  // 2026-10-15 사용자: "hanwoolcorp… 조합형으로 주문 가능하게… 현재 사인물 설정 구성해줘"
  await openOwnedProject(page, request, '한울상사');
  await uploadPhoto(page);
  await page.keyboard.press('t');
  await dragOnPhoto(page, [400, 200], [800, 300]);
  await pickCategory(page, 'sign');
  await openObjectSettings(page);
  // 프레임 간판(기본): 프레임 구조·플렉스 출력 + 채널을 고르면 방식·제작 방식·입체 두께·서체·채널 프레임·까치발
  await expect(page.getByTestId('option-frame')).toBeVisible();
  await expect(page.getByTestId('option-print')).toBeVisible();
  await page.getByTestId('option-channel').selectOption('전광 채널');
  for (const k of ['chType', 'chBuild', 'chDepth', 'font', 'chFrame', 'bracket']) await expect(page.getByTestId(`option-${k}`)).toBeVisible();
  await page.getByTestId('option-chFrame').selectOption('200폭');
  await expect(page.getByTestId('option-chFrameColor')).toBeVisible();
  // 스카시 부착도 간판 옵션 (2026-10-15 사용자: "스카시도 부착된다")
  await page.getByTestId('option-scashi').selectOption('티타늄 스카시');
  for (const k of ['scThick', 'scMaterial', 'scPaintSystem', 'scPaintCode']) await expect(page.getByTestId(`option-${k}`)).toBeVisible();
  await page.getByTestId('close-object-settings').click();
  // 분류 9개 (2026-10-15 분류 재정리): 라이트패널 분류
  await expect(page.getByTestId('category-select').locator('option')).toHaveText(['분류 선택', '간판', '시트', '스카시', '포맥스', '현수막', '라이트패널', '액자', '어닝', '사인미러']);
  await pickCategory(page, 'lightpanel');
  await openObjectSettings(page);
  for (const k of ['smps', 'place', 'frameColor']) await expect(page.getByTestId(`option-${k}`)).toBeVisible();
  await expect(page.getByTestId('option-channel')).toHaveCount(0); // 채널은 간판 옵션
  await page.getByTestId('close-object-settings').click();
  // LED 사인미러(따로 분류): 개(1식) 단가
  await pickCategory(page, 'mirror');
  await openObjectSettings(page);
  await page.getByTestId('option-led').selectOption('전구색 4000K');
  await page.getByTestId('close-object-settings').click();
  await expect(page.getByTestId('object-summary')).toContainText('전구색 4000K');
  await page.getByTestId('view-list').click();
  await expect(page.locator('.line').filter({ hasText: 'LED 사인미러' })).toContainText('1식');
});
