import { expect, test } from '@playwright/test';
import { openOwnedProject, uploadPhoto } from './helpers';

test('로딩 표시: 정적 스플래시는 앱이 붙으면 사라지고, 방에 들어갈 때 로딩이 보였다가 사라진다. 무거운 창은 열 때 따로 내려받으며 로딩을 보여 준다', async ({ page, request }) => {
  await openOwnedProject(page, request);
  await expect(page.locator('#splash')).toHaveCount(0);
  await expect(page.getByTestId('loading')).toHaveCount(0); // 준비 끝
  await uploadPhoto(page);
  // 렌더링 창: 처음 열면 three.js 청크를 받는 동안 로딩 → 창
  await page.getByTestId('render-open').click();
  await expect(page.getByTestId('render-dialog')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('loading')).toHaveCount(0);
  await page.getByTestId('close-render').click();
  // 새로 열면 방 확인 → 문서 불러오기 로딩이 지나간다 (느린 네트워크를 흉내 내 잡아 본다)
  await page.route('**/api/projects/*/access*', async (route) => { await new Promise((r) => setTimeout(r, 800)); await route.continue(); });
  const url = page.url();
  await page.goto(url);
  await expect(page.getByTestId('loading')).toContainText('프로젝트 확인 중');
  await expect(page.getByTestId('sync-status')).toHaveAttribute('data-status', 'online');
  await expect(page.getByTestId('loading')).toHaveCount(0);
});
