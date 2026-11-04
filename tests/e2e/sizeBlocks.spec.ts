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
  await expect(page.locator(`[data-testid="sign-label"][data-id="${ids.a}"]`)).toContainText('4,000×1,000');
  // 블록마다 다른 치수·축: 두 번째 블록(200px = 4000mm, 같은 축척)
  await page.evaluate((p1) => { const g = (window as any).__ganpanda; g.project.updatePhoto(p1, { blocks: [...g.photos[0].blocks, { q: [[600, 500], [800, 500], [800, 600], [600, 600]], w: 4000, h: 2000, axis: 'y' }] }); }, ids.p1);
  await expect(page.getByTestId('size-block')).toHaveCount(2);
  await expect(page.locator('[data-testid="block-size"][data-index="1"]')).toHaveText('4,000×2,000');
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
  await page.evaluate(() => { const g = (window as any).__ganpanda; g.project.addObject({ photoId: g.photos[0].id, name: '실측', shape: 'rect', quad: [[1100, 600], [1500, 600], [1500, 700], [1100, 700]], sheetIds: [], widthMm: 4000, heightMm: 1000 }); g.project.updatePhoto(g.photos[0].id, { blocks: [{ q: [[100, 100], [500, 100], [500, 200], [100, 200]], w: 4000, h: 1000 }] }); });
  await page.getByTestId('camera-auto').click(); // 원근은 사인물로 (블록은 원근을 따른다)
  await expect.poll(() => page.evaluate(() => !!(window as any).__ganpanda.photos[0].camera)).toBe(true);
  await page.getByTestId('tool-block').click();
  await dragOnPhoto(page, [502, 202], [700, 280]); // 오른쪽 아래 꼭짓점에서 오른쪽 아래로
  await expect(page.getByTestId('size-block')).toHaveCount(2);
  const b = (await photoBlocks(page))[1];
  expect(b).toMatchObject({ w: 4000, h: 1000 });
  expect(Math.abs(b.q[0][0] - 500)).toBeLessThan(4); expect(Math.abs(b.q[0][1] - 200)).toBeLessThan(4);
  expect(Math.abs(b.q[2][0] - 900)).toBeLessThan(6); expect(Math.abs(b.q[2][1] - 300)).toBeLessThan(6);
});

test('원근은 블록에 종속되지 않는다 — 블록을 그리고 고쳐도 원근 그대로, 블록은 원근의 직사각형으로 맞춰지고, 길이만 준 블록으로 축 면에 펼쳐 사인물 길이 (2026-11-04 "원근이 블록에 종속되네 그러면 안됨 … 블록은 길이만 제시한다")', async ({ page, request }) => {
  await openOwnedProject(page, request, '원근 독립');
  await uploadPhoto(page);
  const u = await page.evaluate(() => {
    const g = (window as any).__ganpanda, p = g.photos[0].id;
    g.project.addObject({ photoId: p, name: '실측', shape: 'rect', quad: [[100, 100], [500, 100], [500, 200], [100, 200]], sheetIds: [], widthMm: 4000, heightMm: 1000 });
    return g.project.addObject({ photoId: p, name: '모름', shape: 'rect', quad: [[1100, 100], [1300, 100], [1300, 200], [1100, 200]], sheetIds: [] });
  });
  await page.getByTestId('camera-auto').click();
  await expect.poll(() => page.evaluate(() => !!(window as any).__ganpanda.photos[0].camera)).toBe(true);
  const cam = () => page.evaluate(() => JSON.stringify((window as any).__ganpanda.photos[0].camera));
  const before = await cam();
  await expect.poll(() => est(page, u)).toBeGreaterThan(1900); // 사인물 기준 200px ≈ 2000
  // 비뚤게 그린 블록 → 원근의 직사각형으로 맞춰진다 (정면 사진이라 축 정렬 사각)
  await page.getByTestId('tool-block').click();
  await dragOnPhoto(page, [600, 300], [1000, 400]);
  await page.evaluate(() => { const g = (window as any).__ganpanda; g.updateBlock(g.photos[0].id, 0, [[600, 300], [1010, 292], [1000, 412], [590, 400]]); });
  const q = (await photoBlocks(page))[0].q as number[][];
  expect(Math.abs(q[0][1] - q[1][1])).toBeLessThan(2); // 위 변 수평
  expect(Math.abs(q[0][0] - q[3][0])).toBeLessThan(2); // 왼 변 수직
  // 길이 하나만(가로 8000) → 블록 글자는 그 길이만, '모름'은 블록 축척으로 (블록 폭 ≈ 410px = 8000 → 200px ≈ 3900)
  await page.getByTestId('block-panel').getByTestId('block-width').fill('8000');
  await expect(page.getByTestId('block-size')).toHaveText('가로 8,000');
  await expect.poll(() => est(page, u)).toBeGreaterThan(3600);
  expect(await est(page, u)).toBeLessThan(4200);
  expect(await cam()).toBe(before); // 원근은 그대로
  // 고른 블록의 축 면 그리드 — 블록이 둘이면 면이 둘을 덮는다
  await expect(page.getByTestId('block-grid')).toBeVisible();
  const faceW = () => page.getByTestId('block-face').evaluate((e) => (e as SVGGraphicsElement).getBBox().width);
  const w1 = await faceW();
  await page.evaluate(() => { const g = (window as any).__ganpanda, p = g.photos[0].id; g.project.updatePhoto(p, { blocks: [...g.photos[0].blocks, { q: [[100, 700], [300, 700], [300, 800], [100, 800]], w: 4000 }] }); g.selectBlock(p, 0); });
  await expect.poll(faceW).toBeGreaterThan(w1);
  expect(await cam()).toBe(before);
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

test('블록의 길이와 자리가 반영된다 — 두 블록의 축척이 달라도 각 블록은 자기 길이로 맞고(보라), 사인물은 가까운 블록을 따르며 사이는 이어진다 (2026-11-04 "두 블록의 가로 비율이 서로 다르게 나온다")', async ({ page, request }) => {
  await openOwnedProject(page, request, '블록 자리');
  await uploadPhoto(page);
  const ids = await page.evaluate(() => {
    const g = (window as any).__ganpanda, p = g.photos[0].id;
    g.project.addObject({ photoId: p, name: '실측', shape: 'rect', quad: [[700, 800], [900, 800], [900, 900], [700, 900]], sheetIds: [], widthMm: 2000, heightMm: 1000 });
    const left = g.project.addObject({ photoId: p, name: '왼쪽', shape: 'rect', quad: [[100, 400], [300, 400], [300, 500], [100, 500]], sheetIds: [] });
    const mid = g.project.addObject({ photoId: p, name: '가운데', shape: 'rect', quad: [[700, 400], [900, 400], [900, 500], [700, 500]], sheetIds: [] });
    const right = g.project.addObject({ photoId: p, name: '오른쪽', shape: 'rect', quad: [[1300, 400], [1500, 400], [1500, 500], [1300, 500]], sheetIds: [] });
    return { p, left, mid, right };
  });
  await page.getByTestId('camera-auto').click();
  await expect.poll(() => page.evaluate(() => !!(window as any).__ganpanda.photos[0].camera)).toBe(true);
  // 같은 크기(200px)로 그린 두 블록에 서로 다른 길이 — 원근만으로는 한 축척이라 둘 중 하나는 안 맞는다
  await page.evaluate((p) => (window as any).__ganpanda.project.updatePhoto(p, { blocks: [{ q: [[100, 200], [300, 200], [300, 300], [100, 300]], w: 2000 }, { q: [[1300, 200], [1500, 200], [1500, 300], [1300, 300]], w: 3000 }] }), ids.p);
  await expect.poll(() => est(page, ids.left)).toBeGreaterThan(1950);
  expect(await est(page, ids.left)).toBeLessThan(2050);
  expect(await est(page, ids.right)).toBeGreaterThan(2950);
  expect(await est(page, ids.right)).toBeLessThan(3050);
  const m = await est(page, ids.mid);
  expect(m).toBeGreaterThan(2400); expect(m).toBeLessThan(2600);
  // 두 블록 모두 자기 길이로 맞는다 → 보라
  await expect(page.getByTestId('size-block').nth(0)).toHaveAttribute('data-fit', '1');
  await expect(page.getByTestId('size-block').nth(1)).toHaveAttribute('data-fit', '1');
});
