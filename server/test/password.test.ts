import { beforeEach, describe, expect, it } from 'vitest';
import { env } from 'cloudflare:test';
import { exports } from 'cloudflare:workers';
import { bizInput, ensureAccount, fakeNts } from './helpers';

const api = (path: string, init?: RequestInit) => exports.default.fetch('http://sync' + path, init);
const post = (path: string, body: unknown, session?: string) =>
  api(path, { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json', ...(session ? { authorization: `Bearer ${session}` } : {}) } });
const rnd = () => Math.random().toString(36).slice(2, 8);
const tokenOf = async (r: Response) => new URL((await r.json<{ link: string }>()).link).searchParams.get('token')!;
beforeEach(() => fakeNts());
/** 가입(사업자 확인 포함) → 인증 메일 링크 → 세션 */
async function signupVerified(email: string, password: string, name?: string) {
  const r = await post('/api/auth/signup', { email, password, name, business: bizInput() });
  expect(r.status).toBe(202);
  const v = await post('/api/auth/verify', { token: await tokenOf(r) });
  expect(v.status).toBe(200);
  return v.json<{ session: string; account: { email: string; name: string; hasPassword: boolean } }>();
}

describe('이메일·비밀번호 로그인', () => {
  it('가입하면 인증 메일(verify 링크), 인증 전 로그인은 403, 인증하면 세션을 받고 같은 이메일·비밀번호로 로그인된다. 틀리면 401', async () => {
    const email = `pw-${rnd()}@example.com`;
    const s = await post('/api/auth/signup', { email: ` ${email.toUpperCase()} `, password: 'secret-1234', name: '김사장', business: bizInput() });
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
    expect((await post('/api/auth/signup', { email, password: 'short', business: bizInput() })).status).toBe(400);
    expect((await post('/api/auth/signup', { email: 'nope', password: 'secret-1234', business: bizInput() })).status).toBe(400);
    await signupVerified(email, 'secret-1234');
    expect((await post('/api/auth/signup', { email, password: 'other-12345', business: bizInput() })).status).toBe(409);
  });

  it('메일 링크로 만든 계정(비밀번호 없음)에 가입 시도하면 409, 비밀번호 로그인은 401', async () => {
    const email = `pw3-${rnd()}@example.com`;
    await ensureAccount(email); // 메일 링크는 이미 있는 계정만
    const link = (await (await post('/api/auth/email', { email })).json<{ link: string }>()).link;
    await post('/api/auth/verify', { token: new URL(link).searchParams.get('token') });
    expect((await post('/api/auth/signup', { email, password: 'secret-1234', business: bizInput() })).status).toBe(409);
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
    await post('/api/auth/signup', { email, password: 'attacker-123', business: bizInput() });
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
    await post('/api/auth/signup', { email, password: 'attacker-123', business: bizInput() });
    const r = await post('/api/auth/signup', { email, password: 'owner-pass-1', business: bizInput() });
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
    const r = await post('/api/auth/signup', { email, password: 'abcd1234', name: '가게', next: '/estimate', business: bizInput() });
    expect(new URL((await r.json<{ link: string }>()).link).searchParams.get('next')).toBe('/estimate');
    const n2 = `n2-${crypto.randomUUID().slice(0, 8)}@example.com`;
    await ensureAccount(n2);
    const l = await post('/api/auth/email', { email: n2, next: '/estimate' });
    expect(new URL((await l.json<{ link: string }>()).link).searchParams.get('next')).toBe('/estimate');
    for (const bad of ['https://evil.example', '//evil.example', 'estimate', 123]) {
      const n3 = `n3-${crypto.randomUUID().slice(0, 8)}@example.com`;
      await ensureAccount(n3);
      const b = await post('/api/auth/email', { email: n3, next: bad });
      expect(new URL((await b.json<{ link: string }>()).link).searchParams.get('next')).toBeNull();
    }
  });
});

// 이메일 가입은 간판집·가게 사장 모두 사업자 확인 (2026-10-24 사용자: "이메일 가입시에는 가판집, 가게사장 모두 사업자 등록증 확인"). 카카오는 그대로
describe('이메일 가입 = 사업자 확인', () => {
  it('사업자 없이 가입하면 400 business_required, 틀린 대표자 400 mismatch, 번호 형식 400 bad_input — 계정은 안 생긴다', async () => {
    const email = `biz-${rnd()}@example.com`;
    const r = await post('/api/auth/signup', { email, password: 'abcd1234' });
    expect(r.status).toBe(400);
    expect((await r.json<{ error: string }>()).error).toBe('business_required');
    const m = await post('/api/auth/signup', { email, password: 'abcd1234', business: { ...bizInput(), ownerName: '김철수' } });
    expect([m.status, (await m.json<{ error: string }>()).error]).toEqual([400, 'mismatch']);
    const b = await post('/api/auth/signup', { email, password: 'abcd1234', business: { ...bizInput(), no: '123-45-67890' } });
    expect([b.status, (await b.json<{ error: string }>()).error]).toEqual([400, 'bad_input']);
    expect(await env.DB.prepare('SELECT id FROM accounts WHERE email = ?').bind(email).first()).toBeNull();
  });

  it('확인되면 인증 메일 → 인증하면 그 계정에 사업자가 붙어 있다', async () => {
    const biz = bizInput();
    const r = await post('/api/auth/signup', { email: `biz2-${rnd()}@example.com`, password: 'abcd1234', business: { ...biz, address: '경기 광주시 오포읍' } });
    expect(r.status).toBe(202);
    const v = await (await post('/api/auth/verify', { token: await tokenOf(r) })).json<{ session: string }>();
    const me = await (await api('/api/me', { headers: { authorization: `Bearer ${v.session}` } })).json<{ business: { no: string; name: string; address: string } }>();
    expect(me.business).toMatchObject({ no: biz.no, name: '테스트 상회', address: '경기 광주시 오포읍' });
  });

  it('인증까지 마친 계정의 번호면 409 taken. 인증 안 된 가입이 잡아 둔 번호는 다음 가입이 가져간다 (번호 묶어 두기 방지)', async () => {
    const biz = bizInput();
    await signupVerifiedWith(`own-${rnd()}@example.com`, biz);
    const t = await post('/api/auth/signup', { email: `thief-${rnd()}@example.com`, password: 'abcd1234', business: biz });
    expect([t.status, (await t.json<{ error: string }>()).error]).toEqual([409, 'taken']);
    const free = bizInput();
    await post('/api/auth/signup', { email: `squat-${rnd()}@example.com`, password: 'abcd1234', business: free }); // 인증 안 함
    const real = `real-${rnd()}@example.com`;
    const s = await signupVerifiedWith(real, free);
    const me = await (await api('/api/me', { headers: { authorization: `Bearer ${s}` } })).json<{ business: { no: string } }>();
    expect(me.business.no).toBe(free.no);
  });

  it('메일 링크 로그인·재설정은 이미 있는 계정만 — 처음 보는 이메일은 404 no_account (가입으로)', async () => {
    for (const reset of [false, true]) {
      const r = await post('/api/auth/email', { email: `new-${rnd()}@example.com`, reset });
      expect([r.status, (await r.json<{ error: string }>()).error]).toEqual([404, 'no_account']);
    }
  });
});

async function signupVerifiedWith(email: string, business: ReturnType<typeof bizInput>) {
  const r = await post('/api/auth/signup', { email, password: 'abcd1234', business });
  expect(r.status).toBe(202);
  return (await (await post('/api/auth/verify', { token: await tokenOf(r) })).json<{ session: string }>()).session;
}
