// 앞가림 마스크 · 다각형 편집 (2026-11-08 사용자: "존의 작동 원리를 다각형에 적용한다. 존을 폐지하고 존의 작동원리에 베지어곡선 컨트롤러를 추가하고 마스크를 추가한다"
// → (질문) 마스크 = "앞가림 마스크", 곡선 = "꼭짓점 두 번 누르기"). 존 테스트(변 가운데 클릭 추가·Delete·최소 3개·여러 개)를 마스크로 옮겼다
import { expect, test, type Page } from '@playwright/test';
import { apiCreateInvite, dragOnPhoto, openInvited, openOwnedProject, uploadPhoto } from './helpers';

type G = { __ganpanda: { photos: { id: string; masks?: { pts: number[][]; curves?: unknown[] }[] }[]; project: { addObject(o: unknown): string; object(id: string): { quad: number[][]; polygon?: number[][]; curves?: unknown[] } }; selectObject(id: string | null): void; addMask(p: string, m: unknown): void; selectMask(p: null): void } };

async function clickPhoto(page: Page, x: number, y: number) {
  const b = (await page.getByTestId('photo-img').first().boundingBox())!;
  const k = b.width / 1600;
  await page.mouse.click(b.x + x * k, b.y + y * k);
}
/** 마스크 도구(Z)로 점을 차례로 찍는다 (2026-11-08 다각형과 바꾼 그리기). end = 끝내기: first(첫 점 다시) · dbl(마지막 점 두 번) · enter */
async function drawMask(page: Page, pts: [number, number][], end: 'first' | 'dbl' | 'enter' = 'first') {
  await page.keyboard.press('z');
  for (const p of pts) await clickPhoto(page, p[0], p[1]);
  if (end === 'first') await clickPhoto(page, pts[0][0] + 2, pts[0][1] + 2);
  else if (end === 'enter') await page.keyboard.press('Enter');
  else { const b = (await page.getByTestId('photo-img').first().boundingBox())!; const k = b.width / 1600; const l = pts.at(-1)!; await page.mouse.dblclick(b.x + l[0] * k, b.y + l[1] * k); }
}
const center = async (page: Page, testid: string, n: number) => { const b = (await page.getByTestId(testid).nth(n).boundingBox())!; return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };

test('마스크 도구(Z)로 사각을 끌어 만들고, 변 가운데 □로 꼭짓점 추가, 끌기, 고른 꼭짓점 Delete(최소 3개), 두 번 누르면 곡선', async ({ page, request, browser }) => {
  const { session, projectId } = await openOwnedProject(page, request);
  await uploadPhoto(page);
  await page.keyboard.press('z');
  await expect(page.getByTestId('tool-mask')).toHaveClass(/on/);
  await page.keyboard.press('Escape');
  await drawMask(page, [[200, 100], [1400, 100], [1400, 900], [200, 900]]);
  await expect(page.getByTestId('mask-shape')).toHaveCount(1);
  await expect(page.getByTestId('tool-select')).toHaveClass(/on/); // 그리면 선택 도구로 — 바로 고친다
  await expect(page.getByTestId('mask-vertex')).toHaveCount(4);
  await expect(page.getByTestId('mask-mid')).toHaveCount(4);

  await page.getByTestId('mask-mid').first().click(); // 위 변 가운데 → 꼭짓점 5개
  await expect(page.getByTestId('mask-vertex')).toHaveCount(5);
  const v = await center(page, 'mask-vertex', 1);
  await page.mouse.move(v.x, v.y); await page.mouse.down();
  await page.mouse.move(v.x, v.y + 60, { steps: 5 }); await page.mouse.up();
  const masks = () => page.evaluate(() => (window as unknown as G).__ganpanda.photos[0].masks ?? []);
  expect((await masks())[0].pts[1][1]).toBeGreaterThan(150);

  // 두 번 누르면 곡선 손잡이 둘, 경로에 곡선(C)
  const v2 = await center(page, 'mask-vertex', 2);
  await page.mouse.dblclick(v2.x, v2.y);
  await expect(page.getByTestId('mask-handle-in')).toHaveCount(1);
  await expect(page.getByTestId('mask-handle-out')).toHaveCount(1);
  expect(await page.getByTestId('mask-shape').getAttribute('d')).toMatch(/C/);
  // 손잡이를 끌면 반대쪽은 대칭
  const h = await center(page, 'mask-handle-out', 0);
  await page.mouse.move(h.x, h.y); await page.mouse.down(); await page.mouse.move(h.x + 30, h.y + 20, { steps: 4 }); await page.mouse.up();
  const c = (await masks())[0].curves![2] as { in: number[]; out: number[] };
  const p2 = (await masks())[0].pts[2];
  expect(c.in[0] + c.out[0]).toBeCloseTo(2 * p2[0], 0);
  expect(c.in[1] + c.out[1]).toBeCloseTo(2 * p2[1], 0);
  // 다시 두 번 → 직선 모서리
  await page.mouse.dblclick(v2.x, v2.y);
  await expect(page.getByTestId('mask-handle-in')).toHaveCount(0);

  // 꼭짓점 고르고 Delete → 4개, 3개 밑으로는 안 줄어든다
  await page.getByTestId('mask-vertex').nth(1).click();
  await expect(page.getByTestId('mask-vertex').nth(1)).toHaveClass(/sel/);
  await page.keyboard.press('Delete');
  await expect(page.getByTestId('mask-vertex')).toHaveCount(4);
  await page.getByTestId('mask-vertex').nth(0).click(); await page.keyboard.press('Delete');
  await expect(page.getByTestId('mask-vertex')).toHaveCount(3);
  await page.getByTestId('mask-vertex').nth(0).click(); await page.keyboard.press('Delete');
  await expect(page.getByTestId('mask-vertex')).toHaveCount(3);
  await page.getByTestId('board-canvas').hover();
  await page.keyboard.press('ControlOrMeta+z');
  await expect(page.getByTestId('mask-vertex')).toHaveCount(4);

  // 고객(보기 초대)은 편집 손잡이 없이, 마스크 모양대로 사진이 앞에 덮인 결과를 본다
  const guest = await openInvited(browser, await apiCreateInvite(request, session, projectId, 'viewer'));
  await expect(guest.getByTestId('mask-vertex')).toHaveCount(0);
  await expect(guest.getByTestId('photo-masks')).toHaveAttribute('data-count', '1');
  await guest.ctx.close();
});

test('마스크는 여러 개: 끌 때마다 추가, 마스크를 골라 Delete 하면 그것만, 빈 곳 클릭은 선택 해제', async ({ page, request }) => {
  await openOwnedProject(page, request);
  await uploadPhoto(page);
  await drawMask(page, [[100, 100], [600, 100], [600, 400], [100, 400]]);
  await drawMask(page, [[700, 500], [1500, 500], [1500, 900], [700, 900]], 'enter');
  await expect(page.getByTestId('mask-shape')).toHaveCount(2);
  await expect(page.getByTestId('mask-vertex')).toHaveCount(4); // 새 것만 고른 상태
  await clickPhoto(page, 300, 200); // 첫 마스크 안 → 첫 마스크
  await expect(page.getByTestId('mask-vertex')).toHaveCount(4);
  await page.keyboard.press('Delete');
  await expect(page.getByTestId('mask-shape')).toHaveCount(1);
  expect((await page.getByTestId('mask-shape').getAttribute('d'))!.startsWith('M700 500')).toBe(true);
  await clickPhoto(page, 300, 200);
  await expect(page.getByTestId('mask-vertex')).toHaveCount(0);
});

test('제안·디자인에서는 마스크 모양대로 원래 사진이 사인물·3D 위에 덮이고(편집 표시 없음), 실측에서는 편집용 윤곽만', async ({ page, request }) => {
  await openOwnedProject(page, request);
  await uploadPhoto(page);
  await page.evaluate(() => { const a = (window as unknown as G).__ganpanda; a.addMask(a.photos[0].id, { pts: [[300, 300], [600, 300], [600, 900], [300, 900]] }); a.selectMask(null); });
  await expect(page.getByTestId('photo-masks')).toHaveCount(0); // 실측
  await expect(page.getByTestId('mask-shape')).toHaveCount(1);
  for (const tab of ['view-propose', 'view-design']) {
    await page.getByTestId(tab).click();
    await expect(page.getByTestId('mask-shape')).toHaveCount(0);
    await expect(page.getByTestId('photo-mask-image')).toHaveCount(1);
    // 사진 칸·실시간 3D 보다 위 (보드 층에서 나중 형제)
    expect(await page.getByTestId('photo-masks').evaluate((m) => { const z = document.querySelector('[data-testid="photo-zone"]')!; return !!(z.compareDocumentPosition(m) & Node.DOCUMENT_POSITION_FOLLOWING); })).toBe(true);
    const live = page.getByTestId('live-3d');
    if (await live.count()) expect(await page.getByTestId('photo-masks').evaluate((m) => !!(document.querySelector('[data-testid="live-3d"]')!.compareDocumentPosition(m) & Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);
  }
});

test('다각형 사인물 = 마스크와 같은 편집: 꼭짓점·변 가운데 □·두 번 누르면 곡선(외곽선도 곡선), 고른 꼭짓점 Delete, 통째로 옮기면 윤곽도 따라간다', async ({ page, request }) => {
  await openOwnedProject(page, request);
  await uploadPhoto(page);
  const id = await page.evaluate(() => { const a = (window as unknown as G).__ganpanda; const id = a.project.addObject({ photoId: a.photos[0].id, name: '다각', shape: 'polygon', quad: [[400, 300], [1000, 300], [1000, 700], [400, 700]], polygon: [[400, 300], [1000, 300], [700, 700]], sheetIds: [] }); a.selectObject(id); return id; });
  const obj = () => page.evaluate((id) => (window as unknown as G).__ganpanda.project.object(id), id);
  await expect(page.getByTestId('poly-vertex')).toHaveCount(3);
  await expect(page.getByTestId('sign-handle')).toHaveCount(0); // 외곽 사각 손잡이 대신 꼭짓점
  await page.getByTestId('poly-mid').first().click();
  await expect(page.getByTestId('poly-vertex')).toHaveCount(4);
  expect((await obj()).polygon!.length).toBe(4);

  const v = await center(page, 'poly-vertex', 3);
  await page.mouse.dblclick(v.x, v.y); // 곡선
  await expect(page.getByTestId('poly-handle-out')).toHaveCount(1);
  const pts = (await page.locator(`[data-testid="sign-shape"][data-id="${id}"]`).getAttribute('points'))!.split(' ');
  expect(pts.length).toBeGreaterThan(8); // 곡선 변은 잘게 나눈 점
  const q0 = (await obj()).quad;
  expect(q0[0][1]).toBe(300); expect(q0[2][1]).toBeGreaterThanOrEqual(700); // 외곽 사각 = 곡선까지 바운드 박스

  // 고른 꼭짓점 Delete → 꼭짓점만 (사인물은 남는다)
  await page.getByTestId('poly-vertex').nth(1).click();
  await page.keyboard.press('Delete');
  await expect(page.getByTestId('poly-vertex')).toHaveCount(3);
  await expect(page.locator(`[data-testid="sign-shape"][data-id="${id}"]`)).toHaveCount(1);

  // 안쪽을 끌어 통째로 옮기면 다각형도 같이 (전에는 외곽 사각만 움직였다)
  const before = (await obj()).polygon!;
  const sb = (await page.locator(`[data-testid="sign-shape"][data-id="${id}"]`).boundingBox())!;
  const img = (await page.getByTestId('photo-img').first().boundingBox())!;
  const k = img.width / 1600;
  const sx = img.x + 600 * k, sy = img.y + 400 * k;
  expect(sx).toBeGreaterThan(sb.x);
  await page.mouse.move(sx, sy); await page.mouse.down(); await page.mouse.move(sx + 100 * k, sy + 50 * k, { steps: 6 }); await page.mouse.up();
  const after = (await obj()).polygon!;
  expect(after[0][0] - before[0][0]).toBeGreaterThan(80);
  expect(after[0][1] - before[0][1]).toBeGreaterThan(30);
});

// 2026-11-08 사용자: "마스크 제안과 디자인에서 사인물을 제거하는 역활인데 나타나지 않는데" — DOM 순서만 보던 시험이 놓쳤다(실시간 3D 층 z-index 1 아래에 깔림). 화면 픽셀로 본다
test('제안·디자인 화면에서 마스크 자리는 실제로 사진 색이 보인다 (사인물·3D 가 덮지 않는다)', async ({ page, request }) => {
  test.setTimeout(90_000);
  await openOwnedProject(page, request);
  await uploadPhoto(page);
  const at = async () => { const b = (await page.getByTestId('photo-img').first().boundingBox())!; const k = b.width / 1600; return { x: Math.round(b.x + 650 * k), y: Math.round(b.y + 400 * k) }; };
  const pixel = async () => { const p = await at(); const png = await page.screenshot({ clip: { x: p.x, y: p.y, width: 1, height: 1 } }); return page.evaluate(async (b64) => { const im = new Image(); im.src = 'data:image/png;base64,' + b64; await im.decode(); const c = document.createElement('canvas'); c.width = c.height = 1; const g = c.getContext('2d')!; g.drawImage(im, 0, 0); return [...g.getImageData(0, 0, 1, 1).data].slice(0, 3); }, png.toString('base64')); };
  const photoPx = await pixel(); // 실측: 사진 그대로
  await page.evaluate(() => { const a = (window as unknown as G).__ganpanda; const pid = a.photos[0].id; a.project.addObject({ photoId: pid, name: '간판', shape: 'rect', quad: [[200, 200], [1400, 200], [1400, 600], [200, 600]], sheetIds: [], widthMm: 6000, heightMm: 2000, productId: 'board-flex', text: '간판다' }); a.selectObject(null); });
  const near = (a: number[], b: number[]) => Math.max(...a.map((v, i) => Math.abs(v - b[i]))) <= 12;
  for (const tab of ['view-propose', 'view-design']) {
    await page.getByTestId(tab).click();
    await expect.poll(async () => near(await pixel(), photoPx), { timeout: 20_000 }).toBe(false); // 사인물이 덮었다 (평면이든 3D 든)
  }
  await page.getByTestId('view-board').click();
  await page.evaluate(() => { const a = (window as unknown as G).__ganpanda; a.addMask(a.photos[0].id, { pts: [[500, 100], [800, 100], [800, 900], [500, 900]] }); a.selectMask(null); });
  for (const tab of ['view-propose', 'view-design']) {
    await page.getByTestId(tab).click();
    await page.waitForTimeout(3000); // 3D 그림·실시간 3D 가 올라온 뒤에도
    await expect.poll(async () => near(await pixel(), photoPx), { timeout: 20_000 }).toBe(true);
  }
});

// 2026-11-08 사용자: "마스크가 선택된 상태에서는 다른 사인물아웃라인 선택보다 우선되어야한다"
test('고른 마스크는 사인물 외곽선보다 위: 겹친 자리를 눌러도 마스크가 그대로 골라져 있고, 사인물 위의 꼭짓점도 끌린다', async ({ page, request }) => {
  await openOwnedProject(page, request);
  await uploadPhoto(page);
  const sel = () => page.evaluate(() => { const a = (window as unknown as { __ganpanda: { selectedId: string | null; maskSel: unknown } }).__ganpanda; return { sign: a.selectedId, mask: a.maskSel }; });
  await page.evaluate(() => { const a = (window as unknown as G).__ganpanda; const pid = a.photos[0].id;
    a.project.addObject({ photoId: pid, name: '간판', shape: 'rect', quad: [[200, 200], [1400, 200], [1400, 600], [200, 600]], sheetIds: [] });
    a.addMask(pid, { pts: [[500, 300], [800, 300], [800, 500], [500, 500]] }); }); // 사인물 안에 마스크, 만들면 골라진다
  await expect(page.getByTestId('sel-mask')).toHaveCount(1);
  await clickPhoto(page, 650, 400); // 겹친 자리
  expect(await sel()).toEqual({ sign: null, mask: { photoId: expect.any(String), index: 0, vertex: null } });
  const v = await center(page, 'mask-vertex', 0);
  await page.mouse.move(v.x, v.y); await page.mouse.down(); await page.mouse.move(v.x - 40, v.y - 30, { steps: 4 }); await page.mouse.up();
  const m = await page.evaluate(() => (window as unknown as G).__ganpanda.photos[0].masks![0].pts[0]);
  expect(m[0]).toBeLessThan(490);
  expect((await sel()).sign).toBeNull();
  // 마스크를 풀면(빈 곳) 사인물이 다시 골라진다
  await clickPhoto(page, 100, 900);
  await clickPhoto(page, 300, 250);
  expect((await sel()).sign).not.toBeNull();
});

// 2026-11-08 사용자: "마스크 누르고 그릴때 사인물 위로 가면 선택이 된다"
test('마스크 도구로 사인물 위에서 끌기 시작해도 사인물이 골라지지 않고 마스크가 그려진다', async ({ page, request }) => {
  await openOwnedProject(page, request);
  await uploadPhoto(page);
  await page.evaluate(() => { const a = (window as unknown as G).__ganpanda; a.project.addObject({ photoId: a.photos[0].id, name: '간판', shape: 'rect', quad: [[200, 200], [1400, 200], [1400, 600], [200, 600]], sheetIds: [] }); a.selectObject(null); });
  await drawMask(page, [[500, 300], [900, 300], [900, 800]], 'enter'); // 사인물 안에서 시작
  await expect(page.getByTestId('mask-shape')).toHaveCount(1);
  expect(await page.evaluate(() => (window as unknown as { __ganpanda: { selectedId: string | null } }).__ganpanda.selectedId)).toBeNull();
  expect((await page.evaluate(() => (window as unknown as G).__ganpanda.photos[0].masks![0].pts))[0]).toEqual([500, 300]);
});

// 2026-11-08 사용자: "마스크가 다각형 그리는 방식 되면 열린 상태에서도 작동하게"
test('마스크는 점을 찍어 그리고, 첫 점을 다시 누르지 않아도(열린 채) 두 번 누르기·Enter 로 끝내면 마스크 — 그리는 동안에도 모양을 미리 보여 준다', async ({ page, request }) => {
  await openOwnedProject(page, request);
  await uploadPhoto(page);
  await page.keyboard.press('z');
  for (const p of [[200, 200], [600, 150], [700, 600]] as [number, number][]) await clickPhoto(page, p[0], p[1]);
  await expect(page.getByTestId('mask-draft')).toBeVisible();
  await expect(page.getByTestId('mask-draft-fill')).toHaveCount(1); // 열린 채로도 면 미리보기
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('mask-shape')).toHaveCount(1);
  await expect(page.getByTestId('mask-draft')).toHaveCount(0);
  await drawMask(page, [[900, 200], [1300, 200], [1300, 700], [1000, 800]], 'dbl');
  await expect(page.getByTestId('mask-shape')).toHaveCount(2);
  const masks = await page.evaluate(() => (window as unknown as G).__ganpanda.photos[0].masks!.map((m) => m.pts.length));
  expect(masks).toEqual([3, 4]);
  // 사각 끌기로는 마스크가 생기지 않는다 (다각형으로 옮김)
  await page.keyboard.press('z');
  await dragOnPhoto(page, [100, 700], [400, 900]);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('mask-shape')).toHaveCount(2);
});

// 2026-11-08 사용자: "핀볼에서 마스크를 사용했는데 3d만 제거되야하는데 다른 사진처럼 살짝 색과 위치가 틀어져 있다" — 원본 사진을 3D 그림 위에 덮어 3D 배경과 색·자리가 달랐다.
// 이제 3D 안에서(뷰어가 마스크 자리에 자기 배경을 다시) — 마스크 자리 = 그 사인물을 뺀 3D 그림과 같은 색
test('3D 그림에서 마스크 자리는 사인물만 빠진 3D 배경과 같은 색 (원본 사진을 덮지 않는다)', async ({ page, request }) => {
  test.setTimeout(120_000);
  await openOwnedProject(page, request);
  await uploadPhoto(page);
  const pid = await page.evaluate(() => (window as unknown as G).__ganpanda.photos[0].id);
  const ids = await page.evaluate(() => { const a = (window as unknown as G).__ganpanda; const pid = a.photos[0].id;
    const A = a.project.addObject({ photoId: pid, name: '가림', shape: 'rect', quad: [[300, 300], [1000, 300], [1000, 600], [300, 600]], sheetIds: [], widthMm: 4000, heightMm: 1500, productId: 'board-flex', text: '간판' });
    const B = a.project.addObject({ photoId: pid, name: '다른', shape: 'rect', quad: [[1100, 700], [1500, 700], [1500, 900], [1100, 900]], sheetIds: [], widthMm: 2000, heightMm: 1000, productId: 'board-flex', text: '다른' });
    a.addMask(pid, { pts: [[550, 250], [750, 250], [750, 650], [550, 650]] }); a.selectMask(null); return { A, B }; });
  const overlayPx = async () => { await page.waitForTimeout(500); const b = (await page.getByTestId('photo-overlay').first().boundingBox())!; const k = b.width / 1600; const png = await page.screenshot({ clip: { x: Math.round(b.x + 650 * k), y: Math.round(b.y + 450 * k), width: 1, height: 1 } }); return page.evaluate(async (b64) => { const im = new Image(); im.src = 'data:image/png;base64,' + b64; await im.decode(); const c = document.createElement('canvas'); c.width = c.height = 1; const g = c.getContext('2d')!; g.drawImage(im, 0, 0); return [...g.getImageData(0, 0, 1, 1).data].slice(0, 3); }, png.toString('base64')); };
  const key = () => page.evaluate((pid) => (window as any).__ganpanda.stageRenders['p:' + pid]?.key ?? '', pid);
  await page.getByTestId('view-propose').click();
  await expect.poll(() => page.evaluate((pid) => (window as any).__ganpanda.stageRenders['p:' + pid]?.url ?? '', pid), { timeout: 60_000 }).toMatch(/^blob:/);
  await expect(page.getByTestId('photo-masks')).toHaveCount(0); // 3D 그림에는 원본 덮개를 얹지 않는다
  const k1 = await key();
  const withSign = await overlayPx();
  await page.evaluate((id) => (window as any).__ganpanda.project.removeObject(id), ids.A);
  await expect.poll(async () => { const k = await key(); return k !== k1 && !k.startsWith('stale|') && !!(await page.evaluate((pid) => (window as any).__ganpanda.stageRenders['p:' + pid]?.url, pid)); }, { timeout: 60_000 }).toBe(true);
  const without = await overlayPx();
  expect(Math.max(...withSign.map((v, i) => Math.abs(v - without[i])))).toBeLessThanOrEqual(4);
});
