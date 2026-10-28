import { test, expect } from '@playwright/test';
import { openOwnedProject } from './helpers';

// 2026-10-29 진단 기록: 아이폰이 웹 화면을 다시 열면(정상 종료 없이 곧 다시 열림) 직전 상태를 보여 주고 복사할 수 있다
test('비정상 종료 뒤 다시 열면 직전 상태를 보여 주고, 닫으면 다시 안 나온다', async ({ page, request }) => {
  await openOwnedProject(page, request);
  await expect(page.getByTestId('crash-notice')).toHaveCount(0);
  // 죽은 것처럼: 깨끗하지 않은 방금 기록
  await page.evaluate(() => localStorage.setItem('ganpanda.crash.live', JSON.stringify({ t: Date.now(), clean: false, state: { board: { stage: '3d', zoom: 0.05, live: 'p1' } }, events: [{ t: Date.now(), msg: '3D 장면 핀볼1 시작' }] })));
  await page.addInitScript(() => { const k = 'ganpanda.crash.live'; const v = sessionStorage.getItem('zz'); if (v) localStorage.setItem(k, v); });
  await page.evaluate(() => sessionStorage.setItem('zz', localStorage.getItem('ganpanda.crash.live')!)); // pagehide 가 깨끗하게 덮어써도 다시 넣는다
  await page.reload();
  const n = page.getByTestId('crash-notice');
  await expect(n).toBeVisible();
  await expect(n).toContainText('3d');
  await expect(n).toContainText('3D 장면 핀볼1 시작');
  await page.evaluate(() => sessionStorage.removeItem('zz'));
  await n.getByTestId('crash-close').click();
  await expect(n).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId('crash-notice')).toHaveCount(0);
});
