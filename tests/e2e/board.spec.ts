import { expect, test } from '@playwright/test';
import { dragOnPhoto, openOwnedProject, uploadPhoto } from './helpers';

test.beforeEach(async ({ page, request }) => {
  await openOwnedProject(page, request);
});

test('사진을 올리면 보드에 구역으로 놓인다', async ({ page }) => {
  await uploadPhoto(page);
  await expect(page.getByTestId('photo-zone')).toHaveCount(1);
  await expect(page.getByTestId('photo-zone')).toContainText('정면.png');
});

test('사각 도구로 사인물 영역을 그리면 오브젝트가 생기고 패널이 열린다', async ({ page }) => {
  await uploadPhoto(page);
  await page.keyboard.press('r');
  await dragOnPhoto(page, [400, 200], [800, 300]);
  await expect(page.getByTestId('sign-shape')).toHaveCount(1);
  await expect(page.getByTestId('object-panel')).toBeVisible();
});

test('원형 도구', async ({ page }) => {
  await uploadPhoto(page);
  await page.keyboard.press('o');
  await dragOnPhoto(page, [1000, 100], [1200, 300]);
  await expect(page.getByTestId('sign-shape')).toHaveAttribute('data-shape', 'ellipse');
});

test('치수 입력 → 다른 영역 추정 → 잘못된 치수는 경고 → 추정값 적용', async ({ page }) => {
  await uploadPhoto(page);
  await page.keyboard.press('r');
  await dragOnPhoto(page, [400, 200], [800, 300]); // 400×100px
  await page.getByTestId('width-mm').fill('4000');
  await page.getByTestId('height-mm').fill('1000');
  await expect(page.getByTestId('reference-badge')).toBeVisible();

  await page.keyboard.press('Escape');
  await page.keyboard.press('r');
  await dragOnPhoto(page, [900, 200], [1100, 300]); // 200×100px → 2000×1000mm
  await expect(page.getByTestId('width-mm')).toHaveAttribute('placeholder', /2,000/);
  // 치수 미입력이어도 추정 치수로 예상 금액을 보여준다 (리스트 견적과 일치)
  await page.getByTestId('sheet-sh-print').click();
  await expect(page.getByTestId('object-price')).toContainText('추정 2,000×1,000');
  await expect(page.getByTestId('object-price')).toContainText('60,000원');

  await page.getByTestId('width-mm').fill('4000');
  await page.getByTestId('height-mm').fill('1000');
  await expect(page.getByTestId('measure-warning')).toContainText('2,000mm');
  await expect(page.getByTestId('sign-warning-icon')).toHaveCount(1);
  await page.getByTestId('apply-estimate').click();
  await expect(page.getByTestId('measure-warning')).toHaveCount(0);
  await expect(page.getByTestId('width-mm')).toHaveValue('2000');
});

test('종류·시트 선택 → 리스트 뷰 전개도와 견적', async ({ page }) => {
  await uploadPhoto(page);
  await page.keyboard.press('r');
  await dragOnPhoto(page, [400, 200], [800, 300]);
  await page.getByTestId('width-mm').fill('4000');
  await page.getByTestId('height-mm').fill('1000');
  await page.getByTestId('category-board').click();
  await page.getByTestId('product-select').selectOption('board-acp');
  await page.getByTestId('sheet-sh-print').click();

  await page.getByTestId('view-list').click();
  await expect(page.getByTestId('list-card')).toHaveCount(1);
  await expect(page.getByTestId('list-card')).toContainText('4,000 × 1,000');
  // 알루미늄 복합판 4㎡ × 85,000 + 실사 시트 4㎡ × 30,000 = 460,000 → VAT 포함 506,000
  await expect(page.getByTestId('quote-total')).toContainText('506,000원');
});

test('오브젝트별 대화 (카톡형)', async ({ page }) => {
  await uploadPhoto(page);
  await page.keyboard.press('r');
  await dragOnPhoto(page, [400, 200], [800, 300]);
  await page.getByTestId('chat-input').fill('가로 4m 맞나요?');
  await page.getByTestId('chat-input').press('Enter');
  await expect(page.getByTestId('chat-bubble')).toHaveCount(1);
  await expect(page.getByTestId('chat-bubble')).toContainText('가로 4m 맞나요?');
  await expect(page.getByTestId('chat-bubble')).toHaveClass(/mine/);
});

test('새로고침해도 작업이 유지된다', async ({ page }) => {
  await uploadPhoto(page);
  await page.keyboard.press('r');
  await dragOnPhoto(page, [400, 200], [800, 300]);
  await page.getByTestId('width-mm').fill('4000');
  await page.waitForTimeout(300);
  await page.reload();
  await expect(page.getByTestId('photo-zone')).toHaveCount(1);
  await expect(page.getByTestId('photo-img')).toBeVisible();
  await expect(page.getByTestId('sign-shape')).toHaveCount(1);
});

test('무한 캔버스: Ctrl+휠로 확대하면 사진이 커진다', async ({ page }) => {
  await uploadPhoto(page);
  const before = (await page.getByTestId('photo-img').boundingBox())!.width;
  await page.mouse.move(700, 450);
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, -300);
  await page.keyboard.up('Control');
  await expect.poll(async () => (await page.getByTestId('photo-img').boundingBox())!.width).toBeGreaterThan(before * 1.2);
});
