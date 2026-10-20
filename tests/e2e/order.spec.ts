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
  await page.getByTestId('option-paint-expand').click(); // 컬러 피커 확장 모드 (2026-10-17)
  await page.getByTestId('option-paintSystem').selectOption('RAL');
  await page.getByTestId('option-paintCode').fill('9005');
  // 재질 시트를 더하면 시트 옵션, 컷 방식 반컷 (조합형·컷팅 옵션 2026-10-16)
  await page.getByTestId('object-settings').getByTestId('quick-add').click();
  await page.getByTestId('add-part-sheet-cut').click();
  await expect(page.getByTestId('part-option-cutMode')).toBeVisible();
  await page.getByTestId('part-option-cutMode').selectOption('반컷');
  await page.getByTestId('object-settings').getByTestId('quick-add').click();
  await page.getByTestId('quick-add-note').click(); // 요청사항 탭
  await page.getByTestId('sign-note').fill('배선은 왼쪽 위');
  await page.getByTestId('close-object-settings').click();
  await expect(page.getByTestId('object-summary')).toContainText('일체형(전면)');
  await expect(page.getByTestId('object-summary')).toContainText('재질 시트 단색 커팅 반컷');

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
  await expect(sheet).toContainText('반컷');
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
  expect(json.items[0].parts[0].options.cutMode).toBe('반컷');
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
  // 채널·스카시는 구성 요소 카드 (조합형 2026-10-16)
  await page.getByTestId('object-settings').getByTestId('quick-add').click();
  await page.getByTestId('add-part-channel').click();
  for (const k of ['chType', 'chBuild', 'chDepth', 'font', 'chFrame', 'bracket']) await expect(page.getByTestId(`part-option-${k}`)).toBeVisible();
  await page.getByTestId('part-option-chFrame').selectOption('200폭');
  await expect(page.getByTestId('part-option-chFramePaint-color')).toBeVisible(); // 채널 프레임 색 피커 (2026-10-17)
  await page.getByTestId('object-settings').getByTestId('quick-add').click();
  await page.getByTestId('add-part-scashi').click();
  await page.getByTestId('part-type').selectOption('sc-titan'); // 스카시 탭 (카드 하나)
  await expect(page.getByTestId('part-card').getByTestId('part-stack')).toBeVisible(); // 스카시 탭 — 두께·면판은 재료 층 (2026-10-21)
  await expect(page.getByTestId('part-card').getByTestId('part-option-paint-color')).toBeVisible(); // 도색은 컬러 피커 (2026-10-17)
  await page.getByTestId('close-object-settings').click();
  // 분류 9개 (2026-10-15 분류 재정리): 라이트패널 분류
  await expect(page.getByTestId('category-select').locator('option')).toHaveText(['분류 선택', '간판', '시트', '스카시', '포맥스', '현수막', '라이트패널', '액자', '어닝', '사인미러']);
  await pickCategory(page, 'lightpanel');
  await openObjectSettings(page);
  for (const k of ['smps', 'place']) await expect(page.getByTestId(`option-${k}`)).toBeVisible();
  await expect(page.getByTestId('option-framePaint-color')).toBeVisible(); // 프레임 색 피커 (2026-10-17)
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

test('간판 상단 조명: 구성 요소로 더하면 개수·팔 길이·빛 색이 나오고, 견적에 조명 줄이 생긴다', async ({ page, request }) => {
  // 2026-10-16 사용자: "간판에 상단에 돌출 조명, 트러스트바형식의 간접조명, 트러스트 타공조명 등을 자동 모델링" → "진행해줘"
  await openOwnedProject(page, request, '상단 조명');
  await uploadPhoto(page);
  await page.keyboard.press('t');
  await dragOnPhoto(page, [400, 200], [800, 300]);
  await pickCategory(page, 'sign');
  await openObjectSettings(page);
  await page.getByTestId('width-mm').fill('4800');
  await page.getByTestId('height-mm').fill('900');
  // 2026-10-19 "상단 조명부터 컴포넌트로 옮겨줘": 몸통 옵션이 아니라 구성 요소 [+ 상단 조명] → 카드의 세부 종류·옵션
  await expect(page.getByTestId('option-topLight')).toHaveCount(0);
  await page.getByTestId('object-settings').getByTestId('quick-add').click();
  await page.getByTestId('add-part-light').click();
  const card = page.getByTestId('part-card');
  await expect(card.getByTestId('part-type')).toHaveValue('tl-arm');
  for (const k of ['topCount', 'topArm', 'topColor']) await expect(card.getByTestId(`part-option-${k}`)).toBeVisible();
  await expect(card.getByTestId('add-item-text')).toHaveCount(0); // 글자·그림 객체는 없다
  await card.getByTestId('part-type').selectOption('tl-bar');
  await expect(card.getByTestId('part-option-topArm')).toHaveCount(0);
  await card.getByTestId('part-type').selectOption('tl-perf'); // 타공: 수량·빛 방향 (2026-10-19)
  await expect(card.getByTestId('part-option-topCount')).toBeVisible();
  await card.getByTestId('part-option-topAim').selectOption('간판 쪽 (간접)');
  await card.getByTestId('part-option-topSide').selectOption('하단');
  await expect(card.getByTestId('part-option-fixture-color')).toHaveCount(0); // 기본 = 간판과 같은 색
  await card.getByTestId('part-option-fixtureMode').selectOption('색 지정');
  await expect(card.getByTestId('part-option-fixture-color')).toBeVisible(); // 컬러 선택
  await card.getByTestId('part-option-fixtureMode').selectOption('간판과 같은 색');
  await card.getByTestId('part-option-topSide').selectOption('상단');
  await card.getByTestId('part-type').selectOption('tl-arm');
  await page.getByTestId('close-object-settings').click();
  await page.getByTestId('view-list').click();
  await expect(page.locator('.line').filter({ hasText: '돌출 투광등' })).toContainText('4개');
});

// 2026-10-19 "컴포넌트 추가": 몰딩·지주·LED 모듈 — 구성 요소로 더하면 옵션이 나오고 견적 줄이 생긴다
test('몰딩·지주·LED 모듈 구성 요소', async ({ page, request }) => {
  await openOwnedProject(page, request, '부속');
  await uploadPhoto(page);
  await page.keyboard.press('t');
  await dragOnPhoto(page, [400, 200], [800, 300]);
  await pickCategory(page, 'sign');
  await openObjectSettings(page);
  await page.getByTestId('width-mm').fill('3000');
  await page.getByTestId('height-mm').fill('1000');
  const card = page.getByTestId('part-card');
  for (const [kind, opt] of [['molding', 'moldEdges'], ['pole', 'poleHeight'], ['led', 'moduleCount']] as const) {
    await page.getByTestId('object-settings').getByTestId('quick-add').click();
    await page.getByTestId(`add-part-${kind}`).click();
    await expect(card.getByTestId(`part-option-${opt}`)).toBeVisible();
    await expect(card.getByTestId('add-item-text')).toHaveCount(0);
  }
  await card.getByTestId('part-option-moduleCount').fill('120');
  await page.getByTestId('close-object-settings').click();
  await page.getByTestId('view-list').click();
  await expect(page.locator('.line').filter({ hasText: '스텐 몰딩' })).toContainText('8.00m');
  await expect(page.locator('.line').filter({ hasText: '갈바 통 지주' })).toContainText('2개');
  await expect(page.locator('.line').filter({ hasText: 'LED 모듈' })).toContainText('120개');
});

