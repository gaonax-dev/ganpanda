// 선택 강조를 모두 진하게 (2026-10-22 사용자: "사진보드에서 사인물카드 선택시 사진의 사인물 하일라이팅이 다르다. 모두 진하게 하일라이팅되게 해줘" → "다중선택도 문제가 있다")
import { expect, test } from '@playwright/test';
import { openOwnedProject, uploadPhoto } from './helpers';

test('카드로 고르든 다중 선택이든 — 사진의 그 사인물과 연결 영역이 모두 같은 진한 강조, 다중 선택 카드도 실선', async ({ page, request }) => {
  await openOwnedProject(page, request);
  await uploadPhoto(page);
  const ids = await page.evaluate(() => {
    const a = (window as unknown as { __ganpanda: { photos: { id: string }[]; project: { addObject(o: unknown): string; linkObject(id: string, to: string): void } } }).__ganpanda;
    const pid = a.photos[0].id;
    const A = a.project.addObject({ photoId: pid, name: 'A', shape: 'rect', quad: [[100, 100], [400, 100], [400, 200], [100, 200]], sheetIds: [], widthMm: 3000, heightMm: 1000 });
    const B = a.project.addObject({ photoId: pid, name: 'B', shape: 'rect', quad: [[500, 100], [800, 100], [800, 200], [500, 200]], sheetIds: [], widthMm: 3000, heightMm: 1000 });
    const C = a.project.addObject({ photoId: pid, name: 'C', shape: 'rect', quad: [[100, 400], [400, 400], [400, 500], [100, 500]], sheetIds: [] });
    a.project.linkObject(C, A); // C = A 의 연결 영역
    return { A, B, C };
  });
  const shape = (id: string) => page.locator(`[data-testid="photo-zone"] g.sign:has(> [data-testid="sign-shape"][data-id="${id}"])`);
  const strong = async (id: string) => {
    await expect(shape(id)).toHaveClass(/\bsel\b/);
    expect(await shape(id).locator('[data-testid="sign-shape"]').evaluate((e) => getComputedStyle(e).strokeDasharray)).toBe('none');
  };
  const sel = (id: string, multi = false) => page.evaluate(([i, m]) => { const a = (window as unknown as { __ganpanda: { selectObject(id: string, k: string): void; toggleSelect(id: string, k: string): void } }).__ganpanda; if (m) a.toggleSelect(i as string, 'card'); else a.selectObject(i as string, 'card'); }, [id, multi] as const);
  await sel(ids.A);
  await strong(ids.A);
  await strong(ids.C); // 연결 영역도 같은 진하기
  await expect(shape(ids.B)).not.toHaveClass(/\bsel\b/);
  await sel(ids.B, true); // 다중 선택
  await strong(ids.A);
  await strong(ids.B);
  await strong(ids.C);
  const multiCard = page.locator(`[data-testid="board-card"][data-id="${ids.A}"] .face`);
  expect(await multiCard.evaluate((e) => getComputedStyle(e).outlineStyle)).toBe('solid');
});

test('다중 선택은 도구 막대 [선택] 옆, 켜 두면 중간에 풀리지 않는다 — 손잡이·대화로 고르기·말풍선에도 그대로, 카드와 외곽선은 섞지 않음 (2026-10-22 "다중선택을 선택옆으로 이동해주고 다중선택 중간에 해제되는 경우도 알아봐줘")', async ({ page, request }) => {
  await openOwnedProject(page, request);
  await uploadPhoto(page);
  const ids = await page.evaluate(() => {
    const a = (window as unknown as { __ganpanda: { photos: { id: string }[]; project: { addObject(o: unknown): string } } }).__ganpanda;
    const pid = a.photos[0].id;
    const mk = (n: string, x: number) => a.project.addObject({ photoId: pid, name: n, shape: 'rect', quad: [[x, 100], [x + 200, 100], [x + 200, 200], [x, 200]], sheetIds: [], widthMm: 2000, heightMm: 1000 });
    return { A: mk('A', 100), B: mk('B', 400), C: mk('C', 700) };
  });
  // 도구 막대: [선택] 바로 다음이 [다중]
  const tools = page.locator('.tools button');
  const order = await tools.evaluateAll((bs) => bs.map((b) => (b as HTMLElement).dataset.testid));
  expect(order[order.indexOf('tool-select') + 1]).toBe('tool-multi');
  await page.getByTestId('tool-multi').click(); // 아무것도 안 골라도 켤 수 있다
  await expect(page.getByTestId('tool-multi')).toHaveClass(/on/);
  const count = () => page.evaluate(() => (window as unknown as { __ganpanda: { selectionIds: string[] } }).__ganpanda.selectionIds.length);
  // 사진 외곽선 둘 — 쌓인다. 카드와는 섞지 않는다(2026-10-17 결정 — 카드를 누르면 카드로 새로 시작, 다중 모드는 켠 채)
  await page.locator(`[data-testid="sign-shape"][data-id="${ids.A}"]`).click();
  await page.locator(`[data-testid="sign-shape"][data-id="${ids.B}"]`).click();
  expect(await count()).toBe(2);
  // 다른 길로 골라도(손잡이 잡기·대화 열기 = selectObject) 풀리지 않고 더해진다
  await page.evaluate((id) => (window as unknown as { __ganpanda: { selectObject(id: string): void } }).__ganpanda.selectObject(id), ids.C);
  expect(await count()).toBe(3);
  await page.evaluate((id) => (window as unknown as { __ganpanda: { openChat(id: string): void } }).__ganpanda.openChat(id), ids.A);
  expect(await count()).toBe(3);
  await page.locator(`[data-testid="board-card"][data-id="${ids.A}"]`).click(); // 다른 종류 → 카드로 새로 시작
  expect(await count()).toBe(1);
  await expect(page.getByTestId('tool-multi')).toHaveClass(/on/);
  await page.locator(`[data-testid="board-card"][data-id="${ids.B}"]`).click();
  await page.locator(`[data-testid="board-card"][data-id="${ids.C}"]`).click();
  expect(await count()).toBe(3);
  // 말풍선을 눌러도 선택은 그대로
  await page.evaluate(() => (window as unknown as { __ganpanda: { selectPin(id: string | null): void } }).__ganpanda.selectPin('x'));
  expect(await count()).toBe(3);
  // 빈 곳을 눌러도 그대로, [✕ 선택 해제]·[다중] 끄기로만 끝난다
  await page.getByTestId('tool-multi').click();
  await expect(page.getByTestId('tool-multi')).not.toHaveClass(/on/);
  expect(await count()).toBe(1);
});

// 2026-10-22 사용자: "다중버튼 선택일때만 체크로 켜지고 다른 툴 선택하면 체크해제해줘"
test('[다중]은 선택 도구에서만 켜진다 — 켜면 ✓, 다른 도구를 고르면 꺼지고, 다른 도구 중에 누르면 선택 도구로 바뀌며 켜진다', async ({ page, request }) => {
  await openOwnedProject(page, request);
  await uploadPhoto(page);
  const multi = page.getByTestId('tool-multi');
  await multi.click();
  await expect(multi).toHaveClass(/on/);
  await expect(multi).toContainText('✓');
  await page.getByTestId('tool-rect').click();
  await expect(multi).not.toHaveClass(/on/);
  await expect(multi).not.toContainText('✓');
  await expect.poll(() => page.evaluate(() => (window as unknown as { __ganpanda: { multiMode: boolean } }).__ganpanda.multiMode)).toBe(false);
  await multi.click();
  await expect(multi).toHaveClass(/on/);
  await expect(page.getByTestId('tool-select')).toHaveClass(/on/);
  await page.keyboard.press('o'); // 타원 단축키도 같다
  await expect(multi).not.toHaveClass(/on/);
});

// 2026-10-22 사용자: "선택에서 데스크탑의 시프트가 눌리면 다중 켜지고 시프트 때면 다중 꺼지게 버튼을 눌렀을때는 그 상태로"
test('선택 도구에서 Shift 를 누르는 동안만 [다중]이 켜지고(고른 것은 떼도 남는다), 단추로 켠 다중은 Shift 를 떼도 그대로', async ({ page, request }) => {
  await openOwnedProject(page, request);
  await uploadPhoto(page);
  const multi = page.getByTestId('tool-multi');
  const mode = () => page.evaluate(() => (window as unknown as { __ganpanda: { multiMode: boolean } }).__ganpanda.multiMode);
  await page.keyboard.down('Shift');
  await expect(multi).toHaveClass(/on/);
  await page.keyboard.up('Shift');
  await expect(multi).not.toHaveClass(/on/);
  expect(await mode()).toBe(false);
  // 단추로 켜면 Shift 를 눌렀다 떼도 그대로
  await multi.click();
  await page.keyboard.down('Shift');
  await page.keyboard.up('Shift');
  await expect(multi).toHaveClass(/on/);
  await multi.click();
  // 다른 도구에서는 Shift 로 켜지지 않는다, 입력 칸에서도
  await page.getByTestId('tool-rect').click();
  await page.keyboard.down('Shift');
  await expect(multi).not.toHaveClass(/on/);
  await page.keyboard.up('Shift');
});
