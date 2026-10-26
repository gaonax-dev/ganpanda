// 견적 줄 원가 수정 (2026-10-26 사용자: "견적 아이템 아래의 내용은 현재 길이를 제거한다. 그리고 아이템라벨을 클리기하면 원가수정 버튼나오게 하고 수정후 적용(이후 모든 견적에 적용됩니다.)")
// — 전엔 줄마다 아래에 [수량 × 단가 · 이 줄만 · 이 견적 전체 · 내 단가표까지] 줄이 늘 있었다 (2026-10-24 "단가을 사장이 바로 입력")
import { expect, test } from '@playwright/test';
import { openOwnedProject, uploadPhoto, SERVER } from './helpers';

test('견적 줄 아래 단가 줄은 없다 — 항목 이름을 누르면 [원가 수정], 고쳐 [적용]하면 확인 창(이후 모든 견적) 뒤 내 단가표와 이 견적에, [이 줄만]은 임시 가격(원래 가격 표시)', async ({ page, request }) => {
  const { session } = await openOwnedProject(page, request);
  await uploadPhoto(page);
  const [a, b] = await page.evaluate(() => {
    const g = (window as unknown as { __ganpanda: { photos: { id: string }[]; project: { addObject(o: unknown): string } } }).__ganpanda;
    const mk = (n: string, x: number, w: number, h: number) => g.project.addObject({ photoId: g.photos[0].id, name: n, shape: 'rect', quad: [[x, 100], [x + 300, 100], [x + 300, 200], [x, 200]], sheetIds: [], productId: 'board-galva', widthMm: w, heightMm: h });
    return [mk('A', 100, 3000, 600), mk('B', 600, 2000, 500)];
  });
  await page.getByTestId('view-list').click();
  const line = (id: string) => page.locator(`[data-testid="quote-line"][data-key="${id}:body"]`);
  const edit = (id: string) => page.locator(`[data-testid="line-cost-editor"][data-key="${id}:body"]`);
  await expect(page.getByTestId('line-unit-row')).toHaveCount(0); // 줄 아래 단가 줄 없음
  await expect(page.getByTestId('line-cost-edit')).toHaveCount(0);
  // 이름을 누르면 [원가 수정]
  await line(a).getByTestId('line-open').click();
  await line(a).getByTestId('line-cost-edit').click();
  await expect(edit(a)).toContainText('1.8㎡');
  await expect(edit(a)).toContainText('이후 모든 견적에 적용됩니다');
  // 이 줄만(임시) — 원래 가격이 따로 보인다
  await edit(a).getByTestId('line-unit').fill('50000');
  await edit(a).getByTestId('line-unit-only').click();
  await expect(line(a).getByTestId('line-amount')).toHaveValue('90000');
  await expect(line(a).getByTestId('line-unit-original')).toHaveText(/이 줄만 · 원래 [\d,]+원/);
  await expect(line(b).getByTestId('line-amount')).toHaveValue(''); // 새 프로젝트는 수동 — B 는 아직 입력 전
  // 적용(이후 모든 견적) — 확인 창, 취소하면 그대로
  const msgs: string[] = [];
  let answer = false;
  page.on('dialog', (d) => { msgs.push(d.message()); void (answer ? d.accept() : d.dismiss()); });
  await line(b).getByTestId('line-open').click();
  await line(b).getByTestId('line-cost-edit').click();
  await edit(b).getByTestId('line-unit').fill('60000');
  await edit(b).getByTestId('line-unit-apply').click();
  await expect.poll(() => msgs.length).toBe(1);
  expect(msgs[0]).toContain('이후 모든 견적에 적용됩니다');
  expect(msgs[0]).toContain('발행한 견적은 그대로');
  const mine = await (await request.get(`${SERVER}/api/me/prices`, { headers: { authorization: `Bearer ${session}` } })).json();
  expect(mine.prices?.products?.['board-galva'] ?? null).not.toBe(60000);
  answer = true;
  await edit(b).getByTestId('line-unit-apply').click();
  await expect(edit(b)).toHaveCount(0); // 적용하면 닫힘
  await expect.poll(async () => (await (await request.get(`${SERVER}/api/me/prices`, { headers: { authorization: `Bearer ${session}` } })).json()).prices.products['board-galva']).toBe(60000);
  await expect(line(b).getByTestId('line-amount')).toHaveValue('60000'); // 1.0㎡ × 60,000
  await expect(line(a).getByTestId('line-amount')).toHaveValue('108000'); // 이 줄만 단가도 풀리고 새 단가 1.8㎡ × 60,000
  await expect(line(a).getByTestId('line-unit-original')).toHaveCount(0);
});
