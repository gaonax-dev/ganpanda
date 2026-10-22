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
