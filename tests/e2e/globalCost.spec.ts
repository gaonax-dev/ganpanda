// 원가 배수 = 전체 적용 · 발행 견적 박제 (2026-10-26 사용자: "견적의 원가 배수도 바로바로 수정 가능해야하는데 중요한건 해당일 이후부터 적용 …
// 견적이 발행되면 관계데이터가 아니라 박제", "원가는 전체 변경이다. 항상 대화창으로 확인", "견적을 발행하고 다시 호출할땐 그간 원가 견적 금액이 변경되어도 이전에 발행 상태로")
import { expect, test } from '@playwright/test';
import { openOwnedProject, uploadPhoto } from './helpers';

type G = { __ganpanda: { photos: { id: string }[]; project: { addObject(o: unknown): string }; autoAllLines(): void } };

test('원가 배수는 단가 설정 [자재 원가]에서만 — 바꾸면 확인 창(전체 적용) — 발행 전 견적은 바로 바뀌고, 발행한 견적은 발행 당시 원가 그대로, [현재 원가로 다시 계산]해야 바뀜', async ({ page, request }) => {
  await openOwnedProject(page, request);
  await uploadPhoto(page);
  const id = await page.evaluate(() => { const g = (window as unknown as G).__ganpanda; return g.project.addObject({ photoId: g.photos[0].id, name: '판', shape: 'rect', quad: [[100, 100], [700, 100], [700, 400], [100, 400]], sheetIds: [], productId: 'board-acp', widthMm: 2000, heightMm: 1000 }); });
  await page.getByTestId('view-list').click();
  // 알루미늄 복합판 ㎡ ← 한울 솔벤 백색시트 7,500 (배수 ×1)
  await page.getByTestId('open-prices').click();
  await page.getByTestId('price-link-board-acp').selectOption('hanwool:hanwool.solvent.백색시트');
  await page.getByTestId('close-prices').click();
  await page.evaluate(() => (window as unknown as G).__ganpanda.autoAllLines());
  const amount = page.locator(`[data-testid="quote-line"][data-key="${id}:body"]`).getByTestId('line-amount');
  const value = async () => Number((await amount.inputValue()) || (await amount.getAttribute('placeholder')) || 0);
  const v1 = await value();
  expect(v1).toBeGreaterThan(0);

  const msgs: string[] = [];
  let answer = false;
  page.on('dialog', (d) => { msgs.push(d.message()); void (answer ? d.accept() : d.dismiss()); });
  // 견적 합계 칸에는 원가 배수가 없다 (2026-10-26 "공급가 합계의 원가배수는 제거해줘 여기에서 한번에 변경하면 안된다")
  await expect(page.getByTestId('quote-markup')).toHaveCount(0);
  const markup = page.getByTestId('markup-all');
  const openCost = async () => { await page.getByTestId('open-prices').click(); await page.getByTestId('prices-tab-cost').click(); };
  const closeCost = () => page.getByTestId('close-prices').click();
  await openCost();
  await expect(markup).toHaveValue('1');
  // 취소하면 그대로
  await markup.fill('2'); await markup.press('Enter');
  await expect.poll(() => msgs.length).toBe(1);
  expect(msgs[0]).toContain('전체 적용');
  await expect(markup).toHaveValue('1');
  expect(await value()).toBe(v1);
  // 확인 → 발행 전 견적은 바로 ×2
  answer = true;
  await markup.fill('2'); await markup.press('Enter');
  await closeCost();
  await expect.poll(value).toBe(v1 * 2);

  // 발행 → 박제
  await page.getByTestId('proposal-button').click();
  await page.getByTestId('proposal-build').click();
  await expect(page.getByTestId('proposal-link')).toHaveValue(/\/p\//);
  await page.getByTestId('close-proposal').click();
  await expect(page.getByTestId('issue-banner')).toHaveAttribute('data-changed', 'false');
  // 원가 배수 ×3 → 발행한 견적은 그대로, "원가가 바뀌었습니다"
  await openCost();
  await markup.fill('3'); await markup.press('Enter');
  await expect.poll(() => msgs.length).toBe(3);
  await closeCost();
  await expect(page.getByTestId('issue-cost-outdated')).toBeVisible();
  expect(await value()).toBe(v1 * 2);
  await expect(page.getByTestId('issue-banner')).toHaveAttribute('data-changed', 'false');
  // 다시 열어도 발행 상태
  await page.reload();
  await page.getByTestId('view-list').click();
  await expect.poll(value).toBe(v1 * 2);
  await expect(page.getByTestId('issue-banner')).toHaveAttribute('data-changed', 'false');
  // 현재 원가로 다시 계산 → 변경 견적 (다시 발행해야 고객에게)
  await page.getByTestId('issue-recalc').click();
  await expect.poll(value).toBe(v1 * 3);
  await expect(page.getByTestId('issue-banner')).toHaveAttribute('data-changed', 'true');
});
