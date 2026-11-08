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
const center = async (page: Page, testid: string, n: number) => { const b = (await page.getByTestId(testid).nth(n).boundingBox())!; return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };

test('마스크 도구(Z)로 사각을 끌어 만들고, 변 가운데 □로 꼭짓점 추가, 끌기, 고른 꼭짓점 Delete(최소 3개), 두 번 누르면 곡선', async ({ page, request, browser }) => {
  const { session, projectId } = await openOwnedProject(page, request);
  await uploadPhoto(page);
  await page.keyboard.press('z');
  await expect(page.getByTestId('tool-mask')).toHaveClass(/on/);
  await dragOnPhoto(page, [200, 100], [1400, 900]);
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
  await page.keyboard.press('z');
  await dragOnPhoto(page, [100, 100], [600, 400]);
  await page.keyboard.press('z');
  await dragOnPhoto(page, [700, 500], [1500, 900]);
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

test('렌더링 PNG(제안 이미지)에도 마스크: 마스크 안은 원래 사진, 밖은 3D 그림 그대로, 야간은 사진을 어둡게', async ({ page, request }) => {
  await openOwnedProject(page, request);
  const r = await page.evaluate(async () => {
    const path = '/src/lib/render/maskComposite.ts';
    const { withMasks } = await import(/* @vite-ignore */ path);
    const solid = (color: string, w: number, h: number) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d')!; x.fillStyle = color; x.fillRect(0, 0, w, h); return c.toDataURL('image/png'); };
    const rendered = solid('#ff0000', 200, 100), photo = solid('#00ff00', 400, 200); // 렌더링은 사진 절반 크기
    const masks = [{ pts: [[0, 0], [200, 0], [200, 200], [0, 200]] }]; // 사진 px 왼쪽 절반
    const px = async (url: string, x: number, y: number) => { const im = new Image(); im.src = url; await im.decode(); const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const g = c.getContext('2d')!; g.drawImage(im, 0, 0); return [...g.getImageData(x, y, 1, 1).data].slice(0, 3); };
    const day = await withMasks(rendered, photo, masks, 400, 200);
    const night = await withMasks(rendered, photo, masks, 400, 200, true);
    return { inDay: await px(day, 50, 50), outDay: await px(day, 150, 50), inNight: await px(night, 50, 50), same: await withMasks(rendered, photo, [], 400, 200) === rendered };
  });
  expect(r.inDay).toEqual([0, 255, 0]);
  expect(r.outDay).toEqual([255, 0, 0]);
  expect(r.inNight[1]).toBeLessThan(80); // 야간 = 어둡게
  expect(r.inNight[1]).toBeGreaterThan(0);
  expect(r.same).toBe(true); // 마스크 없으면 그대로
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
