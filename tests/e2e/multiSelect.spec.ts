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
  // 재질복제 (2026-10-23): 첫째·둘째가 셋째의 종류·옵션을 받는다. 가로·세로·이름은 그대로
  await expect(page.getByTestId('multi-apply')).toHaveText('재질복제');
  await expect(page.getByTestId('multi-clear')).toHaveText('정리');
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
  // 평면도 카드도 Shift+클릭으로 다중 선택 — 단 외곽선과는 섞이지 않는다 (2026-10-17 "정면도와 사인물 외곽라인은 같이 선택할 수 없다. 다른게 선택되면 선택 풀어줘")
  await page.evaluate(() => { const el = document.querySelector('[data-testid="board-canvas"]')!; for (let i = 0; i < 2; i++) el.dispatchEvent(new WheelEvent('wheel', { deltaY: 120, clientX: 700, clientY: 200, bubbles: true, cancelable: true })); });
  const cards = page.getByTestId('board-card');
  await expect(cards).toHaveCount(3);
  await expect(page.locator('[data-testid="board-card"][data-multi]')).toHaveCount(0); // 외곽선 선택 중에는 카드에 다중 표시 없음
  await cards.first().click({ modifiers: ['Shift'] }); // 외곽선 3개 선택 중 카드를 Shift 클릭 → 선택이 풀리고 카드 하나만
  await expect(page.getByTestId('multi-bar')).toHaveCount(0);
  await cards.nth(1).click({ modifiers: ['Shift'] });
  await expect(page.getByTestId('multi-count')).toHaveText('2개 선택');
  // 카드로 고른 선택은 모두 같은(흐린) 표시, 주 선택 강조·매니퓰레이터 없음 (2026-10-18 "모두 두번째 스타일로, 매니퓰레이터는 사인물에서 선택할 때만")
  await expect(page.locator('[data-testid="board-card"][data-multi]')).toHaveCount(2);
  await expect(page.locator('.sign[data-multi]')).toHaveCount(2);
  await expect(page.locator('[data-testid="sign-shape"][data-selected]')).toHaveCount(0);
  await expect(page.getByTestId('gizmo')).toHaveCount(0);
  // 선택한 카드들을 함께 끌면 둘 다 같은 만큼 이동 (2026-10-17 "정면도들을 다중선택하고 이동하게")
  // 자리는 자동 배치(flatPlaced)로 읽는다 — listX 가 없던 카드는 끌 때 비로소 값이 생기므로
  const posOf = async () => page.evaluate((ids) => { const m = (window as unknown as { __ganpanda: { flatPlaced: Map<string, { x: number; y: number }> } }).__ganpanda.flatPlaced; return ids.map((id: string) => ({ id, ...m.get(id)! })); }, ids as string[]);
  const p0 = await posOf();
  const cb = (await cards.nth(1).boundingBox())!;
  await page.mouse.move(cb.x + cb.width / 2, cb.y + cb.height / 2);
  await page.mouse.down();
  await page.mouse.move(cb.x + cb.width / 2 + 80, cb.y + cb.height / 2 + 30, { steps: 4 });
  await page.mouse.up();
  const p1 = await posOf();
  const d0 = { x: p1[0].x - p0[0].x, y: p1[0].y - p0[0].y };
  expect(d0.x).toBeGreaterThan(0);
  expect(p1[1].x - p0[1].x).toBeCloseTo(d0.x, 0);
  expect(p1[1].y - p0[1].y).toBeCloseTo(d0.y, 0);
  expect(p1[2].x).toBeCloseTo(p0[2].x, 0); // 선택 안 된 셋째는 제자리 (끌기 시작 때 자리를 고정 — 따라 밀리지 않는다)
  expect(p1[2].y).toBeCloseTo(p0[2].y, 0);
  await expect(page.getByTestId('multi-count')).toHaveText('2개 선택'); // 끌어도 선택 유지
  // 리스트 뷰에서도 Shift 로 카드 다중 선택·함께 이동
  await page.getByTestId('view-list').click();
  const lcards = page.getByTestId('list-card');
  await expect(lcards).toHaveCount(3);
  await expect(page.locator('[data-testid="list-card"] .face[data-multi]')).toHaveCount(2);
  await lcards.nth(2).locator('.face').click({ modifiers: ['Shift'] });
  await expect(page.locator('[data-testid="list-card"] .face[data-multi]')).toHaveCount(3);
  const q0 = await posOf();
  const lb = (await lcards.nth(0).locator('.face').boundingBox())!;
  await page.mouse.move(lb.x + lb.width / 2, lb.y + lb.height / 2);
  await page.mouse.down();
  await page.mouse.move(lb.x + lb.width / 2 + 60, lb.y + lb.height / 2 + 40, { steps: 4 });
  await page.mouse.up();
  const q1 = await posOf();
  const e0 = { x: q1[0].x - q0[0].x, y: q1[0].y - q0[0].y };
  expect(e0.x).toBeGreaterThan(0);
  for (const i of [1, 2]) { expect(q1[i].x - q0[i].x).toBeCloseTo(e0.x, 0); expect(q1[i].y - q0[i].y).toBeCloseTo(e0.y, 0); }
  await page.getByTestId('view-board').click();
  // 카드 선택 중 외곽선을 Shift 클릭 → 카드 선택이 풀리고 외곽선 하나만. 다시 외곽선 셋을 고른다
  await shapes.nth(0).click({ modifiers: ['Shift'] });
  await expect(page.getByTestId('multi-bar')).toHaveCount(0);
  await shapes.nth(1).click({ modifiers: ['Shift'] });
  await shapes.nth(2).click({ modifiers: ['Shift'] });
  await expect(page.getByTestId('multi-count')).toHaveText('3개 선택');
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
