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
  await page.getByTestId('option-channel').selectOption('전광 채널');
  await page.getByTestId('sign-text').fill('간판다 카페');
  await expect(page.getByTestId('char-count')).toHaveAttribute('placeholder', /5/);
  await page.getByTestId('height-mm').fill('600');
  await page.getByTestId('width-mm').fill('3000');
  await expect(page.getByTestId('object-price')).toContainText('5자');
  // 몸통(갈바) + 채널 조합 → 견적 두 줄 (㎡ + 자·cm)
  await page.getByTestId('product-select').selectOption('board-galva');
  await expect(page.getByTestId('option-channel')).toHaveValue('전광 채널');
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
