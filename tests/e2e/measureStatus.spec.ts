// 홈 카드 실측 상태 (2026-10-21 "사인물 사이즈가 입력되면 실측중으로 변경하고 미측정/전체사인물수를 표시 … 미측정 없으면 실측완료 사인물수")
import { expect, test, type Page } from '@playwright/test';
import { dragOnPhoto, openObjectSettings, openOwnedProject, uploadPhoto } from './helpers';

async function measureSelected(page: Page, w: string, h: string) {
  await openObjectSettings(page);
  await page.getByTestId('width-mm').fill(w);
  await page.getByTestId('height-mm').fill(h);
  await page.getByTestId('close-object-settings').click();
}
const card = (page: Page) => page.getByTestId('project-item').first();

test('치수를 넣으면 카드가 "실측중 · 미측정 u/N", 다 넣으면 "실측완료 N"', async ({ page, request }) => {
  const { session, projectId } = await openOwnedProject(page, request, '실측 매장');
  /** 저장된 사인물 수·미측정 수 (앱이 1초 뒤 저장) */
  const saved = async () => { const r = await request.get('http://localhost:8787/api/projects', { headers: { authorization: `Bearer ${session}` } }); const p = (await r.json()).projects.find((x: { id: string }) => x.id === projectId); return [p.signTotal, p.signUnmeasured]; };
  await uploadPhoto(page);
  await page.keyboard.press('t'); await dragOnPhoto(page, [300, 200], [700, 300]);
  await page.keyboard.press('t'); await dragOnPhoto(page, [900, 200], [1300, 300]);
  await expect.poll(saved, { timeout: 8000 }).toEqual([2, 2]);
  const goHome = async () => { await page.goto('/'); await page.evaluate((s) => localStorage.setItem('ganpanda.session', s), session); await page.reload(); await expect(page.getByTestId('project-list')).toBeVisible(); };
  await goHome();
  await expect(card(page)).toContainText('대기 · 사인물 2');
  await expect(card(page)).toHaveAttribute('data-measure', 'waiting');

  // 하나 실측
  await card(page).click();
  await page.getByTestId('sign-shape').first().click();
  await measureSelected(page, '4000', '1000');
  await expect.poll(saved, { timeout: 8000 }).toEqual([2, 1]);
  await goHome();
  await expect(card(page)).toContainText('실측중 · 미측정 1/2');
  await expect(card(page)).toHaveAttribute('data-measure', 'measuring');

  // 나머지도
  await card(page).click();
  await page.getByTestId('sign-shape').nth(1).click();
  await measureSelected(page, '3000', '600');
  await expect.poll(saved, { timeout: 8000 }).toEqual([2, 0]);
  await goHome();
  await expect(card(page)).toContainText('실측완료 2');
  await expect(card(page)).toHaveAttribute('data-measure', 'measured');
});
