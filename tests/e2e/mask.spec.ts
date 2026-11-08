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
