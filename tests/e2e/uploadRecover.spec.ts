// 저장 용량 한도로 못 올린 파일을 다시 올린다 (2026-11-04 사용자: "저장공간이 부족해 사진을 업로드 하지 못했는데 유료로 전환했을때 누락 업로드를 서버로 다시 업로드 필요해")
/* eslint-disable @typescript-eslint/no-explicit-any */
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { SERVER, openOwnedProject, uploadPhoto } from './helpers';

async function blockUploads(page: Page) {
  await page.route('**/api/assets/**', (route) => route.request().method() === 'PUT'
    ? route.fulfill({ status: 413, contentType: 'application/json', body: JSON.stringify({ error: 'storage_limit', limitBytes: 100 * 1024 * 1024, usedBytes: 100 * 1024 * 1024, sizeBytes: 1000 }) })
    : route.continue());
}
const onServer = (request: APIRequestContext, id: string, projectId: string, session: string) =>
  request.head(`${SERVER}/api/assets/${id}?project=${projectId}&session=${session}`).then((r) => r.status());

test('한도에 막힌 사진은 버리지 않고, 요금제가 바뀌면(계정 정보를 다시 받으면) 다시 올린다', async ({ page, request }) => {
  const { session, projectId } = await openOwnedProject(page, request, '다시 올리기');
  await blockUploads(page);
  await uploadPhoto(page);
  await expect(page.getByTestId('notice')).toContainText('저장 용량 한도');
  const id = await page.evaluate(() => (window as any).__ganpanda.photos[0].assetId as string);
  expect(await onServer(request, id, projectId, session)).toBe(404);
  await page.unroute('**/api/assets/**');
  await page.evaluate(() => (window as any).__ganpanda.refreshMe()); // 유료로 바꾼 뒤 앱이 계정 정보를 다시 받을 때
  await expect.poll(() => onServer(request, id, projectId, session), { timeout: 15000 }).toBe(200);
});

test('예전에 한도로 실패해 올릴 목록에서 지워진 사진도, 프로젝트를 열면 기기에 있고 서버에 없는 파일을 찾아 올린다', async ({ page, request }) => {
  const { session, projectId } = await openOwnedProject(page, request, '빠진 파일 찾기');
  await blockUploads(page);
  await uploadPhoto(page);
  await expect(page.getByTestId('notice')).toContainText('저장 용량 한도');
  const id = await page.evaluate(() => (window as any).__ganpanda.photos[0].assetId as string);
  await page.unroute('**/api/assets/**');
  await page.evaluate(() => localStorage.removeItem('ganpanda.pendingAssets')); // 예전 코드처럼 올릴 목록에서 지워진 상태
  await page.reload();
  await expect.poll(() => onServer(request, id, projectId, session), { timeout: 20000 }).toBe(200);
});
