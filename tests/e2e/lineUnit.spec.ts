// 견적 줄에서 단가를 바로 입력 → 이 줄만 / 이 견적 전체 / 내 단가표까지 (2026-10-24 사용자: "실제로는 단가을 사장이 바로 입력할 수 있어야한다 … 단가를 바로 변경할 수도 있고 해당 내역을 전체에 적용할 수도 있어야한다")
import { expect, test } from '@playwright/test';
import { openOwnedProject, uploadPhoto, SERVER } from './helpers';

test('줄의 단가 칸에 넣으면 그 줄만 수량 × 단가, [이 견적 전체]면 같은 품목 줄 모두, [내 단가표까지]면 계정 기본 단가에도', async ({ page, request }) => {
  const { session } = await openOwnedProject(page, request);
  await uploadPhoto(page);
  const [a, b] = await page.evaluate(() => {
    const g = (window as unknown as { __ganpanda: { photos: { id: string }[]; project: { addObject(o: unknown): string } } }).__ganpanda;
    const mk = (n: string, x: number, w: number, h: number) => g.project.addObject({ photoId: g.photos[0].id, name: n, shape: 'rect', quad: [[x, 100], [x + 300, 100], [x + 300, 200], [x, 200]], sheetIds: [], productId: 'board-galva', widthMm: w, heightMm: h });
    return [mk('A', 100, 3000, 600), mk('B', 600, 2000, 500)];
  });
  await page.getByTestId('view-list').click();
  const line = (id: string) => page.locator(`[data-testid="quote-line"][data-key="${id}:body"]`);
  const unit = (id: string) => page.locator(`[data-testid="line-unit-row"][data-key="${id}:body"]`);
  await expect(unit(a)).toContainText('1.8㎡');
  // 이 줄만
  await unit(a).getByTestId('line-unit').fill('50000');
  await unit(a).getByTestId('line-unit').press('Enter');
  await expect(line(a).getByTestId('line-amount')).toHaveValue('90000');
  await expect(line(b).getByTestId('line-amount')).toHaveValue(''); // 새 프로젝트는 수동 — B 는 아직 입력 전
  await expect(unit(a).getByTestId('line-unit-original')).toHaveText(/원래 [\d,]+원/); // 임시 가격 옆에 원래 가격 (2026-10-26)
  // 전체에 적용하는 단추는 늘 확인 창 — 무엇에 적용되는지 (2026-10-26 "항상 확인이 필요한건 전체 적용된다는 표시")
  const msgs: string[] = [];
  let answer = false;
  page.on('dialog', (d) => { msgs.push(d.message()); void (answer ? d.accept() : d.dismiss()); });
  await unit(a).getByTestId('line-unit-apply').click();
  await expect.poll(() => msgs.length).toBe(1);
  expect(msgs[0]).toContain('이 견적 전체 적용');
  await expect(line(b).getByTestId('line-amount')).toHaveValue(''); // 취소하면 그대로
  answer = true;
  // 이 견적 전체: 같은 품목(갈바) 줄 모두 50,000원/㎡
  await unit(a).getByTestId('line-unit-apply').click();
  await expect(line(b).getByTestId('line-amount')).toHaveValue('50000'); // 1.0㎡ × 50,000
  await expect(unit(a).getByTestId('line-unit')).toHaveValue('50000');
  await expect(unit(a).getByTestId('line-unit-apply')).toHaveCount(0); // 이제 단가표 단가
  // 다시 한 줄만 바꾸고 [내 단가표까지]
  await unit(b).getByTestId('line-unit').fill('60000');
  await unit(b).getByTestId('line-unit').press('Enter');
  await unit(b).getByTestId('line-unit-account').click();
  await expect(unit(b).getByTestId('line-unit-saved')).toBeVisible();
  expect(msgs.at(-1)).toContain('전체 적용');
  expect(msgs.at(-1)).toContain('발행한 견적은 그대로');
  const mine = await (await request.get(`${SERVER}/api/me/prices`, { headers: { authorization: `Bearer ${session}` } })).json();
  expect(mine.prices.products['board-galva']).toBe(60000);
  await expect(line(a).getByTestId('line-amount')).toHaveValue('108000'); // 1.8㎡ × 60,000 — 이 견적에도
});
