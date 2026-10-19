import { expect, test, type APIRequestContext, type Browser, type Page } from '@playwright/test';
import { SERVER, apiCreateInvite, apiCreateProject, apiLogin, apiSetPlan, makePhoto, openInvited } from './helpers';

// 2026-10-19 사용자: "모바일에서 카메라로 촬영하고 나서 프로젝트로 올라오는 시간이 너무 오래 걸린다. 우선 내부에서 가져다 쓰고 캐시에 가지고 있고 캐시가 없어지면 그때 서버에서"
async function newRoom(request: APIRequestContext) {
  const session = await apiLogin(request);
  await apiSetPlan(request, session, 'basic');
  const projectId = await apiCreateProject(request, session);
  return { session, projectId, invite: await apiCreateInvite(request, session, projectId, 'editor') };
}
async function owner(browser: Browser, room: Awaited<ReturnType<typeof newRoom>>): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.goto('/');
  await page.evaluate(([s]) => { localStorage.setItem('ganpanda.session', s); localStorage.setItem('ganpanda.nickname', '현장'); }, [room.session]);
  await page.goto(`/?room=${room.projectId}`);
  await expect(page.getByTestId('sync-status')).toHaveAttribute('data-status', 'online');
  return page;
}
const imgLoaded = (page: Page) => page.getByTestId('photo-img').first().evaluate((i) => (i as HTMLImageElement).complete && (i as HTMLImageElement).naturalWidth > 0);

test('서버 업로드가 느려도 사진은 바로 보드에 올라오고, 다른 기기는 업로드가 끝나면 받아 보인다', async ({ browser, request }) => {
  test.setTimeout(90_000);
  const room = await newRoom(request);
  const phone = await owner(browser, room);
  // 서버 업로드(PUT)를 6초 늦춘다 — 휴대폰 데이터
  let uploaded = false;
  await phone.route('**/api/assets/**', async (route) => {
    if (route.request().method() === 'PUT') { await new Promise((r) => setTimeout(r, 6000)); const res = await route.fetch(); uploaded = res.ok(); await route.fulfill({ response: res }); return; }
    await route.continue();
  });
  const office = await openInvited(browser, room.invite, '사무실');
  const t0 = Date.now();
  await phone.getByTestId('photo-input').setInputFiles({ name: '촬영.png', mimeType: 'image/png', buffer: await makePhoto(phone) });
  await expect(phone.getByTestId('photo-img')).toHaveCount(1, { timeout: 4000 });
  await expect.poll(() => imgLoaded(phone), { timeout: 4000 }).toBe(true);
  expect(Date.now() - t0).toBeLessThan(5000); // 업로드(6초)를 기다리지 않았다
  expect(uploaded).toBe(false);
  // 다른 기기: 사진 자리는 바로 생기고(문서 동기화), 업로드가 끝나면 그림을 받는다 (404 를 재시도)
  await expect(office.getByTestId('photo-zone')).toHaveCount(1, { timeout: 5000 });
  await expect.poll(() => uploaded, { timeout: 15_000 }).toBe(true);
  await expect.poll(() => imgLoaded(office), { timeout: 40_000 }).toBe(true);
});

test('업로드 전에 앱을 닫아도 다음에 그 프로젝트를 열면 이어서 올린다', async ({ browser, request }) => {
  const room = await newRoom(request);
  const phone = await owner(browser, room);
  await phone.route('**/api/assets/**', (route) => (route.request().method() === 'PUT' ? route.abort() : route.continue())); // 올리기 실패
  await phone.getByTestId('photo-input').setInputFiles({ name: '촬영.png', mimeType: 'image/png', buffer: await makePhoto(phone) });
  await expect(phone.getByTestId('photo-img')).toHaveCount(1);
  const id = await phone.evaluate(() => (window as unknown as { __ganpanda: { photos: { assetId: string }[] } }).__ganpanda.photos[0].assetId);
  await expect.poll(() => phone.evaluate(() => localStorage.getItem('ganpanda.pendingAssets') ?? '')).toContain(id); // 올릴 목록에 기억
  await phone.unroute('**/api/assets/**');
  await phone.reload();
  await expect(phone.getByTestId('sync-status')).toHaveAttribute('data-status', 'online');
  await expect.poll(async () => (await request.head(`${SERVER}/api/assets/${id}?project=${room.projectId}&session=${room.session}`)).status(), { timeout: 15_000 }).toBe(200);
  await expect.poll(() => phone.evaluate(() => localStorage.getItem('ganpanda.pendingAssets') ?? '')).not.toContain(id);
});
