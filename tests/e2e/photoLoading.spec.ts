// 사진 파일이 내려오는 동안의 표시 (2026-10-25 사용자: "이미지 로딩이 표시되지 않는다" — 글자가 보드 축척을 따라 줄어 휴대폰 배율에선 안 보였다)
import { expect, test } from '@playwright/test';
import { apiLogin, openOwnedProject, uploadPhoto } from './helpers';

test('사진 파일을 못 받는 동안 사진 자리에 화면 크기의 스피너가 보인다 (보드를 축소해도)', async ({ page, browser, request }) => {
  const { session, projectId } = await openOwnedProject(page, request, '로딩 표시');
  await uploadPhoto(page);
  await expect(page.getByTestId('photo-img')).toBeVisible();
  await page.waitForTimeout(1500); // 서버에 올라가게
  // 다른 기기(캐시 없음) + 사진 파일 요청만 막힘
  const ctx = await browser.newContext();
  const p2 = await ctx.newPage();
  await p2.route(/\/api\/assets\//, (r) => new Promise(() => void r)); // 영원히 대기
  await p2.goto('/');
  await p2.evaluate((s) => { localStorage.clear(); localStorage.setItem('ganpanda.session', s); localStorage.setItem('ganpanda.touchHelp', 'off'); }, session);
  await p2.goto(`/?room=${projectId}`);
  const loading = p2.getByTestId('photo-loading').first();
  await expect(loading).toBeVisible({ timeout: 15_000 });
  await expect(p2.getByTestId('photo-img')).toHaveCount(0);
  // 보드를 많이 축소해도 스피너는 화면 크기로 (20px 이상)
  await p2.evaluate(() => { const el = document.querySelector('[data-testid="board-canvas"]')!; for (let i = 0; i < 8; i++) el.dispatchEvent(new WheelEvent('wheel', { deltaY: 120, clientX: 500, clientY: 300, bubbles: true, cancelable: true })); });
  const b = (await loading.getByTestId('photo-loading-spin').boundingBox())!;
  expect(b.width).toBeGreaterThanOrEqual(20);
  await ctx.close();
  void apiLogin;
});
