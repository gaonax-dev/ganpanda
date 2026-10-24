// 쓰던 단가표를 AI 로 읽어 내 단가표에 (2026-10-24 "기존에 사용하던 단가를 입력받으면 ai로 이것을 우리의 단가표에 넣어야한다" → 엑셀·사진·PDF·글, Claude API — 로컬은 fake: 항목 이름이 든 줄의 숫자)
import { expect, test } from '@playwright/test';
import writeXlsxFile from 'write-excel-file/node';
import { openOwnedProject, SERVER } from './helpers';

test('글 붙여넣기 → [AI로 읽기] → 확인 표(지금·읽은 단가·원문, 고칠 수 있음) → [적용] = 이 견적 + 내 단가표, 못 찾은 줄은 따로', async ({ page, request }) => {
  const { session } = await openOwnedProject(page, request);
  await page.evaluate(() => { (window as unknown as { __ganpanda: { pricesOpen: boolean } }).__ganpanda.pricesOpen = true; });
  const sec = page.getByTestId('prices-import');
  await sec.getByTestId('import-text').fill('갈바\t65,000\n후렉스\t230000\n출장 견적비\t30000');
  await sec.getByTestId('import-run').click();
  const galva = sec.locator('[data-testid="import-row"][data-id="board-galva"]');
  await expect(galva).toBeVisible({ timeout: 15_000 });
  await expect(galva.getByTestId('import-price')).toHaveValue('65000');
  await expect(sec.getByTestId('import-unmatched')).toContainText('출장 견적비');
  await sec.locator('[data-testid="import-row"][data-id="board-flex"]').getByTestId('import-price').fill('240000'); // 확인하며 고친다
  await expect(sec.getByTestId('import-save-account')).toBeChecked();
  await sec.getByTestId('import-apply').click();
  await expect(sec.getByTestId('import-done')).toContainText('2개');
  await expect(page.getByTestId('price-board-galva')).toHaveValue('65000');
  await expect(page.getByTestId('price-board-flex')).toHaveValue('240000');
  const mine = await (await request.get(`${SERVER}/api/me/prices`, { headers: { authorization: `Bearer ${session}` } })).json();
  expect(mine.prices.products['board-galva']).toBe(65000);
});

test('엑셀 파일을 고르면 앱이 글로 바꿔 읽는다', async ({ page, request }) => {
  await openOwnedProject(page, request);
  await page.evaluate(() => { (window as unknown as { __ganpanda: { pricesOpen: boolean } }).__ganpanda.pricesOpen = true; });
  const sec = page.getByTestId('prices-import');
  const buffer = await writeXlsxFile([[{ value: '품목' }, { value: '단가' }], [{ value: '갈바 간판' }, { value: 71000 }]]).toBuffer();
  await sec.getByTestId('import-file').setInputFiles({ name: '단가표.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer });
  await sec.getByTestId('import-run').click();
  await expect(sec.locator('[data-testid="import-row"][data-id="board-galva"]').getByTestId('import-price')).toHaveValue('71000', { timeout: 15_000 });
});
