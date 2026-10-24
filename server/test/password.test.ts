import { describe, expect, it } from 'vitest';
import { exports } from 'cloudflare:workers';

const api = (path: string, init?: RequestInit) => exports.default.fetch('http://sync' + path, init);
const post = (path: string, body: unknown, session?: string) =>
  api(path, { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json', ...(session ? { authorization: `Bearer ${session}` } : {}) } });
const rnd = () => Math.random().toString(36).slice(2, 8);
const tokenOf = async (r: Response) => new URL((await r.json<{ link: string }>()).link).searchParams.get('token')!;
/** 가입 → 인증 메일 링크 → 세션 */
async function signupVerified(email: string, password: string, name?: string) {
  const r = await post('/api/auth/signup', { email, password, name });
  expect(r.status).toBe(202);
  const v = await post('/api/auth/verify', { token: await tokenOf(r) });
  expect(v.status).toBe(200);
  return v.json<{ session: string; account: { email: string; name: string; hasPassword: boolean } }>();
}

describe('이메일·비밀번호 로그인', () => {
  it('가입하면 인증 메일(verify 링크), 인증 전 로그인은 403, 인증하면 세션을 받고 같은 이메일·비밀번호로 로그인된다. 틀리면 401', async () => {
    const email = `pw-${rnd()}@example.com`;
    const s = await post('/api/auth/signup', { email: ` ${email.toUpperCase()} `, password: 'secret-1234', name: '김사장' });
    expect(s.status).toBe(202);
    const { link } = await s.json<{ link: string }>();
    expect(new URL(link).searchParams.get('verify')).toBe('1');
    expect((await post('/api/auth/login', { email, password: 'secret-1234' })).status).toBe(403);
    const v = await post('/api/auth/verify', { token: new URL(link).searchParams.get('token') });
    const signed = await v.json<{ session: string; account: { email: string; name: string; hasPassword: boolean } }>();
    expect(signed.account).toMatchObject({ email, name: '김사장', hasPassword: true });
    const ok = await post('/api/auth/login', { email, password: 'secret-1234' });
    expect(ok.status).toBe(200);
    expect((await ok.json<{ session: string }>()).session).toMatch(/^[A-Za-z0-9_-]{32,}$/);
    expect((await post('/api/auth/login', { email, password: 'wrong-pass' })).status).toBe(401);
    expect((await post('/api/auth/login', { email: `nobody-${rnd()}@example.com`, password: 'secret-1234' })).status).toBe(401);
  });

  it('비밀번호는 8자 이상, 이메일 형식 검사, 이미 가입된 이메일은 409', async () => {
    const email = `pw2-${rnd()}@example.com`;
    expect((await post('/api/auth/signup', { email, password: 'short' })).status).toBe(400);
    expect((await post('/api/auth/signup', { email: 'nope', password: 'secret-1234' })).status).toBe(400);
    await signupVerified(email, 'secret-1234');
    expect((await post('/api/auth/signup', { email, password: 'other-12345' })).status).toBe(409);
  });

  it('메일 링크로 만든 계정(비밀번호 없음)에 가입 시도하면 409, 비밀번호 로그인은 401', async () => {
    const email = `pw3-${rnd()}@example.com`;
    const link = (await (await post('/api/auth/email', { email })).json<{ link: string }>()).link;
    await post('/api/auth/verify', { token: new URL(link).searchParams.get('token') });
    expect((await post('/api/auth/signup', { email, password: 'secret-1234' })).status).toBe(409);
    expect((await post('/api/auth/login', { email, password: 'secret-1234' })).status).toBe(401);
  });

  it('비밀번호 재설정: 메일 링크(reset)로 로그인한 직후에는 현재 비밀번호 없이 새 비밀번호를 정한다', async () => {
    const email = `pw4-${rnd()}@example.com`;
    await signupVerified(email, 'secret-1234');
    const r = await post('/api/auth/email', { email, reset: true });
    const link = new URL((await r.json<{ link: string }>()).link);
    expect(link.searchParams.get('reset')).toBe('1');
    const v = await (await post('/api/auth/verify', { token: link.searchParams.get('token') })).json<{ session: string }>();
    expect((await post('/api/me/password', { password: 'brand-new-99' }, v.session)).status).toBe(200);
    expect((await post('/api/auth/login', { email, password: 'brand-new-99' })).status).toBe(200);
    expect((await post('/api/auth/login', { email, password: 'secret-1234' })).status).toBe(401);
  });

  it('비밀번호 변경: 오래된 세션은 현재 비밀번호가 맞아야 한다', async () => {
    const email = `pw5-${rnd()}@example.com`;
    const { session } = await signupVerified(email, 'secret-1234');
    expect((await post('/api/me/password', { password: 'x' }, session)).status).toBe(400);
    // 가입 직후(새 세션)라도 비밀번호가 이미 있으면 현재 비밀번호를 요구
    expect((await post('/api/me/password', { password: 'next-pass-1' }, session)).status).toBe(403);
    expect((await post('/api/me/password', { password: 'next-pass-1', current: 'wrong-pass' }, session)).status).toBe(403);
    expect((await post('/api/me/password', { password: 'next-pass-1', current: 'secret-1234' }, session)).status).toBe(200);
    expect((await post('/api/auth/login', { email, password: 'next-pass-1' })).status).toBe(200);
  });

  it('남이 먼저 내 이메일로 비밀번호 가입해도, 내가 메일 링크로 들어오면 그 비밀번호는 무효가 된다 (이메일 미확인 가로채기 방지)', async () => {
    const email = `pw6-${rnd()}@example.com`;
    await post('/api/auth/signup', { email, password: 'attacker-123' });
    const link = (await (await post('/api/auth/email', { email })).json<{ link: string }>()).link;
    await post('/api/auth/verify', { token: new URL(link).searchParams.get('token') });
    expect((await post('/api/auth/login', { email, password: 'attacker-123' })).status).toBe(401);
  });

  it('같은 이메일로 10번 틀리면 15분 동안 잠긴다 (429)', async () => {
    const email = `pw7-${rnd()}@example.com`;
    await signupVerified(email, 'secret-1234');
    for (let i = 0; i < 10; i++) expect((await post('/api/auth/login', { email, password: 'wrong-pass' })).status).toBe(401);
    expect((await post('/api/auth/login', { email, password: 'secret-1234' })).status).toBe(429);
  });

  it('/api/me 에 비밀번호 설정 여부', async () => {
    const email = `pw8-${rnd()}@example.com`;
    const { session } = await signupVerified(email, 'secret-1234');
    const me = await (await api('/api/me', { headers: { authorization: `Bearer ${session}` } })).json<{ account: { hasPassword: boolean } }>();
    expect(me.account.hasPassword).toBe(true);
  });

  it('인증 전 다시 가입하면 비밀번호를 덮고 메일을 다시 보낸다 (먼저 걸어 둔 남의 비밀번호는 남지 않음). 인증 메일 다시 받기', async () => {
    const email = `pw9-${rnd()}@example.com`;
    await post('/api/auth/signup', { email, password: 'attacker-123' });
    const r = await post('/api/auth/signup', { email, password: 'owner-pass-1' });
    expect(r.status).toBe(202);
    const again = await post('/api/auth/resend-verify', { email });
    expect(again.status).toBe(202);
    await post('/api/auth/verify', { token: await tokenOf(again) });
    expect((await post('/api/auth/login', { email, password: 'attacker-123' })).status).toBe(401);
    expect((await post('/api/auth/login', { email, password: 'owner-pass-1' })).status).toBe(200);
    // 없는 이메일·이미 인증된 이메일도 202 (가입 여부를 드러내지 않음), 링크는 주지 않음
    const none = await post('/api/auth/resend-verify', { email: `nobody-${rnd()}@example.com` });
    expect(none.status).toBe(202);
    expect((await none.json<{ link?: string }>()).link).toBeUndefined();
  });
});

// 가게 사장 화면에서 이메일 가입·로그인 → 메일 링크가 그 화면으로 돌아온다 (2026-10-24 사용자: "가계사장으로 계정생성했는데 사업자로 등록되었다")
describe('메일 링크의 돌아갈 곳(next)', () => {
  it('가입·메일 로그인에 next(/estimate)를 주면 링크에 붙는다 — 외부 주소·이상한 값은 버린다', async () => {
    const email = `next-${crypto.randomUUID().slice(0, 8)}@example.com`;
    const r = await post('/api/auth/signup', { email, password: 'abcd1234', name: '가게', next: '/estimate' });
    expect(new URL((await r.json<{ link: string }>()).link).searchParams.get('next')).toBe('/estimate');
    const l = await post('/api/auth/email', { email: `n2-${crypto.randomUUID().slice(0, 8)}@example.com`, next: '/estimate' });
    expect(new URL((await l.json<{ link: string }>()).link).searchParams.get('next')).toBe('/estimate');
    for (const bad of ['https://evil.example', '//evil.example', 'estimate', 123]) {
      const b = await post('/api/auth/email', { email: `n3-${crypto.randomUUID().slice(0, 8)}@example.com`, next: bad });
      expect(new URL((await b.json<{ link: string }>()).link).searchParams.get('next')).toBeNull();
    }
  });
});
