// 고객 컨펌 기준선 · 변경안 (2026-11-05 사용자: "견적은 현장인원이나 사장이 내지만 디자이너가 고객과 소통하면서 변경을 할 때도 있어 고객이 컨펌한 내역으로 진행하는게 깔끔한데
// 변경사항을 같이 공유하면 좋겠다. 결국 내부의 결정보다 고객의 결정이 우선해")
/* eslint-disable @typescript-eslint/no-explicit-any */
import { expect, test } from '@playwright/test';
import { openOwnedProject, uploadPhoto } from './helpers';

test('발행(컨펌 기준) 뒤 재료 층만 바꿔도 "발행 뒤 바뀜" — 그 사인물 카드에 변경안 표시, 출력 창에 경고, 다시 발행하면 사라진다', async ({ page, request }) => {
  await openOwnedProject(page, request);
  await uploadPhoto(page);
  const id = await page.evaluate(() => {
    const g = (window as any).__ganpanda; const pid = g.photos[0].id;
    return g.project.addObject({ photoId: pid, name: '정면 채널', shape: 'rect', quad: [[200, 100], [800, 100], [800, 300], [200, 300]], sheetIds: [], productId: 'board-galva', widthMm: 3000, heightMm: 600,
      parts: [{ id: 'c1', kind: 'channel', type: 'ch-front', items: [{ id: 't', kind: 'text', text: '카페', x: 0, y: 0, h: 400 }], stack: [{ id: 'l1', material: 'galva', thickness: 1.2 }] }] });
  });
  await page.evaluate(() => (window as any).__ganpanda.issueQuote('iss-1'));
  await expect.poll(() => page.evaluate(() => (window as any).__ganpanda.issueChanged)).toBe(false);
  const card = page.locator(`[data-testid="board-card"][data-id="${id}"]`);
  await expect(card.getByTestId('card-change')).toHaveCount(0);
  // 디자이너가 재료 층 두께만 바꿈 (금액·크기 그대로)
  await page.evaluate((id) => { const g = (window as any).__ganpanda; const o = g.project.object(id); g.project.updateObject(id, { parts: o.parts.map((p: any) => ({ ...p, stack: [{ id: 'l1', material: 'galva', thickness: 2 }] })) }); }, id);
  await expect.poll(() => page.evaluate(() => (window as any).__ganpanda.issueChanged)).toBe(true);
  await expect(card.getByTestId('card-change')).toBeVisible();
  // 출력 창 경고
  await page.getByTestId('view-design').click();
  await page.getByTestId('design-bar').getByTestId('design-sync-open').click();
  await expect(page.getByTestId('unconfirmed-warning').first()).toContainText('1');
  await page.getByTestId('design-sync-close').click();
  // 견적 탭 바뀐 내용에 "구성"
  await page.getByTestId('view-list').click();
  await page.getByTestId('issue-diff-toggle').click();
  await expect(page.getByTestId('issue-banner')).toBeVisible();
  await expect(page.locator('body')).toContainText('구성');
  // 다시 발행하면 기준이 새로 — 표시가 사라진다
  await page.evaluate(() => (window as any).__ganpanda.issueQuote('iss-2'));
  await page.getByTestId('view-board').click();
  await expect(card.getByTestId('card-change')).toHaveCount(0);
});

test('예전 발행본(구성 지문 없음)은 구성만 바꿔도 바뀜으로 보지 않는다 — 업데이트 뒤 갑자기 "발행 뒤 바뀜"이 뜨지 않게', async ({ page, request }) => {
  await openOwnedProject(page, request);
  await uploadPhoto(page);
  const id = await page.evaluate(() => {
    const g = (window as any).__ganpanda; const pid = g.photos[0].id;
    return g.project.addObject({ photoId: pid, name: '정면 채널', shape: 'rect', quad: [[200, 100], [800, 100], [800, 300], [200, 300]], sheetIds: [], productId: 'board-galva', widthMm: 3000, heightMm: 600,
      parts: [{ id: 'c1', kind: 'channel', type: 'ch-front', items: [], stack: [{ id: 'l1', material: 'galva', thickness: 1.2 }] }] });
  });
  await page.evaluate(() => { const g = (window as any).__ganpanda; const q = g.issueQuote('old'); const { ph, ...old } = q; g.updateSettings({ issues: [{ ...old, snapshot: { ...old.snapshot, items: old.snapshot.items.map(({ parts, ...i }: any) => i) } }] }); });
  await page.evaluate((id) => { const g = (window as any).__ganpanda; const o = g.project.object(id); g.project.updateObject(id, { parts: o.parts.map((p: any) => ({ ...p, stack: [{ id: 'l1', material: 'galva', thickness: 2 }] })) }); }, id);
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => (window as any).__ganpanda.issueChanged)).toBe(false);
});
