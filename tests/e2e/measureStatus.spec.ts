// 홈 카드 실측 상태 (2026-10-21 "사인물 사이즈가 입력되면 실측중으로 변경하고 미측정/전체사인물수를 표시 … 미측정 없으면 실측완료 사인물수" → "실측 안내 없이 숫자만")
import { expect, test, type Page } from '@playwright/test';
import { dragOnPhoto, openObjectSettings, openOwnedProject, uploadPhoto, openDesignSync } from './helpers';

async function measureSelected(page: Page, w: string, h: string) {
  await openObjectSettings(page);
  await page.getByTestId('width-mm').fill(w);
  await page.getByTestId('height-mm').fill(h);
  await page.getByTestId('close-object-settings').click();
}
const card = (page: Page) => page.getByTestId('project-item').first();

test('치수를 넣으면 카드 숫자가 미측정/전체(u/N), 다 넣으면 전체 수만(N) — 글자 없이 숫자만', async ({ page, request }) => {
  const { session, projectId } = await openOwnedProject(page, request, '실측 매장');
  /** 저장된 사인물 수·미측정 수 (앱이 1초 뒤 저장) */
  const saved = async () => { const r = await request.get('http://localhost:8787/api/projects', { headers: { authorization: `Bearer ${session}` } }); const p = (await r.json()).projects.find((x: { id: string }) => x.id === projectId); return [p.signTotal, p.signUnmeasured]; };
  await uploadPhoto(page);
  await page.keyboard.press('t'); await dragOnPhoto(page, [300, 200], [700, 300]);
  await page.keyboard.press('t'); await dragOnPhoto(page, [900, 200], [1300, 300]);
  await expect.poll(saved, { timeout: 8000 }).toEqual([2, 2]);
  const goHome = async () => { await page.goto('/'); await page.evaluate((s) => localStorage.setItem('ganpanda.session', s), session); await page.reload(); await expect(page.getByTestId('project-list')).toBeVisible(); };
  await goHome();
  await expect(card(page).getByTestId('project-count')).toHaveText('2/2');
  await expect(card(page)).toHaveAttribute('data-measure', 'waiting');
  await expect(card(page).getByTestId('project-meta')).not.toContainText('실측'); // 숫자만 (이름에는 있을 수 있다)

  // 하나 실측
  await card(page).click();
  await page.getByTestId('sign-shape').first().click();
  await measureSelected(page, '4000', '1000');
  await expect.poll(saved, { timeout: 8000 }).toEqual([2, 1]);
  await goHome();
  await expect(card(page).getByTestId('project-count')).toHaveText('1/2');
  await expect(card(page)).toHaveAttribute('data-measure', 'measuring');

  // 나머지도
  await card(page).click();
  await page.getByTestId('sign-shape').nth(1).click();
  await measureSelected(page, '3000', '600');
  await expect.poll(saved, { timeout: 8000 }).toEqual([2, 0]);
  await goHome();
  await expect(card(page).getByTestId('project-count')).toHaveText('2');
  await expect(card(page)).toHaveAttribute('data-measure', 'measured');
});

test('디자인을 일러스트로 내보내면 사인물 카드에 #번호 배지, 홈 프로젝트 카드에 "디자인 진행 받음/보냄" → 다 받으면 "디자인 완료" (2026-11-06)', async ({ page, request }) => {
  // 사용자: "디지인 내보내면 번호생성하고 배지로 사인물카드에 작게넣어줘 이걸로 상태를 디자인 진행으로 표시할 수 있다" → "상태 표시는 홈의 프로젝트 카드를 말한거야"
  const { session, projectId } = await openOwnedProject(page, request, '디자인 매장');
  const saved = async () => { const r = await request.get('http://localhost:8787/api/projects', { headers: { authorization: `Bearer ${session}` } }); const p = (await r.json()).projects.find((x: { id: string }) => x.id === projectId); return [p.signDesign, p.signDesigned]; };
  await uploadPhoto(page);
  const ids = await page.evaluate(() => {
    const g = (window as any).__ganpanda; const pid = g.photos[0].id; // eslint-disable-line @typescript-eslint/no-explicit-any
    return [g.project.addObject({ photoId: pid, name: '정면', shape: 'rect', quad: [[200, 100], [800, 100], [800, 300], [200, 300]], sheetIds: [], widthMm: 3000, heightMm: 600 }),
      g.project.addObject({ photoId: pid, name: '돌출', shape: 'rect', quad: [[900, 100], [1000, 100], [1000, 300], [900, 300]], sheetIds: [], widthMm: 600, heightMm: 900 })];
  });
  await expect(page.getByTestId('card-artno')).toHaveCount(0);
  await openDesignSync(page, 'illustrator');
  await page.getByTestId('illustrator-download').click();
  await expect(page.locator(`[data-testid="board-card"][data-id="${ids[1]}"] [data-testid="card-artno"]`)).toHaveText('#2');
  await expect.poll(saved, { timeout: 8000 }).toEqual([2, 0]);
  const goHome = async () => { await page.goto('/'); await page.evaluate((s) => localStorage.setItem('ganpanda.session', s), session); await page.reload(); await expect(page.getByTestId('project-list')).toBeVisible(); };
  await goHome();
  await expect(card(page).getByTestId('project-design')).toHaveText('디자인 진행 0/2');
  await expect(card(page).getByTestId('project-design')).toHaveAttribute('data-kind', 'designing');
  // 디자인을 받으면 (여기서는 바로 입힘)
  await card(page).click();
  await expect(page.getByTestId('card-artno').first()).toBeVisible();
  await page.evaluate((ids) => { const g = (window as any).__ganpanda; for (const id of ids) g.project.updateObject(id, { design: { sourceId: 's', page: 0, crop: { x: 0, y: 0, w: 1, h: 1 } } }); }, ids); // eslint-disable-line @typescript-eslint/no-explicit-any
  await expect.poll(saved, { timeout: 8000 }).toEqual([2, 2]);
  await goHome();
  await expect(card(page).getByTestId('project-design')).toHaveText('디자인 완료 2');
});
