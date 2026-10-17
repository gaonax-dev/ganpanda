// 다중 선택 (2026-10-17 사용자: "다중선택 시 작동 버튼 나오게 삭제, 복사, 마지막 선택 구성으로 맞추기")
import { expect, test, type Page } from '@playwright/test';
import { dragOnPhoto, openOwnedProject, uploadPhoto } from './helpers';

const objs = (page: Page) => page.evaluate(() => JSON.parse(JSON.stringify((window as unknown as { __ganpanda: { objects: { id: string; name: string; productId?: string; options?: Record<string, string>; widthMm?: number; heightMm?: number }[] } }).__ganpanda.objects)));

test('Shift+클릭으로 여러 개 고르면 작업 막대: 마지막 선택 구성으로 맞추기 · 복사 · 삭제', async ({ page, request }) => {
  await openOwnedProject(page, request);
  await uploadPhoto(page);
  await page.keyboard.press('t');
  await dragOnPhoto(page, [100, 100], [400, 200]);
  await page.keyboard.press('t');
  await dragOnPhoto(page, [600, 100], [900, 200]);
  await page.keyboard.press('t');
  await dragOnPhoto(page, [1100, 100], [1400, 200]);
  const ids = (await objs(page)).map((o: { id: string }) => o.id);
  // 셋째(마지막 그린 것)에 구성을 넣는다: 갈바 + 도색 검정 + 치수
  await page.evaluate((id) => (window as unknown as { __ganpanda: { project: { updateObject(id: string, p: unknown): void } } }).__ganpanda.project.updateObject(id, { productId: 'board-galva', options: { paintSystem: '기본색', paintCode: '검정', form: '일체형(전면)' }, widthMm: 3000, heightMm: 600 }), ids[2]);
  await page.keyboard.press('v');
  // 첫째를 고르고, Shift 로 둘째·셋째를 더한다 → 셋째가 주 선택
  const shapes = page.getByTestId('sign-shape');
  await shapes.nth(0).click();
  await expect(page.getByTestId('multi-bar')).toHaveCount(0);
  await shapes.nth(1).click({ modifiers: ['Shift'] });
  await shapes.nth(2).click({ modifiers: ['Shift'] });
  await expect(page.getByTestId('multi-count')).toHaveText('3개 선택');
  await expect(page.locator('[data-testid="sign-shape"][data-selected]')).toHaveCount(1); // 주 선택 하나
  await expect(page.locator('.sign[data-multi]')).toHaveCount(2);
  // 맞추기: 첫째·둘째가 셋째의 종류·옵션을 받는다. 치수·이름은 그대로
  await page.getByTestId('multi-apply').click();
  const after = await objs(page);
  for (const id of [ids[0], ids[1]]) {
    const o = after.find((x: { id: string }) => x.id === id);
    expect(o.productId).toBe('board-galva');
    expect(o.options).toMatchObject({ paintCode: '검정', form: '일체형(전면)' });
    expect(o.widthMm).toBeUndefined();
  }
  // 크기 적용 (2026-10-17 "다중선택에 추가 메뉴 마지막 선택 크기적용"): 셋째의 가로·세로(·두께)를 첫째·둘째에
  await page.getByTestId('multi-size').click();
  for (const o of (await objs(page)).filter((x: { id: string }) => x.id !== ids[2])) { expect(o.widthMm).toBe(3000); expect(o.heightMm).toBe(600); }
  // 평면도 카드도 Shift+클릭으로 다중 선택 (2026-10-17 "정면도는 다중 선택이 안돼"): 치수가 생긴 셋 모두 카드가 있다 → 첫째 카드 Shift 클릭으로 빼고 다시 더하기
  await page.evaluate(() => { const el = document.querySelector('[data-testid="board-canvas"]')!; for (let i = 0; i < 2; i++) el.dispatchEvent(new WheelEvent('wheel', { deltaY: 120, clientX: 700, clientY: 200, bubbles: true, cancelable: true })); });
  const cards = page.getByTestId('board-card');
  await expect(cards).toHaveCount(3);
  await expect(page.locator('[data-testid="board-card"][data-multi]')).toHaveCount(2);
  await cards.first().click({ modifiers: ['Shift'] });
  await expect(page.getByTestId('multi-count')).toHaveText('2개 선택');
  await cards.first().click({ modifiers: ['Shift'] });
  await expect(page.getByTestId('multi-count')).toHaveText('3개 선택');
  await expect(page.locator('[data-testid="board-card"][data-multi]')).toHaveCount(2);
  // 복사: 3개가 더 생기고 복제본들이 선택
  await page.getByTestId('multi-duplicate').click();
  await expect.poll(async () => (await objs(page)).length).toBe(6);
  await expect(page.getByTestId('multi-count')).toHaveText('3개 선택');
  // 삭제: 선택한 3개(복제본)가 지워진다
  await page.getByTestId('multi-delete').click();
  await expect.poll(async () => (await objs(page)).length).toBe(3);
  await expect(page.getByTestId('multi-bar')).toHaveCount(0);
  // Delete 키로도 다중 삭제
  await shapes.nth(0).click();
  await shapes.nth(1).click({ modifiers: ['Shift'] });
  await page.keyboard.press('Delete');
  await expect.poll(async () => (await objs(page)).length).toBe(1);
});
