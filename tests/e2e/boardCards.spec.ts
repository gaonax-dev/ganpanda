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
  // 리스트 뷰의 카드가 그 자리에 (world mm = listX/listY)
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
  expect(svg).toContain('정면 간판');
  expect(svg).toContain('>3,000<');
  expect(svg).toContain('프레임 간판 (후렉스)');
  await w.close();
});
