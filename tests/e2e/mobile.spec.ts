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
  await expect(page.getByTestId('render-open')).toHaveText('🧊');
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
});
