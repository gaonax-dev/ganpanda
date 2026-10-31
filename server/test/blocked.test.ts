// 서비스 차단 (2026-10-31 사용자: "법적문제가 있다. 웹에서 접근을 차단한다."): SERVICE_BLOCKED=1 이면 헬스만 빼고 모두 503, 데이터는 그대로
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { env } from 'cloudflare:test';
import { api, ensureAccount, get, login } from './helpers';

const E = env as unknown as { SERVICE_BLOCKED?: string };
let prev: string | undefined;
beforeEach(() => { prev = E.SERVICE_BLOCKED; });
afterEach(() => { E.SERVICE_BLOCKED = prev; });

describe('서비스 차단', () => {
  it('켜지면 /api/me·프로젝트·로그인 요청이 503, 헬스는 그대로', async () => {
    E.SERVICE_BLOCKED = '';
    const s = await login(`blk-${crypto.randomUUID().slice(0, 6)}@example.com`); // 차단 전 세션
    E.SERVICE_BLOCKED = '1';
    const me = await get('/api/me', s);
    expect(me.status).toBe(503);
    expect(me.headers.get('cache-control')).toBe('no-store');
    expect(await me.text()).toBe(''); // 아무 정보도 없다 ("모든 정보를 못보게 해")
    expect((await get('/api/projects', s)).status).toBe(503);
    expect((await api('/api/auth/email', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'x@example.com' }) })).status).toBe(503);
    expect((await api('/api/health')).status).not.toBe(503);
    // 설치한 앱(User-Agent 에 Ganpanda-App/)은 그대로 쓴다
    const app = await api('/api/me', { headers: { authorization: `Bearer ${s}`, 'user-agent': 'Mozilla/5.0 Ganpanda-App/1.0.0' } });
    expect(app.status).toBe(200);
  });
  it('꺼지면 전처럼 — 로그인 없는 /api/me 는 401', async () => {
    E.SERVICE_BLOCKED = '';
    expect((await get('/api/me')).status).toBe(401);
  });

  // 2026-10-31 "로딩 스피너만 돌아": 아이폰 WKWebView 는 WebSocket 핸드셰이크에 앱 UA 토큰을 안 붙인다 → 실시간 동기화 소켓이 503 → 프로젝트가 영영 안 떴다.
  // 앱(UA 토큰)으로 만든·쓴 세션은 "앱 세션"으로 표시하고, 그 세션(?session= / Bearer)이 붙은 요청은 UA 와 상관없이 통과시킨다
  it('앱으로 만든 세션은 UA 없이 와도(소켓) 통과, 브라우저로 만든 세션은 막힌다', async () => {
    E.SERVICE_BLOCKED = '';
    const APP_UA = 'Mozilla/5.0 Ganpanda-App/0.1.0';
    const appEmail = `blk-app-${crypto.randomUUID().slice(0, 6)}@example.com`;
    await ensureAccount(appEmail); // 메일 링크 로그인은 있는 계정만
    const r1 = await api('/api/auth/email', { method: 'POST', headers: { 'content-type': 'application/json', 'user-agent': APP_UA }, body: JSON.stringify({ email: appEmail }) });
    const link = (await r1.json() as { link: string }).link;
    const token = new URL(link).searchParams.get('token')!;
    const v = await api('/api/auth/verify', { method: 'POST', headers: { 'content-type': 'application/json', 'user-agent': APP_UA }, body: JSON.stringify({ token }) });
    const appSession = (await v.json() as { session: string }).session;
    const webSession = await login(`blk-web-${crypto.randomUUID().slice(0, 6)}@example.com`); // 브라우저(UA 토큰 없음)로 만든 세션
    E.SERVICE_BLOCKED = '1';
    // 소켓처럼: UA 토큰 없이 ?session= 만
    expect((await api(`/api/projects?session=${appSession}`)).status).not.toBe(503);
    expect((await api(`/api/projects?session=${webSession}`)).status).toBe(503);
    // Bearer 도 같다
    expect((await get('/api/me', appSession)).status).toBe(200);
    expect((await get('/api/me', webSession)).status).toBe(503);
    // 브라우저로 만든 세션이라도 앱(UA 토큰)에서 한 번 쓰면 앱 세션이 된다 — 지금 로그인된 앱이 끊기지 않게
    E.SERVICE_BLOCKED = '';
    expect((await api('/api/me', { headers: { authorization: `Bearer ${webSession}`, 'user-agent': APP_UA } })).status).toBe(200);
    E.SERVICE_BLOCKED = '1';
    expect((await api(`/api/projects?session=${webSession}`)).status).not.toBe(503);
  });
});

