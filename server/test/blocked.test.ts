// 서비스 차단 (2026-10-31 사용자: "법적문제가 있다. 웹에서 접근을 차단한다."): SERVICE_BLOCKED=1 이면 헬스만 빼고 모두 503, 데이터는 그대로
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { env } from 'cloudflare:test';
import { api, get, login } from './helpers';

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
    expect(await me.text()).toContain('일시 중단');
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
});
