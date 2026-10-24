// 치수 없는 사인물 (2026-10-24 사용자: "사인물 사이즈없으면 선택시 속성에 최상단 사이즈(에상길이는 회색) 표시하고 강조색으로 아웃라인 표시")
import { expect, test } from '@playwright/test';
import { dragOnPhoto, openOwnedProject, uploadPhoto } from './helpers';

const accent = (p: import('@playwright/test').Page) => p.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim());

test('치수가 없으면 속성 맨 위에 치수 칸 + 강조색 테두리, 예상 길이는 회색 — 넣으면 테두리가 사라진다', async ({ page, request }) => {
  await openOwnedProject(page, request, '치수 먼저');
  await uploadPhoto(page);
  await page.keyboard.press('t');
  await dragOnPhoto(page, [300, 200], [700, 300]);
  const panel = page.getByTestId('object-panel');
  const size = panel.getByTestId('panel-size');
  // 분류 고르기 전에도, 분류 칸보다 위
  await expect(size).toBeVisible();
  const order = await panel.evaluate((el) => [...el.querySelectorAll('[data-testid="panel-size"], [data-testid="category-select"]')].map((e) => e.getAttribute('data-testid')));
  expect(order).toEqual(['panel-size', 'category-select']);
  await expect(size).toHaveAttribute('data-need', '1');
  const [oc, ac] = await Promise.all([size.evaluate((e) => getComputedStyle(e).outlineColor), accent(page)]);
  expect(oc).not.toBe('rgba(0, 0, 0, 0)');
  expect(ac).toBeTruthy();
  // 넣는 동안 자리는 그대로(입력 중 칸이 움직이지 않게), 둘 다 넣으면 테두리 없음
  await panel.getByTestId('panel-width').fill('3000');
  await panel.getByTestId('panel-height').fill('600');
  await expect(size).not.toHaveAttribute('data-need', '1');
  await expect(panel.getByTestId('panel-height')).toBeFocused();
});

test('실측 없는 사인물은 사진 위 외곽선 왼쪽 위에 빨간 점 — 예상만 있어도 점, 치수를 넣으면 사라진다 (2026-10-24 "실측 없으면 사인물 왼쪽상단에 빨강 인디케이터 점")', async ({ page, request }) => {
  await openOwnedProject(page, request, '빨간 점');
  await uploadPhoto(page);
  const [a, b] = await page.evaluate(() => {
    const app = (window as unknown as { __ganpanda: { photos: { id: string }[]; project: { addObject(o: unknown): string } } }).__ganpanda;
    const a = app.project.addObject({ photoId: app.photos[0].id, name: '기준', shape: 'rect', quad: [[100, 100], [500, 100], [500, 200], [100, 200]], sheetIds: [], widthMm: 4000, heightMm: 1000 });
    const b = app.project.addObject({ photoId: app.photos[0].id, name: '모름', shape: 'rect', quad: [[600, 100], [800, 100], [800, 200], [600, 200]], sheetIds: [] });
    return [a, b];
  });
  const dots = page.getByTestId('sign-unmeasured');
  await expect(dots).toHaveCount(1); // 예상(≈)만 있는 '모름' 에만
  await expect(dots).toHaveAttribute('data-id', b);
  const fill = await dots.evaluate((e) => getComputedStyle(e).fill);
  expect(fill).toBe('rgb(239, 68, 68)');
  // 점 = 외곽선 왼쪽 위 꼭짓점
  const [cx, cy] = await dots.evaluate((e) => [Number(e.getAttribute('cx')), Number(e.getAttribute('cy'))]);
  expect([cx, cy]).toEqual([600, 100]);
  await page.evaluate((id) => (window as unknown as { __ganpanda: { project: { updateObject(id: string, p: unknown): void } } }).__ganpanda.project.updateObject(id, { widthMm: 2000, heightMm: 500 }), b);
  await expect(dots).toHaveCount(0);
  expect(a).toBeTruthy();
});

test('예상 길이가 있으면 회색으로 — 같은 사진의 다른 사인물 치수로 추정', async ({ page, request }) => {
  await openOwnedProject(page, request, '예상 길이');
  await uploadPhoto(page);
  const ids = await page.evaluate(() => {
    const app = (window as unknown as { __ganpanda: { photos: { id: string }[]; project: { addObject(o: unknown): string }; selectObject(id: string): void } }).__ganpanda;
    const a = app.project.addObject({ photoId: app.photos[0].id, name: '기준', shape: 'rect', quad: [[100, 100], [500, 100], [500, 200], [100, 200]], sheetIds: [], widthMm: 4000, heightMm: 1000 });
    const b = app.project.addObject({ photoId: app.photos[0].id, name: '모름', shape: 'rect', quad: [[600, 100], [800, 100], [800, 200], [600, 200]], sheetIds: [] });
    app.selectObject(b);
    return [a, b];
  });
  expect(ids.length).toBe(2);
  const panel = page.getByTestId('object-panel');
  const est = panel.getByTestId('size-estimate');
  await expect(est).toContainText('예상');
  await expect(est).toContainText('2,000');
  const color = await est.evaluate((e) => getComputedStyle(e).color);
  const muted = await page.evaluate(() => { const d = document.createElement('span'); d.style.color = 'var(--muted)'; document.body.append(d); const c = getComputedStyle(d).color; d.remove(); return c; });
  expect(color).toBe(muted);
});

test.describe('휴대폰', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  test('빠른 막대의 [사이즈] 도 치수가 없으면 강조색 테두리', async ({ page, request }) => {
    await openOwnedProject(page, request, '휴대폰 치수');
    await uploadPhoto(page);
    await page.evaluate(() => {
      const app = (window as unknown as { __ganpanda: { photos: { id: string }[]; project: { addObject(o: unknown): string }; selectObject(id: string): void } }).__ganpanda;
      app.selectObject(app.project.addObject({ photoId: app.photos[0].id, name: '모름', shape: 'rect', quad: [[600, 100], [800, 100], [800, 200], [600, 200]], sheetIds: [] }));
    });
    await expect(page.getByTestId('quick-size')).toHaveAttribute('data-need', '1');
  });
});
