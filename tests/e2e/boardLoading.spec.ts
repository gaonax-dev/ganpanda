// 사진이 있는 프로젝트를 열 때 동기화 전에 "사진을 올려 시작하세요"가 먼저 보이던 문제 (2026-10-25 사용자: "사진이 이미 있는 프로젝트가 열리면서 사진 없을때 채워지는 내용이 나온다 … ios에서 두드러지는 현상 … 미리 상태를 저장했다가 로딩시 스피너 돌리고 이미지 가져오게")
import { expect, test } from '@playwright/test';
import { openOwnedProject, uploadPhoto } from './helpers';

test('사진이 있던 프로젝트: 서버 동기화가 안 된 동안은 빈 화면 대신 로딩(스피너), 사진이 오면 사진', async ({ page, request }) => {
  const { session, projectId } = await openOwnedProject(page, request, '로딩 매장');
  await uploadPhoto(page);
  await expect(page.getByTestId('photo-img')).toBeVisible();
  await expect.poll(() => page.evaluate((id) => localStorage.getItem(`ganpanda.hadPhotos.${id}`), projectId)).toBe('1'); // 사진이 있었다고 기억
  // 새 탭 상황(로컬 캐시 없음) + 웹소켓 막힘 = 동기화 전
  await page.evaluate(() => indexedDB.databases().then((dbs) => dbs.forEach((d) => d.name && indexedDB.deleteDatabase(d.name))));
  await page.routeWebSocket(/\/rooms\//, () => { /* 연결 안 됨 */ });
  await page.goto(`/?room=${projectId}`);
  await expect(page.getByTestId('board-loading')).toBeVisible();
  await page.waitForTimeout(5000);
  await expect(page.getByTestId('board-loading')).toBeVisible(); // 기억이 있으면 계속 기다린다
  await expect(page.getByTestId('photo-empty')).toHaveCount(0);
  await expect(page.getByTestId('photo-img')).toHaveCount(0);
  await page.unrouteAll({ behavior: 'wait' });
  void session;
});

test('사진이 없던 새 프로젝트: 동기화가 오래 안 되면 빈 화면(사진 추가)을 보여 준다', async ({ page, request }) => {
  const { projectId } = await openOwnedProject(page, request, '빈 매장');
  await page.evaluate(() => indexedDB.databases().then((dbs) => dbs.forEach((d) => d.name && indexedDB.deleteDatabase(d.name))));
  await page.routeWebSocket(/\/rooms\//, () => {});
  await page.goto(`/?room=${projectId}`);
  await expect(page.getByTestId('board-loading')).toBeVisible();
  await expect(page.getByTestId('photo-empty')).toBeVisible({ timeout: 8000 }); // 기억이 없으면 몇 초 뒤 빈 화면
});

test('동기화가 끝나면 로딩이 사라지고 사진 없는 새 프로젝트는 바로 빈 화면', async ({ page, request }) => {
  await openOwnedProject(page, request, '바로 빈');
  await expect(page.getByTestId('photo-empty')).toBeVisible();
  await expect(page.getByTestId('board-loading')).toHaveCount(0);
});
