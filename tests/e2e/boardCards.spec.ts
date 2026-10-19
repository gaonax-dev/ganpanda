import { expect, test } from '@playwright/test';
import { dragOnPhoto, openObjectSettings, openOwnedProject, pickCategory, uploadPhoto } from './helpers';

/** 보드 빈 곳(사진 밖)에서 world 좌표로 끌기 */
async function dragOnBoard(page: import('@playwright/test').Page, from: [number, number], to: [number, number]) {
  const toClient = (p: [number, number]) => page.evaluate(([x, y]) => {
    const el = document.querySelector('[data-testid="board-canvas"]')!;
    const world = el.querySelector('.world') as HTMLElement;
    const t = new DOMMatrix(getComputedStyle(world).transform);
    const r = el.getBoundingClientRect();
    return [r.left + t.e + x * t.a, r.top + t.f + y * t.d] as [number, number];
  }, p);
  const a = await toClient(from), b = await toClient(to);
  await page.mouse.move(a[0], a[1]);
  await page.mouse.down();
  await page.mouse.move((a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
  await page.mouse.move(b[0], b[1]);
  await page.mouse.up();
}

test('사진에 그린 사인물에 치수를 직접 입력하면 사진 아래에 평면도 카드가 생긴다 (생성 순, 왼쪽부터)', async ({ page, request }) => {
  await openOwnedProject(page, request);
  await uploadPhoto(page);
  await page.keyboard.press('t');
  await dragOnPhoto(page, [400, 200], [800, 300]);
  await expect(page.getByTestId('board-card')).toHaveCount(0); // 치수 전에는 없음
  await pickCategory(page, 'sign');
  await openObjectSettings(page);
  await page.getByTestId('width-mm').fill('3000');
  await page.getByTestId('height-mm').fill('600');
  await page.keyboard.press('Escape');
  const card = page.getByTestId('board-card');
  await expect(card).toHaveCount(1);
  await expect(card).toContainText('3,000 × 600');
  // 카드는 사진 아래
  const photo = (await page.getByTestId('photo-zone').boundingBox())!;
  const c = (await card.boundingBox())!;
  expect(c.y).toBeGreaterThan(photo.y + photo.height - 1);
  expect(Math.abs(c.x - photo.x)).toBeLessThan(2);
  // 카드를 누르면 그 사인물이 선택된다
  await page.keyboard.press('Escape');
  await page.getByTestId('board-canvas').click({ position: { x: 10, y: 10 } });
  await expect(page.getByTestId('object-panel')).toHaveCount(0);
  await card.click();
  await expect(page.getByTestId('object-panel')).toBeVisible();
});

test('보드 빈 곳에 사각 도구로 끌면 사진 없는 사인물이 바로 생기고(끌어 그린 크기 = 치수), 사진의 영역을 그것과 연결할 수 있다', async ({ page, request }) => {
  await openOwnedProject(page, request);
  await uploadPhoto(page);
  const photo = await page.evaluate(() => { const p = (window as unknown as { __ganpanda: { photos: { x: number; y: number; width: number }[] } }).__ganpanda.photos[0]; return { x: p.x, y: p.y, width: p.width }; });
  // 사진 오른쪽 빈 곳이 화면에 들어오게 축소
  await page.evaluate(() => { const el = document.querySelector('[data-testid="board-canvas"]')!; for (let i = 0; i < 2; i++) el.dispatchEvent(new WheelEvent('wheel', { deltaY: 120, clientX: 200, clientY: 300, bubbles: true, cancelable: true })); });
  await page.keyboard.press('t');
  // 사진 오른쪽 빈 곳에 300×60 world px → 3,000×600 mm
  const x0 = photo.x + photo.width + 200, y0 = photo.y;
  await dragOnBoard(page, [x0, y0], [x0 + 300, y0 + 60]);
  const card = page.getByTestId('board-standalone');
  await expect(card).toHaveCount(1);
  await expect(card).toContainText('3,000 × 600');
  await expect(page.getByTestId('object-panel')).toBeVisible(); // 바로 생성·선택
  const objs = () => page.evaluate(() => (window as unknown as { __ganpanda: { objects: { id: string; photoId: string; name: string; widthMm?: number; sameAs?: string }[] } }).__ganpanda.objects);
  const standalone = (await objs()).find((o) => !o.photoId)!;
  expect(standalone.widthMm).toBe(3000);
  // 치수를 고치면 카드 크기가 따라간다
  await openObjectSettings(page);
  await page.getByTestId('width-mm').fill('6000');
  await page.keyboard.press('Escape');
  await expect(card).toContainText('6,000 × 600');
  // 사진에 영역을 그리고 "기존 사인물과 같은 것?" 으로 보드 사인물과 연결
  await page.keyboard.press('t');
  await dragOnPhoto(page, [300, 200], [900, 320]);
  await page.getByTestId('link-select').selectOption(standalone.id);
  await expect(page.getByTestId('link-info')).toContainText('2곳');
  const after = await objs();
  const area = after.find((o) => o.photoId && o.sameAs === standalone.id)!;
  expect(area.widthMm).toBe(6000); // 규격은 보드 사인물 것
  await expect(page.getByTestId('sign-linked')).toHaveCount(1);
  // 리스트에는 하나, 평면도 카드(보드 사인물 것 하나뿐)에 ⇄ 표시
  await expect(page.getByTestId('board-card')).toHaveCount(0);
  await expect(card).toContainText('⇄');
  await page.getByTestId('view-list').click();
  await expect(page.getByTestId('list-card')).toHaveCount(1);
});

test('평면도 카드는 사인물마다 하나(연결된 사진이 여럿이어도 중복 없음), 보드에서 끌어 배치하면 리스트 뷰도 같은 배치, PDF 는 SVG 로', async ({ page, request }) => {
  await openOwnedProject(page, request);
  await uploadPhoto(page);
  const ids = await page.evaluate(() => {
    const app = (window as unknown as { __ganpanda: { photos: { id: string }[]; project: { addObject(o: unknown): string; linkObject(a: string, b: string): void } } }).__ganpanda;
    const photoId = app.photos[0].id;
    const master = app.project.addObject({ photoId, name: '정면 간판', shape: 'rect', quad: [[200, 100], [800, 100], [800, 300], [200, 300]], sheetIds: [], productId: 'board-flex', widthMm: 3000, heightMm: 600 });
    const copy = app.project.addObject({ photoId, name: '복사', shape: 'rect', quad: [[900, 100], [1400, 100], [1400, 300], [900, 300]], sheetIds: [] });
    app.project.linkObject(copy, master);
    return { master, copy };
  });
  // 같은 사인물이 두 영역에 있어도 평면도 카드는 하나
  await expect(page.getByTestId('board-card')).toHaveCount(1);
  // 배지·바탕색 (2026-10-17 "정면도에도 배경색 나오게 … 제목 왼쪽에 인디케이터 원본·설정·디자인"): 후렉스 몸통 → 설정, 바탕색 면이 있음
  await expect(page.getByTestId('board-card').getByTestId('card-badge')).toHaveText('설정');
  await expect(page.getByTestId('board-card').getByTestId('card-fill')).toHaveCount(1);
  await page.evaluate((id) => { const app = (window as unknown as { __ganpanda: { project: { updateObject(id: string, p: unknown): void } } }).__ganpanda; app.project.updateObject(id, { productId: 'body-none', design: { sourceId: 'none', page: 0, crop: { x: 0, y: 0, w: 100, h: 50 } } }); }, ids.master);
  await expect(page.getByTestId('board-card').getByTestId('card-badge')).toHaveText('디자인');
  await page.evaluate((id) => { const app = (window as unknown as { __ganpanda: { project: { updateObject(id: string, p: unknown): void } } }).__ganpanda; app.project.updateObject(id, { design: undefined }); }, ids.master);
  await expect(page.getByTestId('board-card').getByTestId('card-badge')).toHaveText('원본');
  await expect(page.getByTestId('board-card').getByTestId('card-fill')).toHaveCount(0);
  await page.evaluate((id) => { const app = (window as unknown as { __ganpanda: { project: { updateObject(id: string, p: unknown): void } } }).__ganpanda; app.project.updateObject(id, { productId: 'board-flex' }); }, ids.master);
  // 평면 구역이 화면에 들어오게 축소
  await page.evaluate(() => { const el = document.querySelector('[data-testid="board-canvas"]')!; for (let i = 0; i < 2; i++) el.dispatchEvent(new WheelEvent('wheel', { deltaY: 120, clientX: 700, clientY: 200, bubbles: true, cancelable: true })); });
  await expect(page.getByTestId('board-card')).toContainText('⇄');
  // 보드에서 카드를 끌어 옮기면 listX/listY 가 바뀌고
  const card = page.getByTestId('board-card');
  const b = (await card.boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2 + 60, b.y + b.height / 2 + 40, { steps: 4 });
  await page.mouse.up();
  const pos = await page.evaluate((id) => { const o = (window as unknown as { __ganpanda: { objects: { id: string; listX?: number; listY?: number }[] } }).__ganpanda.objects.find((x) => x.id === id)!; return [o.listX, o.listY]; }, ids.master);
  expect(pos[0]).toBeGreaterThan(0);
  expect(pos[1]).toBeGreaterThan(0);
  // 평면 구역 전체 크기 (2026-10-17): [+] 로 1.25배, 카드 폭도 1.25배. 손잡이를 끌면 비율대로
  const before = (await card.boundingBox())!.width;
  await page.getByTestId('flat-scale-up').click();
  await expect(page.getByTestId('flat-scale-value')).toHaveText('125%');
  await expect.poll(async () => (await card.boundingBox())!.width / before).toBeCloseTo(1.25, 1);
  const hb = (await page.getByTestId('flat-handle').boundingBox())!;
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
  await page.mouse.down();
  await page.mouse.move(hb.x + hb.width / 2 - 60, hb.y + hb.height / 2, { steps: 4 });
  await page.mouse.up();
  const scale = await page.evaluate(() => (window as unknown as { __ganpanda: { settings: { flatScale?: number } } }).__ganpanda.settings.flatScale);
  expect(scale).toBeLessThan(0.125);
  expect(scale).toBeGreaterThan(0.02);
  // 왼쪽 위 손잡이로 평면 구역 전체 이동 (2026-10-17): 설정 flatOffset, 카드가 같이 움직이고 mm 배치는 그대로
  const posBefore = await page.evaluate((id) => { const o = (window as unknown as { __ganpanda: { objects: { id: string; listX?: number; listY?: number }[] } }).__ganpanda.objects.find((x) => x.id === id)!; return [o.listX, o.listY]; }, ids.master);
  const cb = (await card.boundingBox())!;
  const mb = (await page.getByTestId('flat-move').boundingBox())!;
  await page.mouse.move(mb.x + mb.width / 2, mb.y + mb.height / 2);
  await page.mouse.down();
  await page.mouse.move(mb.x + mb.width / 2 + 50, mb.y + mb.height / 2 + 30, { steps: 4 });
  await page.mouse.up();
  const off = await page.evaluate(() => (window as unknown as { __ganpanda: { settings: { flatOffset?: { x: number; y: number } } } }).__ganpanda.settings.flatOffset!);
  expect(off.x).toBeGreaterThan(0);
  expect(off.y).toBeGreaterThan(0);
  await expect.poll(async () => (await card.boundingBox())!.x - cb.x).toBeGreaterThan(40);
  expect(await page.evaluate((id) => { const o = (window as unknown as { __ganpanda: { objects: { id: string; listX?: number; listY?: number }[] } }).__ganpanda.objects.find((x) => x.id === id)!; return [o.listX, o.listY]; }, ids.master)).toEqual(posBefore);
  // 리스트 뷰의 카드가 그 자리에 (world mm = listX/listY) — 축척·이동은 보드 그리기만 바꾸고 mm 배치는 그대로
  await page.getByTestId('view-list').click();
  const listPos = await page.evaluate(() => { const el = document.querySelector('[data-testid="list-card"]') as HTMLElement; return [parseFloat(el.style.left), parseFloat(el.style.top)]; });
  expect(listPos).toEqual(pos);
  // PDF: SVG 를 만들어 인쇄 창에 띄운다
  const popup = page.waitForEvent('popup');
  await page.getByTestId('export-pdf').click();
  const w = await popup;
  await w.waitForLoadState();
  expect(await w.locator('svg').count()).toBe(1);
  const svg = await page.evaluate(() => (window as unknown as { __ganpanda: { lastSvg: string } }).__ganpanda.lastSvg);
  expect(svg).not.toContain('id="대지"'); // 인쇄용에는 대지 레이어 없음
  expect(svg).toContain('정면 간판');
  expect(svg).toContain('>3,000<');
  expect(svg).toContain('후렉스');
  await w.close();
  // SVG 내려받기 (일러스트레이터): 실물 1:1 + 글자 윤곽선 (2026-10-17 "비율, 윤곽선은 옵션으로")
  await page.getByTestId('export-svg').click();
  await page.getByTestId('svg-scale-1').check();
  await page.getByTestId('svg-outline').check();
  const dl = page.waitForEvent('download');
  await page.getByTestId('svg-download').click();
  expect((await dl).suggestedFilename()).toMatch(/전개도 1-1\.svg$/);
  const svg11 = await page.evaluate(() => (window as unknown as { __ganpanda: { lastSvg: string } }).__ganpanda.lastSvg);
  expect(svg11).toContain('width="3000.00"'); // 카드가 실물 mm
  expect(svg11).not.toContain('<text'); // 글자는 전부 path
  expect(svg11).toContain('<path ');
  expect(svg11).toContain('<g id="대지" data-layer="artboards">'); // 대지 레이어 (2026-10-18): 사인물 자리마다 보이지 않는 사각형
  expect((svg11.match(/data-artboard=/g) ?? []).length).toBe(1);
});

// 2026-10-19 사용자: "정면도들이 이동시 블로킹이 될 때가 있어" — 브라우저가 제스처를 가로채(pointercancel) pointerup 이 안 오면 끌기가 남아
// 버튼을 뗀 뒤에도 카드가 마우스를 따라가거나 다음 끌기가 엉켰다. 다중 선택에 자리 없는 카드가 섞이면 좌표가 NaN 이 되었다
test('카드 끌기가 취소돼도 끌기가 남지 않고, 다음 끌기는 정상 · 자리 없는 카드가 섞인 다중 끌기도 움직인다', async ({ page, request }) => {
  await openOwnedProject(page, request);
  await uploadPhoto(page);
  const ids = await page.evaluate(() => {
    const app = (window as unknown as { __ganpanda: { photos: { id: string }[]; project: { addObject(o: unknown): string; linkObject(a: string, b: string): void } } }).__ganpanda;
    const photoId = app.photos[0].id;
    const a = app.project.addObject({ photoId, name: 'A', shape: 'rect', quad: [[200, 100], [800, 100], [800, 300], [200, 300]], sheetIds: [], productId: 'board-flex', widthMm: 3000, heightMm: 600 });
    const noSize = app.project.addObject({ photoId, name: '연결 영역', shape: 'rect', quad: [[900, 100], [1400, 100], [1400, 300], [900, 300]], sheetIds: [] });
    app.project.linkObject(noSize, a); // 연결된 영역은 자기 평면도 카드(자리)가 없다
    return { a, noSize };
  });
  await page.evaluate(() => { const el = document.querySelector('[data-testid="board-canvas"]')!; for (let i = 0; i < 2; i++) el.dispatchEvent(new WheelEvent('wheel', { deltaY: 120, clientX: 700, clientY: 200, bubbles: true, cancelable: true })); });
  const card = page.getByTestId('board-card');
  await expect(card).toHaveCount(1);
  const posOf = () => page.evaluate((id) => { const o = (window as unknown as { __ganpanda: { objects: { id: string; listX?: number; listY?: number }[] } }).__ganpanda.objects.find((x) => x.id === id)!; return [o.listX ?? 0, o.listY ?? 0]; }, ids.a);
  const b = (await card.boundingBox())!;
  const cx = b.x + b.width / 2, cy = b.y + b.height / 2;
  // 끄는 중에 취소 → 그 뒤 버튼 없이 움직여도 카드는 그대로
  await page.mouse.move(cx, cy); await page.mouse.down();
  await page.mouse.move(cx + 40, cy + 20, { steps: 3 });
  await page.evaluate(() => window.dispatchEvent(new PointerEvent('pointercancel', { pointerId: 1, bubbles: true })));
  await page.waitForTimeout(50);
  const afterCancel = await posOf();
  await page.mouse.move(cx + 200, cy + 150, { steps: 3 });
  await page.waitForTimeout(50);
  expect(await posOf()).toEqual(afterCancel);
  await page.mouse.up();
  // 다음 끌기는 정상
  const b2 = (await card.boundingBox())!;
  await page.mouse.move(b2.x + b2.width / 2, b2.y + b2.height / 2); await page.mouse.down();
  await page.mouse.move(b2.x + b2.width / 2 + 60, b2.y + b2.height / 2, { steps: 4 }); await page.mouse.up();
  await expect.poll(async () => (await posOf())[0]).toBeGreaterThan(afterCancel[0] + 100);
  // 자리 없는 사인물이 다중 선택에 섞여도 카드는 움직이고 좌표는 숫자
  await page.evaluate((ids) => { const app = (window as unknown as { __ganpanda: { selectObject(id: string, k: string): void; toggleSelect(id: string, k: string): void } }).__ganpanda; app.selectObject(ids.a, 'card'); app.toggleSelect(ids.noSize, 'card'); }, ids);
  const before = await posOf();
  const b3 = (await card.boundingBox())!;
  await page.mouse.move(b3.x + b3.width / 2, b3.y + b3.height / 2); await page.mouse.down();
  await page.mouse.move(b3.x + b3.width / 2, b3.y + b3.height / 2 + 60, { steps: 4 }); await page.mouse.up();
  const after = await posOf();
  expect(Number.isFinite(after[0]) && Number.isFinite(after[1])).toBe(true);
  expect(after[1]).toBeGreaterThan(before[1]);
  const other = await page.evaluate((id) => (window as unknown as { __ganpanda: { objects: { id: string; listX?: number }[] } }).__ganpanda.objects.find((x) => x.id === id)!.listX, ids.noSize);
  expect(other === undefined || Number.isFinite(other)).toBe(true);
});

// 2026-10-19 젠 프로젝트 점검: 카드를 고르면 열리는 속성 패널이 화면 위아래 전체 높이로 떠 있어, 내용이 끝난 아래 빈 자리에 깔린 카드를 잡을 수 없었다
test('속성 패널은 내용 높이만큼만 — 패널 아래 빈 자리의 카드도 잡아 끌 수 있다', async ({ page, request }) => {
  await openOwnedProject(page, request);
  await uploadPhoto(page);
  await page.evaluate(() => {
    const app = (window as unknown as { __ganpanda: { photos: { id: string }[]; project: { addObject(o: unknown): string }; selectObject(id: string, k?: string): void } }).__ganpanda;
    const photoId = app.photos[0].id;
    app.selectObject(app.project.addObject({ photoId, name: '고른 것', shape: 'rect', quad: [[200, 100], [800, 100], [800, 300], [200, 300]], sheetIds: [], productId: 'board-flex', widthMm: 3000, heightMm: 600 }), 'card');
  });
  const panel = page.getByTestId('object-panel');
  await expect(panel).toBeVisible();
  const pb = (await panel.boundingBox())!;
  const vh = page.viewportSize()!.height;
  expect(pb.y + pb.height).toBeLessThan(vh - 100); // 화면 아래까지 늘어나지 않는다
  // 패널 아래 빈 자리는 보드가 받는다
  const below = await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest('[data-testid="object-panel"]') ? 'panel' : 'board', [pb.x + pb.width / 2, vh - 60]);
  expect(below).toBe('board');
});

// 2026-10-19 사용자: "이동을 하는데 최상단의 카드는 내려가지 못하고 중간 카드는 하단으로 이동시 하단카드가 같이 이동한다"
// — 옮긴 적 없는 카드는 '옮긴 카드들 중 가장 아래'의 밑에 자동으로 줄 서서, 한 장을 내리면 나머지가 같이 밀려 내려갔다
test('카드 한 장을 내려도 다른 카드는 제자리 — 맨 위 카드를 다른 카드들 아래로 옮길 수 있다', async ({ page, request }) => {
  await openOwnedProject(page, request);
  await uploadPhoto(page);
  const ids = await page.evaluate(() => {
    const app = (window as unknown as { __ganpanda: { photos: { id: string }[]; project: { addObject(o: unknown): string } } }).__ganpanda;
    const photoId = app.photos[0].id;
    const mk = (n: string, x: number) => app.project.addObject({ photoId, name: n, shape: 'rect', quad: [[x, 100], [x + 200, 100], [x + 200, 300], [x, 300]], sheetIds: [], productId: 'board-flex', widthMm: 6000, heightMm: 1500 });
    return [mk('위', 100), mk('가운데', 400), mk('아래', 700)]; // 가로 6000 → 줄(12000) 하나에 하나씩 세로로 쌓인다
  });
  // 카드 묶음에서 확대 (카드 순서 = 만든 순서: 위·가운데·아래)
  const cards = page.getByTestId('board-card');
  await expect(cards).toHaveCount(3);
  await page.evaluate(() => { const el = document.querySelector('[data-testid="board-canvas"]')!; el.dispatchEvent(new WheelEvent('wheel', { deltaY: 120, clientX: 400, clientY: 150, bubbles: true, cancelable: true })); });
  const placed = () => page.evaluate((ids) => { const a = (window as unknown as { __ganpanda: { flatPlaced: Map<string, { x: number; y: number }> } }).__ganpanda; return ids.map((id) => { const p = a.flatPlaced.get(id)!; return [Math.round(p.x), Math.round(p.y)]; }); }, ids);
  // 실제 자리로 위·가운데·아래를 정한다 (자동 배치 순서는 만든 순서와 다를 수 있다)
  const order = (await placed()).map((p, k) => ({ k, y: p[1] })).sort((a, b) => a.y - b.y).map((x) => x.k);
  ids.splice(0, 3, ...order.map((k) => ids[k]));
  const before = await placed();
  expect(before[1][1]).toBeGreaterThan(before[0][1]); expect(before[2][1]).toBeGreaterThan(before[1][1]); // 위·가운데·아래 순
  const card = (name: string) => page.locator(`[data-testid="board-card"][data-id="${ids[['위', '가운데', '아래'].indexOf(name)]}"]`);
  // 가운데 카드를 아래로 → 아래 카드는 제자리
  const b = (await card('가운데').boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2 + 40, { steps: 5 }); await page.mouse.up();
  let now = await placed();
  expect(now[1][1]).toBeGreaterThan(before[1][1]);
  expect(now[2]).toEqual(before[2]);
  expect(now[0]).toEqual(before[0]);
  // ⌘Z 한 번이면 옮긴 것과 고정이 함께 풀려 처음 그대로 (모두 다시 자동 배치)
  await page.keyboard.press('Meta+z');
  await expect.poll(placed).toEqual(before);
  expect(await page.evaluate((ids) => ids.map((id) => (window as unknown as { __ganpanda: { objects: { id: string; listX?: number }[] } }).__ganpanda.objects.find((o) => o.id === id)!.listX), ids)).toEqual([undefined, undefined, undefined]);
  await page.keyboard.press('Meta+Shift+z'); // 다시 하기
  await expect.poll(async () => (await placed())[1][1]).toBeGreaterThan(before[1][1]);
  // 맨 위 카드를 다른 카드들 아래로
  const t = (await card('위').boundingBox())!, low = (await card('아래').boundingBox())!;
  await page.mouse.move(t.x + t.width / 2, t.y + t.height / 2); await page.mouse.down();
  await page.mouse.move(t.x + t.width / 2, low.y + low.height + t.height, { steps: 8 }); await page.mouse.up();
  now = await placed();
  expect(now[0][1]).toBeGreaterThan(now[2][1]); // 이제 맨 아래
  expect(now[2]).toEqual(before[2]);
});
