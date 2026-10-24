import { expect, test } from '@playwright/test';
import { clickOnPhoto, dragOnPhoto, openObjectSettings, openOwnedProject, pickCategory, uploadPhoto, openSettings } from './helpers';

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

test('사각 도구 안에서 모양 고르기: 원은 진짜 타원(라운드와 다름), 단축키 O 는 사각 도구 + 원 (2026-10-24 "원 툴은 거의 사용하지 않는다. 사각에서 원, 다각형을 선택할 수 있게 라운드와 원은 다른것이다")', async ({ page }) => {
  await uploadPhoto(page);
  await page.getByTestId('tool-rect').click();
  const shapes = page.getByTestId('draw-shapes');
  await expect(shapes).toBeVisible();
  await expect(shapes.getByTestId('draw-shape-rect')).toHaveClass(/on/);
  await shapes.getByTestId('draw-shape-ellipse').click();
  await dragOnPhoto(page, [1000, 100], [1200, 300]);
  const shape = page.getByTestId('sign-shape');
  await expect(shape).toHaveAttribute('data-shape', 'ellipse');
  expect((await shape.getAttribute('points'))!.split(' ').length).toBeGreaterThan(8);
  // 단축키 O = 사각 도구 + 원
  await page.keyboard.press('Escape');
  await page.keyboard.press('o');
  await expect(page.getByTestId('tool-rect')).toHaveClass(/on/);
  await expect(page.getByTestId('draw-shape-ellipse')).toHaveClass(/on/);
});

test('다각형: 점을 차례로 누르고 첫 점을 다시 누르면 닫힌다 (3점 이상)', async ({ page }) => {
  await uploadPhoto(page);
  await page.getByTestId('tool-rect').click();
  await page.getByTestId('draw-shape-polygon').click();
  for (const p of [[300, 150], [700, 120], [760, 330], [320, 360]] as [number, number][]) await clickOnPhoto(page, p);
  await expect(page.getByTestId('poly-draft')).toBeVisible();
  await clickOnPhoto(page, [302, 152]); // 첫 점 근처
  const shape = page.getByTestId('sign-shape');
  await expect(shape).toHaveCount(1);
  await expect(shape).toHaveAttribute('data-shape', 'polygon');
  await expect(page.getByTestId('poly-draft')).toHaveCount(0);
  const o = await page.evaluate(() => (window as unknown as { __ganpanda: { objects: { polygon?: number[][]; quad: number[][] }[] } }).__ganpanda.objects[0]);
  expect(o.polygon).toHaveLength(4);
  expect(o.quad).toHaveLength(4);
});

test('사각 도구를 켜면 [다중] 자리가 [연속] — 켜면 그린 뒤에도 사각 도구 유지, 다른 도구를 고르면 꺼짐 (2026-10-24 "사각툴을 켜면 다중버튼은 연속으로변경하고 계속 사각툴이 유지되게 그리고 다른 툴이 선택되면 리셋")', async ({ page }) => {
  await uploadPhoto(page);
  await expect(page.getByTestId('tool-continuous')).toHaveCount(0);
  await page.getByTestId('tool-rect').click();
  await expect(page.getByTestId('tool-multi')).toHaveCount(0);
  const cont = page.getByTestId('tool-continuous');
  await expect(cont).not.toHaveClass(/on/);
  await cont.click();
  await expect(cont).toHaveClass(/on/);
  await dragOnPhoto(page, [100, 100], [300, 200]);
  await dragOnPhoto(page, [400, 100], [600, 200]);
  await expect(page.getByTestId('sign-shape')).toHaveCount(2);
  await expect(page.getByTestId('tool-rect')).toHaveClass(/on/); // 계속 사각
  await page.getByTestId('tool-select').click();
  await page.getByTestId('tool-rect').click();
  await expect(page.getByTestId('tool-continuous')).not.toHaveClass(/on/); // 다른 도구를 고르면 리셋
  await dragOnPhoto(page, [700, 100], [900, 200]);
  await expect(page.getByTestId('tool-select')).toHaveClass(/on/); // 연속이 아니면 그린 뒤 선택 도구
});

test('치수 입력 → 다른 영역 추정 → 잘못된 치수는 경고(옵션 켜면) → 추정값 적용', async ({ page }) => {
  await uploadPhoto(page);
  // 경고는 옵션 (설정에서 켬)
  await openSettings(page);
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

test('하단 도구 막대 순서: 선택·다중(2026-10-22)·말풍선 | 존·실행 취소·다시 실행·사각·타원·사진·전체 보기. 자동은 없음, 실행 취소·다시 실행·사진은 아이콘 (2026-10-20)', async ({ page }) => {
  // 2026-10-20 사용자: "하단 툴바 위치를 변경한다. 자동은 삭제 존,undo,redo, 사각,원(타원으로 변경), 사진, 전체보기 / 언두 리두 아이콘 일반적인 모양으로 사진은 사진기 아이콘으로"
  await uploadPhoto(page);
  const ids = await page.locator('.tools[role="toolbar"] > [data-testid]').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')));
  expect(ids).toEqual(['tool-select', 'tool-multi', 'tool-zone', 'undo', 'redo', 'tool-rect', 'tool-photo', 'zoom-fit', 'zoom-label']); // 원(타원) 도구는 사각 안으로 (2026-10-24)
  await expect(page.getByTestId('tool-magic')).toHaveCount(0);
  await expect(page.getByTestId('tool-ellipse')).toHaveCount(0);
  // 사각·전체 보기도 같은 선 두께의 아이콘, 사각은 정사각 (2026-10-24 "사각형 툴 아이콘 정사각으로 하고 다른 툴 아이콘과 같은 두께로 해줘 확대도 마찮가지로")
  for (const t of ['undo', 'redo', 'tool-photo', 'tool-rect', 'zoom-fit']) await expect(page.getByTestId(t).locator('svg.ico')).toHaveCount(1);
  const r = page.getByTestId('tool-rect').locator('svg rect');
  expect(await r.getAttribute('width')).toBe(await r.getAttribute('height'));
  await expect(page.getByTestId('tool-photo')).not.toContainText('＋');
  await expect(page.getByTestId('undo')).not.toContainText('↶');
});
