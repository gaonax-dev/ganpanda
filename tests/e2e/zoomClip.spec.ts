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
