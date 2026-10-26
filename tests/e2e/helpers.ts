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

/** 사진 원본 픽셀 좌표를 누른다 (다각형 그리기 등) */
export async function clickOnPhoto(page: Page, at: [number, number]) {
  const b = (await page.getByTestId('photo-img').first().boundingBox())!;
  const k = b.width / 1600;
  await page.mouse.click(b.x + at[0] * k, b.y + at[1] * k);
}

// ---------- 계정·프로젝트 (서버 API 직접 호출) ----------

const rand = () => Math.random().toString(36).slice(2, 10);

/** 9자리 + 검증 자릿수 = 유효한 사업자등록번호 (하이픈 없이) */
export const bizNo = (nine = String(100000000 + Math.floor(Math.random() * 800000000))) => { const w = [1, 3, 7, 1, 3, 7, 1, 3, 5]; let sum = 0; for (let i = 0; i < 9; i++) sum += Number(nine[i]) * w[i]; sum += Math.floor((Number(nine[8]) * 5) / 10); return nine + String((10 - (sum % 10)) % 10); };
/** 이메일 가입용 사업자 (로컬 가짜 국세청: 대표자 '홍길동' = 일치) — 2026-10-24 이메일 가입은 사업자 확인 */
export const bizInput = () => ({ no: bizNo(), ownerName: '홍길동', startDate: '2020-01-05', name: '테스트 상회' });

/** 이메일 가입(사업자 확인) → 인증 링크 → 세션. keepBusiness 가 아니면 사업자는 떼어 예전처럼 "사업자 없는 계정" */
export async function apiSignup(request: APIRequestContext, email = `e2e-${rand()}@example.com`, keepBusiness = false): Promise<string> {
  const r = await request.post(`${SERVER}/api/auth/signup`, { data: { email, password: 'e2e-pass-1', business: bizInput() } });
  if (r.status() !== 202) throw new Error(`signup failed ${r.status()} ${await r.text()}`);
  const token = new URL((await r.json()).link).searchParams.get('token')!;
  const session = (await (await request.post(`${SERVER}/api/auth/verify`, { data: { token } })).json()).session as string;
  if (!keepBusiness) await request.delete(`${SERVER}/api/me/business`, { headers: { authorization: `Bearer ${session}` } });
  return session;
}

/** 로그인한 세션 토큰 — 이미 있는 계정은 메일 링크로, 처음이면 가입(메일 링크는 새 계정을 만들지 않는다, 2026-10-24) */
export async function apiLogin(request: APIRequestContext, email = `e2e-${rand()}@example.com`): Promise<string> {
  const r = await request.post(`${SERVER}/api/auth/email`, { data: { email } });
  if (r.status() === 404) return apiSignup(request, email);
  const token = new URL((await r.json()).link).searchParams.get('token')!;
  const v = await request.post(`${SERVER}/api/auth/verify`, { data: { token } });
  return (await v.json()).session;
}

/** 가입 창의 사업자 칸 채우기 */
export async function fillSignupBusiness(page: Page, b = bizInput()) {
  await page.getByTestId('biz-no').fill(b.no);
  await page.getByTestId('biz-owner').fill(b.ownerName);
  await page.getByTestId('biz-start').fill(b.startDate);
  await page.getByTestId('biz-name').fill(b.name);
}

export async function apiCreateProject(request: APIRequestContext, session: string, name = '테스트 매장'): Promise<string> {
  const r = await request.post(`${SERVER}/api/projects`, { data: { name }, headers: { authorization: `Bearer ${session}` } });
  return (await r.json()).project.id;
}

export async function apiCreateInvite(request: APIRequestContext, session: string, projectId: string, role: 'viewer' | 'editor'): Promise<string> {
  const r = await request.post(`${SERVER}/api/projects/${projectId}/invites`, { data: { role }, headers: { authorization: `Bearer ${session}` } });
  return (await r.json()).url;
}

/** 요금제 바꾸기 (개발 모드 전용 API). 소유자와 직원(editor)이 함께 접속하는 테스트는 베이직(2명) 이상이 필요하다 (2026-10-17: 무료 = 1명) */
export async function apiSetPlan(request: APIRequestContext, session: string, plan: 'free' | 'basic' | 'pro') {
  const r = await request.put(`${SERVER}/api/me/plan`, { data: { plan }, headers: { authorization: `Bearer ${session}` } });
  if (!r.ok()) throw new Error(`set plan failed ${r.status()}`);
}

/** 로그인한 소유자로 새 프로젝트를 열어 둔 페이지 */
export async function openOwnedProject(page: Page, request: APIRequestContext, name = '테스트 매장', displayName = '제작자') {
  const session = await apiLogin(request);
  const projectId = await apiCreateProject(request, session, name);
  await page.goto('/');
  await page.evaluate(([s, n]) => { localStorage.clear(); localStorage.setItem('ganpanda.session', s); localStorage.setItem('ganpanda.nickname', n); localStorage.setItem('ganpanda.touchHelp', 'off'); }, [session, displayName]); // 휴대폰 조작 안내는 끈 채로 (tests/e2e/touchHelp.spec.ts 에서 따로)
  await page.goto(`/?room=${projectId}`);
  await expect(page.getByTestId('sync-status')).toHaveAttribute('data-status', 'online');
  return { session, projectId };
}

/** 새 브라우저 컨텍스트에서 초대 링크로 들어온 페이지 */
export async function openInvited(browser: Browser, inviteUrl: string, displayName = '고객', session?: string): Promise<Page & { ctx: BrowserContext }> {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto('/');
  await page.evaluate(([n, s]) => { localStorage.clear(); localStorage.setItem('ganpanda.nickname', n); localStorage.setItem('ganpanda.touchHelp', 'off'); if (s) localStorage.setItem('ganpanda.session', s); }, [displayName, session ?? ''] as const);
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
  // 첫 화면은 단면 쌓기(2026-10-22 재료 조합 S1) — 예전 테스트는 예전 첫 탭(몸통, 몸통 없으면 첫 구성 요소)에서 시작
  const dlg = page.getByTestId('object-settings');
  if (await dlg.getByTestId('quick-stack').count()) {
    if (await dlg.getByTestId('quick-body').count()) await dlg.getByTestId('quick-body').click();
    else if (await dlg.getByTestId('quick-part').count()) await dlg.getByTestId('quick-part').first().click();
  }
}

/** 사진 등록 즉시 자동 원근(2026-10-19)을 끈다 — "원근 없는 사진"을 시험하는 테스트용. 읽는 중이어도 끔(autoCamera false)이 이긴다 */
export async function clearAutoCamera(page: Page) {
  await page.evaluate(() => { const a = (window as unknown as { __ganpanda: { photos: { id: string }[]; clearCamera(id: string): void } }).__ganpanda; for (const p of a.photos) a.clearCamera(p.id); });
}

/** 설정 창 열기 — 로그인하면 ⚙ 는 닉네임 메뉴 안 (2026-10-22), 로그인 전에는 상단 */
export async function openSettings(page: Page) {
  await expect(page.getByTestId('account-menu').or(page.getByTestId('login-button')).first()).toBeVisible(); // 계정 확인이 끝난 뒤 판단
  await expect(async () => {
    if (await page.getByTestId('account-menu').isVisible() && !(await page.getByTestId('account-menu-list').isVisible())) await page.getByTestId('account-menu').click();
    await page.getByTestId('open-settings').click({ timeout: 2000 });
  }).toPass({ timeout: 15_000 });
}
