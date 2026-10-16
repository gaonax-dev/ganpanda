import { expect, test } from '@playwright/test';
import { openOwnedProject, uploadPhoto } from './helpers';

/** 휴대폰 폭(390px, 터치) — 핀치 확대와 축약 라벨 */
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

/** 캔버스에 터치 포인터 이벤트를 합성해 보낸다 (Playwright 터치스크린은 탭만 지원) */
async function touch(page: import('@playwright/test').Page, type: 'pointerdown' | 'pointermove' | 'pointerup', id: number, x: number, y: number) {
  await page.evaluate(({ type, id, x, y }) => {
    const el = document.querySelector('[data-testid="board-canvas"]')!;
    const target = document.elementFromPoint(x, y) ?? el;
    target.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: 'touch', isPrimary: id === 1, clientX: x, clientY: y, bubbles: true, cancelable: true, composed: true, button: 0, buttons: type === 'pointerup' ? 0 : 1 }));
  }, { type, id, x, y });
}

test('두 손가락을 벌리면 보드가 확대되고, 모으면 축소된다 (핀치)', async ({ page, request }) => {
  await openOwnedProject(page, request);
  await uploadPhoto(page);
  const z0 = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('[data-testid="board-canvas"] .world')!).transform.split('(')[1]));
  await touch(page, 'pointerdown', 1, 150, 400);
  await touch(page, 'pointerdown', 2, 250, 400);
  await touch(page, 'pointermove', 1, 100, 400);
  await touch(page, 'pointermove', 2, 300, 400); // 100 → 200 = 2배
  await touch(page, 'pointerup', 1, 100, 400);
  await touch(page, 'pointerup', 2, 300, 400);
  const z1 = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('[data-testid="board-canvas"] .world')!).transform.split('(')[1]));
  expect(z1 / z0).toBeGreaterThan(1.8);
  expect(z1 / z0).toBeLessThan(2.2);
  // 모으면 축소
  await touch(page, 'pointerdown', 1, 100, 400);
  await touch(page, 'pointerdown', 2, 300, 400);
  await touch(page, 'pointermove', 1, 150, 400);
  await touch(page, 'pointermove', 2, 250, 400);
  await touch(page, 'pointerup', 1, 150, 400);
  await touch(page, 'pointerup', 2, 250, 400);
  const z2 = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('[data-testid="board-canvas"] .world')!).transform.split('(')[1]));
  expect(z2).toBeLessThan(z1);
});

test('휴대폰 폭에서는 상단 바·도구·사진 머리글이 축약되어 화면을 넘치지 않는다', async ({ page, request }) => {
  await openOwnedProject(page, request);
  await uploadPhoto(page);
  await expect(page.getByTestId('view-board')).toHaveText(/^\s*보드\s*$/);
  await expect(page.getByTestId('view-list')).toContainText('리스트');
  await expect(page.getByTestId('proposal-button')).toHaveText('제안');
  await expect(page.getByTestId('invite-button')).toHaveText('초대');
  // 도구 막대는 아이콘만 (라벨 숨김)
  await expect(page.getByTestId('tool-rect').locator('.lbl')).toBeHidden();
  // 사진 머리글 버튼은 아이콘만
  await expect(page.getByTestId('camera-open')).toHaveText('📐');
  await expect(page.getByTestId('render-open')).toHaveText('🎨');
  // 접속자 칩·역할은 숨기고 프로젝트 이름은 보인다
  await expect(page.getByTestId('role-badge')).toBeHidden();
  const title = (await page.getByTestId('project-title').boundingBox())!;
  expect(title.width).toBeGreaterThan(40);
  // 가로 넘침 없음
  const over = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(over).toBe(false);
  // 상단 바 전체가 화면 안
  const nav = (await page.getByTestId('top-nav').boundingBox())!;
  expect(nav.x + nav.width).toBeLessThanOrEqual(391);
  // 3D 뷰 창은 화면 폭 가득
  await page.getByTestId('render-open').click();
  const dlg = (await page.getByTestId('render-dialog').boundingBox())!;
  expect(dlg.width).toBeGreaterThanOrEqual(380);
  await page.getByTestId('close-render').click();
  // 사진을 아주 작게(전체 보기보다 더) 축소하면 머리글은 이름만, 사진 위 라벨은 숨김
  await page.evaluate(() => { const el = document.querySelector('[data-testid="board-canvas"]')!; for (let i = 0; i < 12; i++) el.dispatchEvent(new WheelEvent('wheel', { deltaY: 120, clientX: 200, clientY: 400, bubbles: true, cancelable: true })); });
  await expect(page.getByTestId('camera-open')).toBeHidden();
  await expect(page.getByTestId('photo-zone').locator('svg text').first()).toBeHidden();
  await page.evaluate(() => { const el = document.querySelector('[data-testid="board-canvas"]')!; for (let i = 0; i < 12; i++) el.dispatchEvent(new WheelEvent('wheel', { deltaY: -120, clientX: 200, clientY: 400, bubbles: true, cancelable: true })); });
  await expect(page.getByTestId('camera-open')).toBeVisible();
});

test('휴대폰 폭: 사인물을 선택하면 종류 셀렉터 · [이름] [사이즈] 간단 입력 · [상세정보] 막대가 뜬다', async ({ page, request }) => {
  await openOwnedProject(page, request);
  await uploadPhoto(page);
  await page.evaluate(() => {
    const app = (window as unknown as { __ganpanda: { project: { allPhotos(): { id: string }[]; addObject(o: unknown): string } } }).__ganpanda;
    const photoId = app.project.allPhotos()[0].id;
    app.project.addObject({ photoId, name: '첫째', shape: 'rect', quad: [[200, 100], [800, 100], [800, 300], [200, 300]], sheetIds: [] });
    app.project.addObject({ photoId, name: '둘째', shape: 'rect', quad: [[900, 100], [1400, 100], [1400, 300], [900, 300]], sheetIds: [] });
  });
  const objs = () => page.evaluate(() => (window as unknown as { __ganpanda: { objects: { name: string; productId?: string; sheetIds: string[]; widthMm?: number; depthMm?: number }[] } }).__ganpanda.objects);
  // 사진 머리글(이름)을 탭하면 첫 사인물이 선택되어 막대가 뜬다 — 패널은 안 뜸
  await page.getByTestId('photo-zone').locator('.name').tap();
  await expect(page.getByTestId('quick-bar')).toBeVisible();
  await expect(page.getByTestId('quick-name')).toHaveText('첫째');
  await expect(page.getByTestId('object-panel')).toHaveCount(0);
  // 종류 셀렉터는 분류(간판/스카시/시트)만 — 세부 제품은 상세정보에서. 처음 선택은 바로
  await page.getByTestId('quick-kind').selectOption('scashi');
  await expect.poll(async () => (await objs()).find((o) => o.name === '첫째')?.productId).toBe('ch-rubber');
  await expect(page.getByTestId('quick-detail')).toContainText('고무 스카시');
  // 분류가 바뀌는 선택(스카시 → 시트)은 확인을 거친다
  await page.getByTestId('quick-kind').selectOption('sheet');
  await expect(page.getByTestId('category-confirm')).toBeVisible();
  await page.getByTestId('category-confirm-cancel').click();
  await expect.poll(async () => (await objs()).find((o) => o.name === '첫째')?.productId).toBe('ch-rubber');
  await page.getByTestId('quick-kind').selectOption('sheet');
  await page.getByTestId('category-confirm-ok').click();
  await expect.poll(async () => (await objs()).find((o) => o.name === '첫째')?.productId).toBeUndefined();
  // 간판으로 돌려도 사이즈 입력 줄은 가로×세로만 (두께는 소재에, 2026-10-16 "사인물 가로세로만 표시하고 두께는 소재에 붙이는게 맞을 거 같은데")
  await page.getByTestId('quick-kind').selectOption('sign');
  await page.getByTestId('category-confirm-ok').click();
  await page.getByTestId('quick-size').click();
  await expect(page.getByTestId('quick-depth')).toHaveCount(0);
  await page.getByTestId('quick-size').click(); // 닫기
  // [이름] → 간단 입력
  await page.getByTestId('quick-name').click();
  await page.getByTestId('quick-name-input').fill('출입문 시트');
  await page.getByTestId('quick-name-input').press('Enter');
  await expect(page.getByTestId('quick-name')).toHaveText('출입문 시트');
  // [사이즈] → 가로×세로, 다음 사인물로 넘어가며 입력
  await page.getByTestId('quick-size').click();
  await page.getByTestId('quick-width').fill('3000');
  await page.getByTestId('quick-height').fill('600');
  await expect.poll(async () => (await objs()).find((o) => o.name === '출입문 시트')?.widthMm).toBe(3000);
  await expect(page.getByTestId('quick-size')).toHaveText('3,000×600');
  await page.getByTestId('quick-next').click();
  await expect(page.getByTestId('quick-name')).toHaveText('둘째');
  await page.getByTestId('quick-width').fill('2500');
  await expect.poll(async () => (await objs()).find((o) => o.name === '둘째')?.widthMm).toBe(2500);
  // [상세정보] → 전체 패널, 닫으면 다시 막대 (선택 유지)
  await page.getByTestId('quick-panel-open').click();
  await expect(page.getByTestId('object-panel')).toBeVisible();
  await page.getByTestId('object-panel-close').click();
  await expect(page.getByTestId('quick-bar')).toBeVisible();
  await expect(page.getByTestId('quick-name')).toHaveText('둘째');
  // 선택된 사인물의 꼭짓점에는 보이는 핸들보다 두 배 넓은 터치 영역이 있다
  await expect(page.getByTestId('sign-handle-hit')).toHaveCount(4);
  const [hit, vis] = await Promise.all([page.getByTestId('sign-handle-hit').first().getAttribute('r'), page.getByTestId('sign-handle').first().getAttribute('r')]);
  expect(parseFloat(hit!) / parseFloat(vis!)).toBeCloseTo(2);
});

test('창을 휴대폰 폭으로 줄였다 되돌려도 가로 스와이프(휠)는 막히고 스크롤 연쇄가 없다 (뒤로가기 방지)', async ({ page, request }) => {
  await openOwnedProject(page, request);
  await uploadPhoto(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.waitForTimeout(200);
  const swipeBlocked = () => page.evaluate(() => { const ev = new WheelEvent('wheel', { deltaX: -80, deltaY: 3, bubbles: true, cancelable: true }); (document.elementFromPoint(640, 400) ?? document.body).dispatchEvent(ev); return ev.defaultPrevented; });
  expect(await swipeBlocked()).toBe(true);
  const ob = await page.evaluate(() => [getComputedStyle(document.documentElement).overscrollBehaviorX, getComputedStyle(document.body).overscrollBehaviorX, getComputedStyle(document.querySelector('[role="toolbar"]')!).overscrollBehaviorX]);
  expect(ob).toEqual(['none', 'none', 'contain']);
});

test('휴대폰 리스트 뷰: 하단 탭에 견적·단가·주문·주문서·PDF, 견적 창은 접힘 → 반 → 전체 → 반 → 접힘', async ({ page, request }) => {
  await openOwnedProject(page, request);
  await uploadPhoto(page);
  await page.evaluate(() => {
    const app = (window as unknown as { __ganpanda: { photos: { id: string }[]; project: { addObject(o: unknown): string } } }).__ganpanda;
    app.project.addObject({ photoId: app.photos[0].id, name: '간판', shape: 'rect', quad: [[200, 100], [800, 100], [800, 300], [200, 300]], sheetIds: [], productId: 'board-flex', widthMm: 3000, heightMm: 600 });
  });
  await page.getByTestId('view-list').click();
  const tabs = page.getByTestId('list-tabs');
  await expect(tabs).toBeVisible();
  await expect(tabs.getByTestId('quote-toggle')).toContainText('원'); // 합계
  const panel = page.getByTestId('quote-panel');
  await expect(panel).toBeHidden(); // 처음엔 접혀 전개도가 보인다
  await tabs.getByTestId('quote-toggle').click();
  await expect(panel).toBeVisible();
  const half = (await panel.boundingBox())!.height;
  await panel.getByTestId('quote-size').click();
  await expect(panel).toHaveAttribute('data-mode', 'full');
  expect((await panel.boundingBox())!.height).toBeGreaterThan(half + 100);
  await panel.getByTestId('quote-size').click();
  await expect(panel).toHaveAttribute('data-mode', 'half');
  await tabs.getByTestId('quote-toggle').click();
  await expect(panel).toBeHidden();
  // 탭의 기능 버튼
  await tabs.getByTestId('tab-prices').click();
  await expect(page.getByTestId('close-prices')).toBeVisible();
  await page.getByTestId('close-prices').click();
  // 가로 넘침 없음
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)).toBe(false);
});

test('휴대폰 디자인 파일 화면: 하단 탭 [사인물 연결]을 누르면 연결 창이 뜨고, 사인물을 고르면 닫히며 안내가 보인다', async ({ page, request }) => {
  await openOwnedProject(page, request);
  await uploadPhoto(page);
  await page.evaluate(() => {
    const app = (window as unknown as { __ganpanda: { photos: { id: string }[]; project: { addObject(o: unknown): string } } }).__ganpanda;
    app.project.addObject({ photoId: app.photos[0].id, name: '정면 간판', shape: 'rect', quad: [[200, 100], [800, 100], [800, 300], [200, 300]], sheetIds: [], productId: 'board-flex' });
  });
  await expect(page.getByTestId('view-uv')).toHaveText('디자인');
  await page.getByTestId('view-uv').click();
  const panel = page.getByTestId('link-panel');
  await expect(panel).toBeHidden();
  await page.getByTestId('link-toggle').click();
  await expect(panel).toBeVisible();
  await panel.getByTestId('uv-object').first().click();
  await expect(panel).toBeHidden();
  await expect(page.getByTestId('design-hint')).toContainText('정면 간판');
  await expect(page.getByTestId('link-toggle')).toContainText('정면 간판');
});
