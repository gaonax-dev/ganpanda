// 치수 블록 (2026-11-03 시작; 2026-11-04 "블록 치수는 사용자가 입력한 값을 사용하고 추정치는 여기에 없다. 블록은 입력한 값만 나오고 여러 값과 방향을 지원한다.
// 블록이 있으면 사인물들의 예상 크기는 블록이 기준이 된다") — 블록은 사진의 것, 블록마다 입력 치수·축
/* eslint-disable @typescript-eslint/no-explicit-any */
import { expect, test, type Page } from '@playwright/test';
import { clearAutoCamera, dragOnPhoto, openOwnedProject, uploadPhoto } from './helpers';

const est = (page: Page, id: string) => page.evaluate((id) => (window as any).__ganpanda.measures.get(id)?.estimate?.widthMm ?? 0, id);
const sizeW = (page: Page, id: string) => page.evaluate((id) => { const g = (window as any).__ganpanda; return g.sizeOf(g.objects.find((o: any) => o.id === id))?.w ?? 0; }, id);
const photoBlocks = (page: Page, i = 0) => page.evaluate((i) => (window as any).__ganpanda.photos[i].blocks ?? null, i);

test('[블록] 도구는 늘 켜져 있고, 그린 블록은 사진의 것 — 치수 칸이 바로 열리고, 블록에는 입력한 치수만(추정 ≈ 없음). 누르면 사인물과 같은 손잡이, Delete 로 지움', async ({ page, request }) => {
  await openOwnedProject(page, request, '치수 블록');
  await uploadPhoto(page);
  const toolBlock = page.getByTestId('tool-block');
  await expect(toolBlock).toBeEnabled(); // 사인물을 고르지 않아도
  await toolBlock.click();
  await dragOnPhoto(page, [600, 300], [1000, 400]);
  const blocks = page.getByTestId('size-block');
  await expect(blocks).toHaveCount(1);
  expect(await page.evaluate(() => (window as any).__ganpanda.signs.length)).toBe(0); // 사인물이 아니다
  expect((await photoBlocks(page))?.length).toBe(1);
  // 그리자마자 블록이 선택되고 패널 — 치수 입력 전이라 "치수 입력"
  const panel = page.getByTestId('block-panel');
  await expect(panel).toBeVisible();
  await expect(page.getByTestId('block-size')).toHaveText('치수 입력');
  await panel.getByTestId('block-width').fill('4000');
  await panel.getByTestId('block-height').fill('1000');
  await expect(page.getByTestId('block-size')).toHaveText('4,000×1,000');
  await expect(page.locator('svg text', { hasText: '≈' })).toHaveCount(0);
  expect((await photoBlocks(page))[0]).toMatchObject({ w: 4000, h: 1000 });
  // 선은 형광 초록(원근과 안 맞음) 또는 보라(맞음)
  expect(['rgb(57, 255, 20)', 'rgb(168, 85, 247)']).toContain(await blocks.first().locator('polygon').evaluate((e) => getComputedStyle(e).stroke));
  // 선택 도구로 돌아가 블록을 고르면 사인물과 같은 손잡이 — 꼭짓점 4·변 4, ✕ 없음
  await page.keyboard.press('Escape'); // 입력 칸에서 나오기
  await page.keyboard.press('Escape'); // 선택 도구
  await expect(toolBlock).not.toHaveClass(/on/);
  await page.evaluate(() => { const g = (window as any).__ganpanda; g.selectBlock(g.photos[0].id, 0); });
  const controls = page.getByTestId('sign-controls');
  await expect(controls).toHaveAttribute('data-block', '0');
  await expect(controls.getByTestId('sign-handle')).toHaveCount(4);
  await expect(controls.locator('[data-testid^="edge-handle-"]')).toHaveCount(4);
  await expect(page.getByTestId('size-block-remove')).toHaveCount(0);
  // 꼭짓점을 끌면 블록이 바뀐다
  const h = controls.getByTestId('sign-handle').nth(2);
  const hb = (await h.boundingBox())!;
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
  await page.mouse.down();
  await page.mouse.move(hb.x + hb.width / 2 + 30, hb.y + hb.height / 2 + 20, { steps: 5 });
  await page.mouse.up();
  expect((await photoBlocks(page))[0].q[2][0]).toBeGreaterThan(1010);
  // Delete 로 지운다
  await page.keyboard.press('Delete');
  await expect(blocks).toHaveCount(0);
});

test('블록이 있으면 사인물들의 예상 크기는 블록이 기준 — 사인물에 넣은 치수보다 블록, 블록마다 다른 치수·축, 여러 사진에 쓰인 사인물은 블록을 고친 사진을 따른다', async ({ page, request }) => {
  await openOwnedProject(page, request, '블록 기준');
  await uploadPhoto(page);
  await uploadPhoto(page);
  await page.waitForTimeout(1500); // 등록 즉시 자동 원근(AI)을 끝내고 끈다 — 원근 없는 축척(기준 영역)으로 본다
  await clearAutoCamera(page);
  const ids = await page.evaluate(() => {
    const g = (window as any).__ganpanda;
    const [p1, p2] = g.photos.map((p: any) => p.id);
    const a = g.project.addObject({ photoId: p1, name: '실측', shape: 'rect', quad: [[100, 100], [500, 100], [500, 200], [100, 200]], sheetIds: [], widthMm: 4000, heightMm: 1000 });
    const u = g.project.addObject({ photoId: p1, name: '모름', shape: 'rect', quad: [[1200, 100], [1400, 100], [1400, 200], [1200, 200]], sheetIds: [] });
    const u2 = g.project.addObject({ photoId: p2, name: '모름', shape: 'rect', quad: [[1200, 100], [1400, 100], [1400, 200], [1200, 200]], sheetIds: [] });
    g.project.linkObject(u2, u);
    return { p1, p2, a, u, u2 } as Record<string, string>;
  });
  // 블록 없음: 사인물 '실측'(400px = 4000mm) 기준 → '모름' 200px ≈ 2000
  await expect.poll(() => est(page, ids.u)).toBeGreaterThan(1900);
  expect(await est(page, ids.u)).toBeLessThan(2100);
  // 블록(400px = 8000mm)을 넣으면 블록이 기준 → '모름' ≈ 4000 (사인물 '실측'의 치수는 그대로 보이지만 기준이 아니다)
  await page.evaluate((p1) => (window as any).__ganpanda.project.updatePhoto(p1, { blocks: [{ q: [[600, 300], [1000, 300], [1000, 400], [600, 400]], w: 8000, h: 2000 }] }), ids.p1);
  await expect.poll(() => est(page, ids.u)).toBeGreaterThan(3800);
  expect(await est(page, ids.u)).toBeLessThan(4200);
  await expect(page.locator(`g.sign:has(> [data-testid="sign-shape"][data-id="${ids.a}"]) [data-testid="sign-label"]`)).toContainText('4,000×1,000');
  // 블록마다 다른 치수·축: 두 번째 블록(200px = 4000mm, 같은 축척)
  await page.evaluate((p1) => { const g = (window as any).__ganpanda; g.project.updatePhoto(p1, { blocks: [...g.photos[0].blocks, { q: [[600, 500], [800, 500], [800, 600], [600, 600]], w: 4000, h: 2000, axis: 'y' }] }); }, ids.p1);
  await expect(page.getByTestId('size-block')).toHaveCount(2);
  await expect(page.getByTestId('size-block').nth(1).getByTestId('block-size')).toHaveText('4,000×2,000');
  await page.evaluate((p1) => (window as any).__ganpanda.selectBlock(p1, 0), ids.p1);
  await page.getByTestId('block-panel').getByTestId('block-axis-x').click();
  await expect.poll(async () => ((await photoBlocks(page)) as any[]).map((b) => b.axis ?? null)).toEqual(['x', 'y']);
  await page.getByTestId('block-panel').getByTestId('block-axis-y').click();
  // 다른 사진(p2)에 블록(400px = 2000mm)을 넣고 고치면, 두 사진에 쓰인 '모름'의 예상 크기는 p2 기준(200px ≈ 1000)을 따른다 — 사진 1 의 '모름'도
  await page.evaluate((p2) => (window as any).__ganpanda.project.updatePhoto(p2, { blocks: [{ q: [[600, 300], [1000, 300], [1000, 400], [600, 400]] }] }), ids.p2);
  await page.evaluate((p2) => (window as any).__ganpanda.selectBlock(p2, 0), ids.p2);
  await page.getByTestId('block-panel').getByTestId('block-width').fill('2000');
  await page.getByTestId('block-panel').getByTestId('block-height').fill('500');
  await expect.poll(() => sizeW(page, ids.u)).toBeLessThan(1100);
  expect(await sizeW(page, ids.u)).toBeGreaterThan(900);
  expect(await sizeW(page, ids.u2)).toBeGreaterThan(900);
  // 사진 1 의 블록을 다시 고치면 다시 사진 1 기준
  await page.evaluate((p1) => (window as any).__ganpanda.selectBlock(p1, 0), ids.p1);
  await page.getByTestId('block-panel').getByTestId('block-width').fill('8001');
  await expect.poll(() => sizeW(page, ids.u2)).toBeGreaterThan(3800);
  // 휴대폰 폭에서도 블록을 고르면 바로 이 패널
  await page.setViewportSize({ width: 390, height: 800 });
  await expect(page.getByTestId('block-panel')).toBeVisible();
});

test('대각 예측: 블록 꼭짓점에서 대각으로 끌면 모서리를 맞댄 같은 크기·같은 치수 블록 (원근이 있을 때)', async ({ page, request }) => {
  await openOwnedProject(page, request, '대각');
  await uploadPhoto(page);
  await page.evaluate(() => { const g = (window as any).__ganpanda; g.project.updatePhoto(g.photos[0].id, { blocks: [{ q: [[100, 100], [500, 100], [500, 200], [100, 200]], w: 4000, h: 1000 }] }); });
  await page.getByTestId('camera-auto').click(); // 블록으로 원근
  await expect.poll(() => page.evaluate(() => !!(window as any).__ganpanda.photos[0].camera)).toBe(true);
  await expect(page.getByTestId('camera-level')).toHaveAttribute('data-level', '3'); // 치수 블록이 원근을 확인 → 완성
  await page.getByTestId('tool-block').click();
  await dragOnPhoto(page, [502, 202], [700, 280]); // 오른쪽 아래 꼭짓점에서 오른쪽 아래로
  await expect(page.getByTestId('size-block')).toHaveCount(2);
  const b = (await photoBlocks(page))[1];
  expect(b).toMatchObject({ w: 4000, h: 1000 });
  expect(Math.abs(b.q[0][0] - 500)).toBeLessThan(4); expect(Math.abs(b.q[0][1] - 200)).toBeLessThan(4);
  expect(Math.abs(b.q[2][0] - 900)).toBeLessThan(6); expect(Math.abs(b.q[2][1] - 300)).toBeLessThan(6);
});

test('원근이 잡힌 사진에서 조금 비뚤게 그린 블록이 있어도 다른 사인물 추정은 사라지지 않는다 (2026-11-04 "사이즈 나오지 않는다")', async ({ page, request }) => {
  await openOwnedProject(page, request, '비뚤게');
  await uploadPhoto(page);
  const u = await page.evaluate(() => {
    const g = (window as any).__ganpanda, p = g.photos[0].id;
    g.project.updatePhoto(p, { blocks: [{ q: [[100, 100], [500, 100], [500, 200], [100, 200]], w: 4000, h: 1000 }, { q: [[600, 300], [1010, 290], [1000, 420], [590, 400]], w: 4000, h: 1000 }] });
    return g.project.addObject({ photoId: p, name: '모름', shape: 'rect', quad: [[1100, 100], [1400, 100], [1400, 200], [1100, 200]], sheetIds: [] });
  });
  await page.getByTestId('camera-auto').click();
  await expect.poll(() => page.evaluate(() => !!(window as any).__ganpanda.photos[0].camera?.extra)).toBe(true);
  await expect.poll(() => est(page, u)).toBeGreaterThan(2000);
  await expect(page.getByTestId('block-size')).toHaveText(['4,000×1,000', '4,000×1,000']);
});

test('옛 데이터: 사인물에 붙어 있던 블록은 그 사인물 치수의 사진 블록으로 보이고, 고치면 사진으로 옮겨진다', async ({ page, request }) => {
  await openOwnedProject(page, request, '옛 블록');
  await uploadPhoto(page);
  const a = await page.evaluate(() => { const g = (window as any).__ganpanda; return g.project.addObject({ photoId: g.photos[0].id, name: '기준', shape: 'rect', quad: [[100, 100], [500, 100], [500, 200], [100, 200]], sheetIds: [], widthMm: 4000, heightMm: 1000, blocks: [[[600, 300], [1000, 300], [1000, 400], [600, 400]]] }); });
  await expect(page.getByTestId('size-block')).toHaveCount(1);
  await expect(page.getByTestId('block-size')).toHaveText('4,000×1,000');
  await page.evaluate(() => { const g = (window as any).__ganpanda; g.selectBlock(g.photos[0].id, 0); });
  await page.getByTestId('block-panel').getByTestId('block-axis-y').click();
  await expect.poll(async () => (await photoBlocks(page))?.length ?? 0).toBe(1);
  expect(await page.evaluate((a) => (window as any).__ganpanda.project.object(a)?.blocks ?? null, a)).toBeNull();
  expect((await photoBlocks(page))[0]).toMatchObject({ w: 4000, h: 1000, axis: 'y' });
  await expect(page.getByTestId('size-block')).toHaveCount(1);
});
