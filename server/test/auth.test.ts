import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:test';
import { exports } from 'cloudflare:workers';
import { ensureAccount } from './helpers';

const api = (path: string, init?: RequestInit) => exports.default.fetch('http://sync' + path, init);
const json = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  api(path, { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json', ...headers } });

/** 매직링크 요청 → 링크의 토큰으로 검증 → 세션 토큰 */
async function login(email: string) {
  await ensureAccount(email);
  const r = await json('/api/auth/email', { email });
  expect(r.status).toBe(202);
  const { link } = await r.json<{ link: string }>();
  const token = new URL(link).searchParams.get('token')!;
  const v = await json('/api/auth/verify', { token });
  expect(v.status).toBe(200);
  return v.json<{ session: string; account: { id: string; email: string; plan: string } }>();
}

describe('이메일 매직링크 로그인', () => {
  it('이메일 형식이 아니면 400', async () => {
    expect((await json('/api/auth/email', { email: 'not-an-email' })).status).toBe(400);
    expect((await json('/api/auth/email', {})).status).toBe(400);
  });

  it('요청하면 202, 개발 모드에서는 앱 주소로 가는 링크를 돌려준다', async () => {
    await ensureAccount('maker@example.com');
    const r = await json('/api/auth/email', { email: 'Maker@Example.com ' });
    expect(r.status).toBe(202);
    const { link } = await r.json<{ link: string }>();
    const u = new URL(link);
    expect(u.origin).toBe('http://localhost:5199');
    expect(u.pathname).toBe('/login');
    expect(u.searchParams.get('token')).toMatch(/^[A-Za-z0-9_-]{32,}$/);
  });

  it('링크를 검증하면 계정이 만들어지고 세션을 받는다 (이메일은 소문자·공백 제거)', async () => {
    const { session, account } = await login('Maker@Example.com ');
    expect(account.email).toBe('maker@example.com');
    expect(account.plan).toBe('free');
    expect(session).toMatch(/^[A-Za-z0-9_-]{32,}$/);
    const me = await api('/api/me', { headers: { authorization: `Bearer ${session}` } });
    expect(me.status).toBe(200);
    expect((await me.json<{ account: { email: string } }>()).account.email).toBe('maker@example.com');
  });

  it('같은 이메일로 다시 로그인하면 같은 계정', async () => {
    const a = await login('same@example.com');
    const b = await login('same@example.com');
    expect(b.account.id).toBe(a.account.id);
  });

  it('링크는 한 번만 쓸 수 있다 (재사용 410)', async () => {
    await ensureAccount('once@example.com');
    const r = await json('/api/auth/email', { email: 'once@example.com' });
    const token = new URL((await r.json<{ link: string }>()).link).searchParams.get('token')!;
    expect((await json('/api/auth/verify', { token })).status).toBe(200);
    expect((await json('/api/auth/verify', { token })).status).toBe(410);
  });

  it('만료된 링크는 410, 없는 토큰은 404', async () => {
    await ensureAccount('late@example.com');
    const r = await json('/api/auth/email', { email: 'late@example.com' });
    const token = new URL((await r.json<{ link: string }>()).link).searchParams.get('token')!;
    await env.DB.prepare('UPDATE login_tokens SET expires_at = ?').bind(Date.now() - 1000).run();
    expect((await json('/api/auth/verify', { token })).status).toBe(410);
    expect((await json('/api/auth/verify', { token: 'x'.repeat(43) })).status).toBe(404);
  });

  it('세션 토큰은 해시로만 저장된다', async () => {
    const { session } = await login('hash@example.com');
    const rows = await env.DB.prepare('SELECT token_hash FROM sessions').all<{ token_hash: string }>();
    expect(rows.results.some((r) => r.token_hash === session)).toBe(false);
    expect(rows.results[0].token_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('토큰이 없거나 틀리면 /api/me 는 401', async () => {
    expect((await api('/api/me')).status).toBe(401);
    expect((await api('/api/me', { headers: { authorization: 'Bearer wrong' } })).status).toBe(401);
  });

  it('로그아웃하면 세션이 사라진다', async () => {
    const { session } = await login('bye@example.com');
    const h = { authorization: `Bearer ${session}` };
    expect((await api('/api/auth/logout', { method: 'POST', headers: h })).status).toBe(204);
    expect((await api('/api/me', { headers: h })).status).toBe(401);
  });

  it('이름을 바꿀 수 있다', async () => {
    const { session } = await login('name@example.com');
    const h = { authorization: `Bearer ${session}` };
    const r = await api('/api/me', { method: 'PATCH', body: JSON.stringify({ name: '  간판다 사장님 ' }), headers: { ...h, 'content-type': 'application/json' } });
    expect(r.status).toBe(200);
    expect((await (await api('/api/me', { headers: h })).json<{ account: { name: string } }>()).account.name).toBe('간판다 사장님');
  });
});
