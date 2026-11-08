// 크게 확대하면 편집 층(SVG)은 보이는 부분만 그린다 (2026-11-04 사용자: "맥 앱에서 줌인을 많이 들어가면 컨트롤로와 글자 해상도가 깨진다" —
// 사진 전체 크기 층이 WebKit 층 상한을 넘어 해상도를 낮춰 그려졌다). 손잡이 자리·끌기는 그대로
/* eslint-disable @typescript-eslint/no-explicit-any */
import { expect, test } from '@playwright/test';
import { openOwnedProject, uploadPhoto } from './helpers';

test('1200% 에서 편집 층은 화면 몇 장 크기로 잘리고, 손잡이는 제자리에서 끌린다. 줌아웃하면 다시 전체', async ({ page, request }) => {
  await page.setViewportSize({ width: 1200, height: 800 });
  await openOwnedProject(page, request, '확대 선명');
  await uploadPhoto(page);
  const ph = await page.evaluate(() => {
    const g = (window as any).__ganpanda, p = g.photos[0];
    g.project.addObject({ photoId: p.id, name: '기준', shape: 'rect', quad: [[700, 400], [900, 400], [900, 500], [700, 500]], sheetIds: [], widthMm: 2000, heightMm: 1000 });
    return { x: p.x, y: p.y, s: p.width / p.w, room: g.room };
  });
  const svg = page.locator('[data-testid="photo-zone"] > svg').first();
  await expect(svg).not.toHaveAttribute('data-clip', /.+/); // 보통 배율에서는 전체
  // 꼭짓점 (700,400) 이 화면 (600,400) 에 오도록 12배로 저장하고 다시 연다
  const Z = 12, wx = ph.x + 700 * ph.s, wy = ph.y + 400 * ph.s;
  await page.evaluate(({ room, v }) => localStorage.setItem('ganpanda.roomView.' + room, JSON.stringify({ viewport: v })), { room: ph.room, v: { x: 600 - wx * Z, y: 400 - wy * Z, zoom: Z } });
  await page.reload();
  await page.evaluate(() => { const g = (window as any).__ganpanda; g.selectObject(g.signs[0].id); });
  await expect(svg).toHaveAttribute('data-clip', /.+/);
  const box = (await svg.boundingBox())!;
  expect(box.width).toBeLessThanOrEqual(1200 * 3 + 2);
  expect(box.height).toBeLessThanOrEqual(800 * 3 + 2);
  // 손잡이 0 (왼쪽 위 꼭짓점) 은 화면 (600,400) 그대로
  const cv = (await page.getByTestId('board-canvas').boundingBox())!; // 보드 화면의 페이지 자리
  const h = page.getByTestId('sign-handle').first();
  const hb = (await h.boundingBox())!;
  const X = cv.x + 600, Y = cv.y + 400;
  expect(Math.abs(hb.x + hb.width / 2 - X)).toBeLessThan(2);
  expect(Math.abs(hb.y + hb.height / 2 - Y)).toBeLessThan(2);
  // 끌면 사진 px 로 정확히 (화면 24px = 사진 24/(12×s) px)
  await page.mouse.move(X, Y); await page.mouse.down(); await page.mouse.move(X + 24, Y + 12, { steps: 4 }); await page.mouse.up();
  const q = await page.evaluate(() => (window as any).__ganpanda.signs[0].quad[0]);
  expect(Math.abs(q[0] - (700 + 24 / (Z * ph.s)))).toBeLessThan(0.5);
  expect(Math.abs(q[1] - (400 + 12 / (Z * ph.s)))).toBeLessThan(0.5);
  // 정보 글자도 보인다
  await expect(page.getByTestId('sign-label').first()).toBeVisible();
});

test('정보 글자(사인물 이름표·존 이름·블록 치수)는 확대되는 보드 밖 화면 층의 HTML 글자 — 확대해도 화면 12px, 외곽선 왼쪽 위 꼭짓점 바로 위 (2026-11-04 맥 앱: 확대하면 보드 층 글자가 뭉개졌다)', async ({ page, request }) => {
  await page.setViewportSize({ width: 1200, height: 800 });
  await openOwnedProject(page, request, '글자 선명');
  await uploadPhoto(page);
  const ph = await page.evaluate(() => {
    const g = (window as any).__ganpanda, p = g.photos[0];
    g.project.addObject({ photoId: p.id, name: '정면간판', shape: 'rect', quad: [[700, 400], [900, 400], [900, 500], [700, 500]], sheetIds: [], widthMm: 3600, heightMm: 600 });
    g.project.updatePhoto(p.id, { blocks: [{ q: [[100, 600], [300, 600], [300, 700], [100, 700]], w: 2000 }] });
    return { x: p.x, y: p.y, s: p.width / p.w, room: g.room };
  });
  for (const Z of [1, 12]) {
    const wx = ph.x + 700 * ph.s, wy = ph.y + 400 * ph.s;
    await page.evaluate(({ room, v }) => localStorage.setItem('ganpanda.roomView.' + room, JSON.stringify({ viewport: v })), { room: ph.room, v: { x: 600 - wx * Z, y: 400 - wy * Z, zoom: Z } });
    await page.reload();
    const label = page.getByTestId('sign-label').first();
    await expect(label).toContainText(/정면간판\s?·\s?3,600×600/);
    const cv0 = (await page.getByTestId('board-canvas').boundingBox())!;
    await expect.poll(async () => Math.abs((await label.boundingBox())!.x - (cv0.x + 600))).toBeLessThan(3); // 다시 연 직후 화면 자리가 자리잡을 때까지
    const info = await label.evaluate((e) => ({ inSvg: !!e.closest('svg'), fs: getComputedStyle(e).fontSize, r: e.getBoundingClientRect() }));
    expect(info.inSvg).toBe(false);
    expect(await label.evaluate((e) => !e.closest('[data-testid="photo-zone"]'))).toBe(true); // 확대되는 보드 층 밖
    expect(info.fs).toBe('12px');
    expect(info.r.height).toBeGreaterThan(10); expect(info.r.height).toBeLessThan(24); // 확대와 상관없이 화면에서 같은 크기
    const cv = (await page.getByTestId('board-canvas').boundingBox())!;
    expect(Math.abs(info.r.left - (cv.x + 600))).toBeLessThan(3); // 왼쪽 = 꼭짓점
    expect(info.r.bottom).toBeLessThanOrEqual(cv.y + 400); expect(info.r.bottom).toBeGreaterThan(cv.y + 400 - 12); // 꼭짓점 바로 위
    if (Z === 1) for (const id of ['block-size']) expect(await page.getByTestId(id).first().evaluate((e) => !e.closest('svg') && !e.closest('[data-testid="photo-zone"]'))).toBe(true); // 보드 밖 화면 층 (1200% 에선 화면 밖이라 그리지 않음)
  }
});

test('맥 WebKit 모드(편집 층을 화면 층에): 외곽선·손잡이 SVG 는 보드 밖에 있고, 손잡이 자리·끌기·고르기는 그대로 (2026-11-04 "외곽선 손잡이 선도 선명하게해줘")', async ({ page, request }) => {
  await page.setViewportSize({ width: 1200, height: 800 });
  await openOwnedProject(page, request, '화면 층 편집');
  await page.evaluate(() => localStorage.setItem('ganpanda.screenCtl', '1')); // 크롬에서 맥 WebKit 경로를 강제
  await uploadPhoto(page);
  const ph = await page.evaluate(() => {
    const g = (window as any).__ganpanda, p = g.photos[0];
    g.project.addObject({ photoId: p.id, name: '기준', shape: 'rect', quad: [[700, 400], [900, 400], [900, 500], [700, 500]], sheetIds: [], widthMm: 2000, heightMm: 1000 });
    return { x: p.x, y: p.y, s: p.width / p.w, room: g.room };
  });
  for (const Z of [1, 12]) {
    const wx = ph.x + 700 * ph.s, wy = ph.y + 400 * ph.s;
    await page.evaluate(({ room, v }) => localStorage.setItem('ganpanda.roomView.' + room, JSON.stringify({ viewport: v })), { room: ph.room, v: { x: 600 - wx * Z, y: 400 - wy * Z, zoom: Z } });
    await page.reload();
    await expect.poll(() => page.evaluate(() => (window as any).__ganpanda.signs.length)).toBe(1);
    await page.evaluate(() => { const g = (window as any).__ganpanda; g.selectObject(g.signs[0].id); });
    const shape = page.getByTestId('sign-shape').first();
    await expect(shape).toBeVisible();
    expect(await shape.evaluate((e) => !e.closest('[data-testid="photo-zone"]') && !!e.closest('[data-testid="screen-controls"]'))).toBe(true);
    // 기대 자리 = 보드 안 사진 그림에서 (700,400) px 의 화면 자리 — 화면 층 편집 층이 보드의 사진과 맞는지 (선택하면 패널 때문에 화면이 옮겨질 수 있어 고정 좌표 대신)
    const expected = () => page.evaluate(() => { const im = document.querySelector('[data-testid="photo-img"]')!.getBoundingClientRect(), p = (window as any).__ganpanda.photos[0]; return { x: im.left + (700 / p.w) * im.width, y: im.top + (400 / p.h) * im.height }; });
    const hpos = async () => { const b = (await page.getByTestId('sign-handle').first().boundingBox())!, e = await expected(); return Math.hypot(b.x + b.width / 2 - e.x, b.y + b.height / 2 - e.y); };
    await expect.poll(hpos).toBeLessThan(2);
    const { x: X, y: Y } = await expected();
    if (Z === 12) {
      await page.mouse.move(X, Y); await page.mouse.down(); await page.mouse.move(X + 24, Y + 12, { steps: 4 }); await page.mouse.up();
      const q = await page.evaluate(() => (window as any).__ganpanda.signs[0].quad[0]);
      expect(Math.abs(q[0] - (700 + 24 / (Z * ph.s)))).toBeLessThan(0.5);
      expect(Math.abs(q[1] - (400 + 12 / (Z * ph.s)))).toBeLessThan(0.5);
    }
  }
  // 사진 ⚙ 메뉴를 열면 편집 층은 사진 칸으로 돌아와 메뉴를 덮지 않고, 닫으면 다시 화면 층으로
  await page.getByTestId('photo-menu').dispatchEvent('click'); // 1200% 라 사진 머리글 단추는 화면 밖 — 단추 동작만
  await expect.poll(() => page.getByTestId('sign-shape').first().evaluate((e) => !!e.closest('[data-testid="photo-zone"]'))).toBe(true);
  await page.getByTestId('photo-menu').dispatchEvent('click'); // 메뉴 목록이 단추를 덮어도 같은 단추로 닫기
  await expect.poll(() => page.getByTestId('sign-shape').first().evaluate((e) => !!e.closest('[data-testid="screen-controls"]'))).toBe(true);
  // 빈 곳을 누르면(사진 위) 선택이 풀린다 — 편집 층이 누르기를 그대로 받는다
  const cv = (await page.getByTestId('board-canvas').boundingBox())!;
  await page.mouse.click(cv.x + 200, cv.y + 650);
  await expect.poll(() => page.evaluate(() => (window as any).__ganpanda.selectedId)).toBeNull();
});
