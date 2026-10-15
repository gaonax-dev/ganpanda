import { expect, type APIRequestContext, type Browser, type BrowserContext, type Page } from '@playwright/test';

export const SERVER = 'http://localhost:8787';

/** 단색 테스트 사진 (정면, 1600×1000) */
export async function makePhoto(page: Page): Promise<Buffer> {
  const dataUrl = await page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 1600; c.height = 1000;
    const g = c.getContext('2d')!;
    g.fillStyle = '#d9cfc0'; g.fillRect(0, 0, 1600, 1000);
    g.fillStyle = '#334'; g.fillRect(200, 600, 1200, 400);
    return c.toDataURL('image/png');
  });
  return Buffer.from(dataUrl.split(',')[1], 'base64');
}

export async function uploadPhoto(page: Page) {
  const buffer = await makePhoto(page);
  await page.getByTestId('photo-input').setInputFiles({ name: '정면.png', mimeType: 'image/png', buffer });
  await page.getByTestId('photo-zone').first().waitFor();
}

/** 사진 원본 픽셀 좌표로 드래그 */
export async function dragOnPhoto(page: Page, from: [number, number], to: [number, number]) {
  const img = page.getByTestId('photo-img').first();
  const b = (await img.boundingBox())!;
  const k = b.width / 1600;
  await page.mouse.move(b.x + from[0] * k, b.y + from[1] * k);
  await page.mouse.down();
  await page.mouse.move(b.x + to[0] * k, b.y + to[1] * k, { steps: 6 });
  await page.mouse.up();
}

// ---------- 계정·프로젝트 (서버 API 직접 호출) ----------

const rand = () => Math.random().toString(36).slice(2, 10);

/** 이메일 매직링크로 로그인한 세션 토큰 */
export async function apiLogin(request: APIRequestContext, email = `e2e-${rand()}@example.com`): Promise<string> {
  const r = await request.post(`${SERVER}/api/auth/email`, { data: { email } });
  const token = new URL((await r.json()).link).searchParams.get('token')!;
  const v = await request.post(`${SERVER}/api/auth/verify`, { data: { token } });
  return (await v.json()).session;
}

export async function apiCreateProject(request: APIRequestContext, session: string, name = '테스트 매장'): Promise<string> {
  const r = await request.post(`${SERVER}/api/projects`, { data: { name }, headers: { authorization: `Bearer ${session}` } });
  return (await r.json()).project.id;
}

export async function apiCreateInvite(request: APIRequestContext, session: string, projectId: string, role: 'viewer' | 'editor'): Promise<string> {
  const r = await request.post(`${SERVER}/api/projects/${projectId}/invites`, { data: { role }, headers: { authorization: `Bearer ${session}` } });
  return (await r.json()).url;
}

/** 로그인한 소유자로 새 프로젝트를 열어 둔 페이지 */
export async function openOwnedProject(page: Page, request: APIRequestContext, name = '테스트 매장', displayName = '제작자') {
  const session = await apiLogin(request);
  const projectId = await apiCreateProject(request, session, name);
  await page.goto('/');
  await page.evaluate(([s, n]) => { localStorage.clear(); localStorage.setItem('ganpanda.session', s); localStorage.setItem('ganpanda.nickname', n); }, [session, displayName]);
  await page.goto(`/?room=${projectId}`);
  await expect(page.getByTestId('sync-status')).toHaveAttribute('data-status', 'online');
  return { session, projectId };
}

/** 새 브라우저 컨텍스트에서 초대 링크로 들어온 페이지 */
export async function openInvited(browser: Browser, inviteUrl: string, displayName = '고객'): Promise<Page & { ctx: BrowserContext }> {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto('/');
  await page.evaluate((n) => { localStorage.clear(); localStorage.setItem('ganpanda.nickname', n); }, displayName);
  await page.goto(new URL(inviteUrl).pathname + new URL(inviteUrl).search);
  await expect(page.getByTestId('sync-status')).toHaveAttribute('data-status', 'online');
  return Object.assign(page, { ctx });
}

/** 선택한 사인물의 설정 창 열기 (이미 열려 있으면 그대로) */
/** 패널의 분류 셀렉터로 분류를 고른다. 이미 분류가 있으면 확인 창을 거친다 */
export async function pickCategory(page: Page, g: 'sign' | 'sheet' | 'scashi' | 'foamex' | 'banner' | 'lightpanel' | 'frame' | 'awning' | 'mirror') {
  await page.getByTestId('category-select').selectOption(g);
  const confirm = page.getByTestId('category-confirm-ok');
  if (await confirm.count()) await confirm.click();
}

export async function openObjectSettings(page: Page) {
  if (await page.getByTestId('object-settings').count()) return;
  await page.getByTestId('object-settings-open').click();
  await page.getByTestId('object-settings').waitFor();
}
