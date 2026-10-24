import { beforeAll, describe, expect, it, vi } from 'vitest';
import { env } from 'cloudflare:test';
import { handleAuth } from '../src/auth';
import { ensureAccount } from './helpers';

beforeAll(async () => { for (const e of ['maker@example.com', 'x@example.com', 'fail@example.com']) await ensureAccount(e); });

const req = (email: string) =>
  new Request('http://sync/api/auth/email', { method: 'POST', body: JSON.stringify({ email }), headers: { 'content-type': 'application/json' } });

describe('매직링크 이메일 발송 (운영 경로: AUTH_DEV_LINK 없음)', () => {
  it('EMAIL 바인딩으로 보내고 링크는 응답에 넣지 않는다', async () => {
    const send = vi.fn(async (_m: unknown) => ({ messageId: 'm1' }));
    const e = { ...env, AUTH_DEV_LINK: '', APP_URL: 'https://ganpanda.co.kr', EMAIL: { send } } as unknown as Env;
    const r = await handleAuth(req('maker@example.com'), e, '/api/auth/email');
    expect(r.status).toBe(202);
    expect(JSON.stringify(await r.json())).not.toContain('token=');
    expect(send).toHaveBeenCalledTimes(1);
    const msg = send.mock.calls[0][0] as unknown as { to: string; from: { email: string; name: string }; subject: string; text: string; html: string };
    expect(msg.to).toBe('maker@example.com');
    expect(msg.from.email).toBe('login@ganpanda.co.kr');
    expect(msg.from.name).toBe('간판다');
    expect(msg.subject).toContain('로그인');
    expect(msg.text).toMatch(/https:\/\/ganpanda\.co\.kr\/login\?token=[A-Za-z0-9_-]{32,}/);
    expect(msg.html).toContain('/login?token=');
    expect(msg.text).toContain('15분');
  });

  it('바인딩이 없으면 503 (설정 안 됨)', async () => {
    const e = { ...env, AUTH_DEV_LINK: '', EMAIL: undefined } as unknown as Env;
    expect((await handleAuth(req('x@example.com'), e, '/api/auth/email')).status).toBe(503);
  });

  it('발송이 실패하면 502 와 함께 이유를 로그로 남기고, 토큰은 폐기한다', async () => {
    const send = vi.fn(async (_m: unknown) => { throw Object.assign(new Error('boom'), { code: 'E_RATE_LIMIT_EXCEEDED' }); });
    const e = { ...env, AUTH_DEV_LINK: '', EMAIL: { send } } as unknown as Env;
    const r = await handleAuth(req('fail@example.com'), e, '/api/auth/email');
    expect(r.status).toBe(502);
    const rows = await env.DB.prepare('SELECT used_at FROM login_tokens WHERE email = ?').bind('fail@example.com').all<{ used_at: number | null }>();
    expect(rows.results.every((x) => x.used_at !== null)).toBe(true);
  });
});
