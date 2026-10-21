import { expect, test } from '@playwright/test';
import { dragOnPhoto, openObjectSettings, openOwnedProject, pickCategory, uploadPhoto } from './helpers';

test.beforeEach(async ({ page, request }) => {
  await openOwnedProject(page, request);
});

test('사진을 올리면 보드에 구역으로 놓이고, 이름은 프로젝트 이름_img_번호 (2026-10-20 "이미지 이름이 모두 같아")', async ({ page }) => {
  await uploadPhoto(page);
  await expect(page.getByTestId('photo-zone')).toHaveCount(1);
  await expect(page.getByTestId('photo-zone').locator('.name')).toHaveText('테스트 매장_img_1');
  await uploadPhoto(page);
  await expect(page.getByTestId('photo-zone')).toHaveCount(2);
  await expect(page.getByTestId('photo-zone').nth(1).locator('.name')).toHaveText('테스트 매장_img_2');
});

test('사각 도구로 사인물 영역을 그리면 오브젝트가 생기고 패널이 열린다', async ({ page }) => {
  await uploadPhoto(page);
  await page.keyboard.press('t');
  await dragOnPhoto(page, [400, 200], [800, 300]);
  await expect(page.getByTestId('sign-shape')).toHaveCount(1);
  await expect(page.getByTestId('object-panel')).toBeVisible();
});

test('원형 도구 = 모서리 50% 둥근 사각형. 설정에서 둥글기를 조절하고 디자인은 그 모양으로 잘린다', async ({ page }) => {
  await uploadPhoto(page);
  await page.keyboard.press('o');
  await dragOnPhoto(page, [1000, 100], [1200, 300]);
  const shape = page.getByTestId('sign-shape');
  await expect(shape).toHaveAttribute('data-shape', 'rect');
  await expect(shape).toHaveAttribute('data-corner', '0.5');
  const round = (await shape.getAttribute('points'))!.split(' ').length;
  expect(round).toBeGreaterThan(8);
  await openObjectSettings(page);
  await expect(page.getByTestId('corner-ratio')).toHaveValue('50');
  await page.getByTestId('corner-ratio').fill('0');
  await expect(shape).toHaveAttribute('data-corner', '0');
  expect((await shape.getAttribute('points'))!.split(' ').length).toBe(4);
  await page.getByTestId('corner-ratio').fill('20');
  await expect(shape).toHaveAttribute('data-corner', '0.2');
});

test('치수 입력 → 다른 영역 추정 → 잘못된 치수는 경고(옵션 켜면) → 추정값 적용', async ({ page }) => {
  await uploadPhoto(page);
  // 경고는 옵션 (설정에서 켬)
  await page.getByTestId('open-settings').click();
  await page.getByTestId('settings-tab-display').click();
  await page.getByTestId('warn-measure').check();
  await page.getByTestId('close-settings').click();
  await page.keyboard.press('t');
  await dragOnPhoto(page, [400, 200], [800, 300]); // 400×100px
  await openObjectSettings(page);
  await page.getByTestId('width-mm').fill('4000');
  await page.getByTestId('height-mm').fill('1000');
  await expect(page.getByTestId('reference-badge')).toBeVisible();

  await page.keyboard.press('Escape');
  await page.keyboard.press('t');
  await dragOnPhoto(page, [900, 200], [1100, 300]); // 200×100px → 2000×1000mm
  await pickCategory(page, 'sheet'); // 시트 분류 = 시트 구성 요소(커팅 시트로 시작, 2026-10-16 모든 분류 조합형)
  await openObjectSettings(page);
  await expect(page.getByTestId('width-mm')).toHaveAttribute('placeholder', /2,000/);
  // 치수 미입력이어도 추정 치수로 예상 금액을 보여준다 (리스트 견적과 일치): 2㎡ × 커팅 시트 35,000
  await page.getByTestId('object-settings').getByTestId('quick-price').click(); // 금액 탭
  await expect(page.getByTestId('object-price')).toContainText('추정 2,000×1,000');
  await expect(page.getByTestId('object-price')).toContainText('70,000원');

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
  await page.keyboard.press('t');
  await dragOnPhoto(page, [400, 200], [800, 300]);
  await pickCategory(page, 'sign');
  await openObjectSettings(page);
  await page.getByTestId('width-mm').fill('4000');
  await page.getByTestId('height-mm').fill('1000');
  await page.getByTestId('product-select').selectOption('board-acp');
  await page.getByTestId('object-settings').getByTestId('quick-add').click();
  await page.getByTestId('add-part-sheet-uv').click(); // 조합형 (2026-10-16): 간판의 시트는 구성 요소
  await page.getByTestId('close-object-settings').click();

  await page.getByTestId('view-list').click();
  await expect(page.getByTestId('list-card')).toHaveCount(1);
  await expect(page.getByTestId('list-card')).toContainText('4,000 × 1,000');
  if (await page.getByTestId('quote-auto-all').count()) await page.getByTestId('quote-auto-all').click(); // 새 프로젝트는 수동 입력 → 자동
  // 알루미늄 복합판 4㎡ × 85,000 + 실사 시트 4㎡ × 30,000 = 460,000 + 기본 설치비 250,000 = 710,000 → VAT 포함 781,000
  await expect(page.getByTestId('quote-total')).toContainText('781,000원');
});

test('오브젝트별 대화 (카톡형)', async ({ page }) => {
  await uploadPhoto(page);
  await page.keyboard.press('t');
  await dragOnPhoto(page, [400, 200], [800, 300]);
  await page.getByTestId('object-chat-open').click(); // 대화는 말풍선 창에서 (2026-10-18)
  await expect(page.getByTestId('object-chat')).toBeVisible();
  await page.getByTestId('chat-input').fill('가로 4m 맞나요?');
  await page.getByTestId('chat-input').press('Enter');
  await expect(page.getByTestId('chat-bubble')).toHaveCount(1);
  await expect(page.getByTestId('chat-bubble')).toContainText('가로 4m 맞나요?');
  await expect(page.getByTestId('chat-bubble')).toHaveClass(/mine/);
});

test('새로고침해도 작업이 유지된다', async ({ page }) => {
  await uploadPhoto(page);
  await page.keyboard.press('t');
  await dragOnPhoto(page, [400, 200], [800, 300]);
  await openObjectSettings(page);
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

test('하단 도구 막대 순서: 선택·말풍선 | 존·실행 취소·다시 실행·사각·타원·사진·전체 보기. 자동은 없음, 실행 취소·다시 실행·사진은 아이콘 (2026-10-20)', async ({ page }) => {
  // 2026-10-20 사용자: "하단 툴바 위치를 변경한다. 자동은 삭제 존,undo,redo, 사각,원(타원으로 변경), 사진, 전체보기 / 언두 리두 아이콘 일반적인 모양으로 사진은 사진기 아이콘으로"
  await uploadPhoto(page);
  const ids = await page.locator('.tools[role="toolbar"] > [data-testid]').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')));
  expect(ids).toEqual(['tool-select', 'tool-pin', 'tool-zone', 'undo', 'redo', 'tool-rect', 'tool-ellipse', 'tool-photo', 'zoom-fit', 'zoom-label']);
  await expect(page.getByTestId('tool-magic')).toHaveCount(0);
  await expect(page.getByTestId('tool-ellipse')).toContainText('타원');
  for (const t of ['undo', 'redo', 'tool-photo']) await expect(page.getByTestId(t).locator('svg')).toHaveCount(1);
  await expect(page.getByTestId('tool-photo')).not.toContainText('＋');
  await expect(page.getByTestId('undo')).not.toContainText('↶');
});
