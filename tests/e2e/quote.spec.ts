import { expect, test } from '@playwright/test';
import { apiCreateInvite, apiCreateProject, dragOnPhoto, openInvited, openObjectSettings, openOwnedProject, pickCategory, uploadPhoto } from './helpers';

async function makeSign(page: import('@playwright/test').Page) {
  await uploadPhoto(page);
  await page.keyboard.press('t');
  await dragOnPhoto(page, [400, 200], [800, 300]);
  await pickCategory(page, 'sign');
  await openObjectSettings(page);
  await page.getByTestId('width-mm').fill('2000');
  await page.getByTestId('height-mm').fill('1000');
  await page.getByTestId('product-select').selectOption('board-acp');
  await page.getByTestId('close-object-settings').click();
}

test('문구를 넣으면 채널 글자수가 자동으로 세어진다', async ({ page, request }) => {
  await openOwnedProject(page, request);
  await uploadPhoto(page);
  await page.keyboard.press('t');
  await dragOnPhoto(page, [400, 200], [800, 300]);
  await pickCategory(page, 'sign');
  await openObjectSettings(page);
  await page.getByTestId('product-select').selectOption('body-none');
  // 조합형 (2026-10-16): 채널 구성 요소 + 글자 객체, 글자수는 객체마다
  await page.getByTestId('add-part-channel').click();
  await page.getByTestId('add-item-text').click();
  await page.getByTestId('item-text').fill('간판다 카페');
  await page.getByTestId('item-h').fill('600');
  await expect(page.getByTestId('item-count')).toHaveAttribute('placeholder', /5/);
  await page.getByTestId('height-mm').fill('600');
  await page.getByTestId('width-mm').fill('3000');
  await expect(page.getByTestId('object-price')).toContainText('5자');
  // 몸통(갈바) + 채널 조합 → 견적 두 줄 (㎡ + 자·cm)
  await page.getByTestId('product-select').selectOption('board-galva');
  await expect(page.getByTestId('part-type')).toHaveValue('ch-front'); // 몸통을 바꿔도 구성 요소는 그대로
  await page.getByTestId('close-object-settings').click();
  await page.getByTestId('view-list').click();
  await expect(page.locator('.line').filter({ hasText: '· 갈바' })).toHaveCount(1);
  await expect(page.locator('.line').filter({ hasText: '전광 채널' })).toHaveCount(1);
});

test('단가 설정에서 ㎡ 단가를 바꾸면 견적이 바뀌고, 고객도 같은 단가를 본다', async ({ page, request, browser }) => {
  const { session, projectId } = await openOwnedProject(page, request);
  await makeSign(page);
  await page.getByTestId('view-list').click();
  const before = await page.getByTestId('quote-total').textContent();
  await page.getByTestId('open-prices').click();
  await page.getByTestId('price-board-acp').fill('100000');
  await page.getByTestId('price-install').fill('0');
  await page.getByTestId('price-minimum').fill('0');
  await page.getByTestId('close-prices').click();
  // 2㎡ × 100,000 = 200,000 → VAT 10% → 220,000
  await expect(page.getByTestId('quote-total')).toContainText('220,000원');
  expect(await page.getByTestId('quote-total').textContent()).not.toBe(before);

  const guest = await openInvited(browser, await apiCreateInvite(request, session, projectId, 'viewer'));
  await guest.getByTestId('view-list').click();
  await expect(guest.getByTestId('quote-total')).toContainText('220,000원');
  await expect(guest.getByTestId('open-prices')).toHaveCount(0); // 고객은 단가 수정 불가
  await guest.ctx.close();
});

test('설치비·추가 항목·부가세 포함 표시', async ({ page, request }) => {
  await openOwnedProject(page, request);
  await makeSign(page);
  await page.getByTestId('view-list').click();
  await page.getByTestId('open-prices').click();
  await page.getByTestId('price-board-acp').fill('100000');
  await page.getByTestId('price-minimum').fill('0');
  await page.getByTestId('price-install').fill('50000');
  await page.getByTestId('close-prices').click();
  await expect(page.getByTestId('quote-install')).toContainText('50,000원');
  await page.getByTestId('extra-add').click();
  await page.getByTestId('extra-label').last().fill('소개 할인');
  await page.getByTestId('extra-amount').last().fill('-20000');
  await page.getByTestId('extra-amount').last().press('Enter');
  // 200,000 + 50,000 − 20,000 = 230,000 → 253,000
  await expect(page.getByTestId('quote-total')).toContainText('253,000원');
  await page.getByTestId('open-prices').click();
  await page.getByTestId('price-vat-included').check();
  await page.getByTestId('close-prices').click();
  await expect(page.getByTestId('quote-total')).toContainText('230,000원');
  await expect(page.getByTestId('quote-vat-note')).toContainText('포함');
});

test('내 기본 단가로 저장하면 새 프로젝트에 적용된다', async ({ page, request }) => {
  const { session } = await openOwnedProject(page, request);
  await page.getByTestId('view-list').click();
  await page.getByTestId('open-prices').click();
  await page.getByTestId('price-board-acp').fill('123000');
  await page.getByTestId('save-default-prices').click();
  await expect(page.getByTestId('prices-saved')).toBeVisible();
  const other = await apiCreateProject(request, session, '두 번째 매장');
  await page.goto(`/?room=${other}`);
  await expect(page.getByTestId('sync-status')).toHaveAttribute('data-status', 'online');
  await page.getByTestId('view-list').click();
  await page.getByTestId('open-prices').click();
  await expect(page.getByTestId('price-board-acp')).toHaveValue('123000');
});

test('견적서 인쇄 화면', async ({ page, request }) => {
  await openOwnedProject(page, request, '행복 미용실');
  await makeSign(page);
  await page.getByTestId('view-list').click();
  await page.getByTestId('open-quote-sheet').click();
  await expect(page.getByTestId('quote-sheet')).toBeVisible();
  await expect(page.getByTestId('quote-sheet')).toContainText('행복 미용실');
  await expect(page.getByTestId('quote-sheet')).toContainText('알루미늄 복합판');
  await expect(page.getByTestId('quote-sheet')).toContainText('합계');
  await page.getByTestId('close-quote-sheet').click();
  await expect(page.getByTestId('quote-sheet')).toHaveCount(0);
});

test('공급 단가표(한울): 내 단가 항목을 연결하면 단가를 가져오고 꼬리표가 붙고, 직접 고치면 풀린다', async ({ page, request }) => {
  // 2026-10-16 사용자: "한울 단가표이다. 해당 단가는 한울 꼬리표가 있어야 한다… 지금은 개발중으로 둘다 구성하고 추후 업로드나 api로… 사용자가 입력가능하게"
  await openOwnedProject(page, request);
  await makeSign(page);
  await page.getByTestId('view-list').click();
  await page.getByTestId('open-prices').click();
  // 공급 단가표(읽기 전용)를 펼쳐 볼 수 있다
  await page.getByTestId('supplier-toggle-hanwool').click();
  await expect(page.getByTestId('supplier-list-hanwool')).toContainText('2026-03-27');
  await expect(page.getByTestId('supplier-item').filter({ hasText: '백색시트' }).first()).toContainText('7,500원/회배');
  // 알루미늄 복합판 ㎡ 단가 ← 한울 UV 백색시트(예시 연결)
  await page.getByTestId('price-link-board-acp').selectOption('hanwool:hanwool.uv.백색시트');
  await expect(page.getByTestId('price-board-acp')).toHaveValue('7500');
  await expect(page.getByTestId('price-tag-board-acp')).toHaveText('한울');
  await page.getByTestId('close-prices').click();
  await expect(page.locator('.line').filter({ hasText: '알루미늄 복합판' })).toContainText('한울 단가');
  // 직접 입력하면 연결·꼬리표가 풀린다
  await page.getByTestId('open-prices').click();
  await page.getByTestId('price-board-acp').fill('90000');
  await expect(page.getByTestId('price-tag-board-acp')).toHaveCount(0);
  await expect(page.getByTestId('price-link-board-acp')).toHaveValue('');
  await page.getByTestId('close-prices').click();
  await expect(page.locator('.line').filter({ hasText: '알루미늄 복합판' })).not.toContainText('한울');
});

test('배수: 연결한 항목은 공급 단가 × 배수(분류 배수 우선)로 다시 계산된다', async ({ page, request }) => {
  // 2026-10-16 사용자: "한울 가격을 몇배로 할지 조정해봐" → "단가는 사용가 설정할거고"
  await openOwnedProject(page, request);
  await page.getByTestId('view-list').click();
  await page.getByTestId('open-prices').click();
  await page.getByTestId('price-link-sh-print').selectOption('hanwool:hanwool.uv.백색시트');
  await expect(page.getByTestId('price-sh-print')).toHaveValue('7500');
  await page.getByTestId('markup-all').fill('2');
  await page.getByTestId('markup-all').press('Enter');
  await expect(page.getByTestId('price-sh-print')).toHaveValue('15000');
  await page.getByTestId('markup-UV').fill('1.3');
  await page.getByTestId('markup-UV').press('Enter');
  await expect(page.getByTestId('price-sh-print')).toHaveValue('9800');
  await expect(page.getByTestId('price-sh-cut')).toHaveValue('35000'); // 연결 안 한 항목은 그대로
});
