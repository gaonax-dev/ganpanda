import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { env } from 'cloudflare:test';
import { handleSocial, setOauthFetch } from '../src/social';
import { appleClientSecret, signJwt, verifyJwtRS256, pemFromPkcs8 } from '../src/oauth/jwt';
import { api, get, login } from './helpers';


/** 테스트용 애플 서명 키(P-256)와 id_token 서명용 RSA 키 */
let applePem = '';
let rsa: CryptoKeyPair;
let rsaJwk: JsonWebKey & { kid: string };
beforeAll(async () => {
  const ec = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])) as CryptoKeyPair;
  applePem = pemFromPkcs8((await crypto.subtle.exportKey('pkcs8', ec.privateKey)) as ArrayBuffer);
  rsa = (await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify'])) as CryptoKeyPair;
  rsaJwk = { ...((await crypto.subtle.exportKey('jwk', rsa.publicKey)) as JsonWebKey), kid: 'apple-k1', use: 'sig', alg: 'RS256' } as JsonWebKey & { kid: string };
});
/** 외부 공급자 가짜 서버: (method, url) → 응답. 등록되지 않은 호출은 실패 */
type Route = { method?: string; url: string; status?: number; body: unknown };
let routes: Route[] = [];
const mock = (url: string, body: unknown, status = 200, method?: string) => routes.push({ url, body, status, method });
beforeEach(() => {
  routes = [];
  setOauthFetch(async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const method = (init?.method ?? 'GET').toUpperCase();
    const r = routes.find((x) => url.startsWith(x.url) && (!x.method || x.method === method));
    if (!r) throw new Error('unexpected outbound call ' + method + ' ' + url);
    return Response.json(r.body, { status: r.status ?? 200 });
  });
});

const startAndState = async (provider: string, next = '/') => {
  const r = await api(`/api/auth/${provider}/start?next=${encodeURIComponent(next)}`, { redirect: 'manual' });
  expect(r.status).toBe(302);
  const loc = new URL(r.headers.get('location')!);
  return { loc, state: loc.searchParams.get('state')! };
};
const sessionFromRedirect = (r: Response) => {
  expect(r.status).toBe(302);
  const loc = r.headers.get('location')!;
  expect(loc.startsWith('http://localhost:5199/login#')).toBe(true);
  return new URLSearchParams(loc.split('#')[1]);
};
const meOf = async (session: string) => (await (await get('/api/me', session)).json<{ account: { id: string; email: string; name: string } }>()).account;

describe('공급자 목록', () => {
  it('자격이 설정된 공급자만 알려 준다', async () => {
    const r = await api('/api/auth/providers');
    expect(await r.json()).toEqual({ providers: ['kakao', 'google'] }); // 애플은 비밀키 없음
    const r2 = await handleSocial(new Request('http://sync/api/auth/providers'), { ...env, APPLE_PRIVATE_KEY: applePem } as unknown as Env, '/api/auth/providers');
    expect(await r2.json()).toEqual({ providers: ['kakao', 'google', 'apple'] });
  });
});

describe('구글', () => {
  it('시작: 구글 로그인 화면으로 보내고 state 를 저장한다', async () => {
    const { loc, state } = await startAndState('google', '/?room=abc');
    expect(loc.origin).toBe('https://accounts.google.com');
    expect(loc.searchParams.get('client_id')).toBe('g-client');
    expect(loc.searchParams.get('redirect_uri')).toBe('http://sync/api/auth/google/callback');
    expect(loc.searchParams.get('scope')).toContain('email');
    const row = await env.DB.prepare('SELECT * FROM oauth_states WHERE state = ?').bind(state).first<{ provider: string; next: string }>();
    expect(row).toMatchObject({ provider: 'google', next: '/?room=abc' });
  });

  it('콜백: code 교환 → 계정 생성 → 세션을 앱으로 넘긴다 (같은 구글 ID 는 같은 계정)', async () => {
    mock('https://oauth2.googleapis.com/token', { access_token: 'at' }, 200, 'POST');
    mock('https://www.googleapis.com/oauth2/v2/userinfo', { id: 'g-1', email: 'Maker@Example.com', name: '제작자' });
    const { state } = await startAndState('google', '/?room=abc');
    const r = await api(`/api/auth/google/callback?code=c1&state=${state}`, { redirect: 'manual' });
    const q = sessionFromRedirect(r);
    expect(q.get('next')).toBe('/?room=abc');
    const me = await meOf(q.get('session')!);
    expect(me.email).toBe('maker@example.com');
    expect(me.name).toBe('제작자');
    const { state: s2 } = await startAndState('google');
    const q2 = sessionFromRedirect(await api(`/api/auth/google/callback?code=c2&state=${s2}`, { redirect: 'manual' }));
    expect((await meOf(q2.get('session')!)).id).toBe(me.id);
  });

  it('같은 이메일의 기존 계정(이메일 로그인)에 연결된다', async () => {
    const { login } = await import('./helpers');
    const s = await login('link@example.com');
    const existing = await meOf(s);
    mock('https://oauth2.googleapis.com/token', { access_token: 'at' }, 200, 'POST');
    mock('https://www.googleapis.com/oauth2/v2/userinfo', { id: 'g-link', email: 'link@example.com' });
    const { state } = await startAndState('google');
    const q = sessionFromRedirect(await api(`/api/auth/google/callback?code=c&state=${state}`, { redirect: 'manual' }));
    expect((await meOf(q.get('session')!)).id).toBe(existing.id);
  });

  it('state 가 없거나 재사용이면 400, 공급자 오류면 502', async () => {
    expect((await api('/api/auth/google/callback?code=c&state=nope', { redirect: 'manual' })).status).toBe(400);
    mock('https://oauth2.googleapis.com/token', { error: 'invalid_grant' }, 400, 'POST');
    const { state } = await startAndState('google');
    expect((await api(`/api/auth/google/callback?code=bad&state=${state}`, { redirect: 'manual' })).status).toBe(502);
    expect((await api(`/api/auth/google/callback?code=c&state=${state}`, { redirect: 'manual' })).status).toBe(400); // 1회용
  });
});

describe('카카오', () => {
  it('시작 주소와 콜백 (이메일 동의 없으면 대체 이메일)', async () => {
    const { loc, state } = await startAndState('kakao');
    expect(loc.origin).toBe('https://kauth.kakao.com');
    expect(loc.searchParams.get('client_id')).toBe('k-client');
    mock('https://kauth.kakao.com/oauth/token', { access_token: 'kat' }, 200, 'POST');
    mock('https://kapi.kakao.com/v2/user/me', { id: 12345, kakao_account: {}, properties: { nickname: '카카오사장' } });
    const q = sessionFromRedirect(await api(`/api/auth/kakao/callback?code=c&state=${state}`, { redirect: 'manual' }));
    const me = await meOf(q.get('session')!);
    expect(me.email).toBe('kakao-12345@noemail.ganpanda.co.kr');
    expect(me.name).toBe('카카오사장');
  });
});

describe('카카오 이메일 확인 여부 (2026-10-21 카카오 로그인 기본 — 남의 이메일 계정에 붙는 사고 방지)', () => {
  it('is_email_verified 인 이메일은 같은 이메일의 기존 계정에 연결된다', async () => {
    await login('owner@example.com'); // 이메일 계정이 먼저 있다
    const { state } = await startAndState('kakao');
    mock('https://kauth.kakao.com/oauth/token', { access_token: 'kat' }, 200, 'POST');
    mock('https://kapi.kakao.com/v2/user/me', { id: 777, kakao_account: { email: 'Owner@example.com', is_email_verified: true, is_email_valid: true }, properties: { nickname: '사장' } });
    const q = sessionFromRedirect(await api(`/api/auth/kakao/callback?code=c&state=${state}`, { redirect: 'manual' }));
    const me = await meOf(q.get('session')!);
    expect(me.email).toBe('owner@example.com');
  });
  it('확인되지 않은 이메일은 기존 계정에 연결하지 않고 대체 이메일로 새 계정', async () => {
    await login('victim@example.com');
    const { state } = await startAndState('kakao');
    mock('https://kauth.kakao.com/oauth/token', { access_token: 'kat' }, 200, 'POST');
    mock('https://kapi.kakao.com/v2/user/me', { id: 888, kakao_account: { email: 'victim@example.com', is_email_verified: false }, properties: { nickname: '수상한' } });
    const q = sessionFromRedirect(await api(`/api/auth/kakao/callback?code=c&state=${state}`, { redirect: 'manual' }));
    const me = await meOf(q.get('session')!);
    expect(me.email).toBe('kakao-888@noemail.ganpanda.co.kr');
  });
});

describe('애플', () => {
  const appleEnv = () => ({ ...env, APPLE_PRIVATE_KEY: applePem } as unknown as Env);

  it('client secret 은 팀·키·서비스 ID 로 서명한 ES256 JWT', async () => {
    const jwt = await appleClientSecret(appleEnv());
    const [h, p] = jwt.split('.').slice(0, 2).map((x) => JSON.parse(atob(x.replace(/-/g, '+').replace(/_/g, '/'))));
    expect(h).toMatchObject({ alg: 'ES256', kid: 'KEY123' });
    expect(p).toMatchObject({ iss: 'TEAM123456', sub: 'kr.co.ganpanda.web', aud: 'https://appleid.apple.com' });
    expect(p.exp - p.iat).toBeLessThanOrEqual(15777000);
  });

  it('시작은 form_post, 콜백(POST)은 id_token 을 애플 공개키로 검증해 계정을 만든다', async () => {
    const e = appleEnv();
    const r = await handleSocial(new Request('http://sync/api/auth/apple/start?next=/'), e, '/api/auth/apple/start');
    expect(r.status).toBe(302);
    const loc = new URL(r.headers.get('location')!);
    expect(loc.origin).toBe('https://appleid.apple.com');
    expect(loc.searchParams.get('response_mode')).toBe('form_post');
    expect(loc.searchParams.get('scope')).toBe('name email');
    const state = loc.searchParams.get('state')!;

    const idToken = await signJwt({ alg: 'RS256', kid: 'apple-k1' }, { iss: 'https://appleid.apple.com', aud: 'kr.co.ganpanda.web', sub: 'apple-user-1', email: 'relay@privaterelay.appleid.com', exp: Math.floor(Date.now() / 1000) + 600, iat: Math.floor(Date.now() / 1000) }, rsa.privateKey);
    mock('https://appleid.apple.com/auth/token', { id_token: idToken }, 200, 'POST');
    mock('https://appleid.apple.com/auth/keys', { keys: [rsaJwk] });
    const form = new URLSearchParams({ code: 'ac', state, user: JSON.stringify({ name: { firstName: '길동', lastName: '홍' } }) });
    const cb = await handleSocial(new Request('http://sync/api/auth/apple/callback', { method: 'POST', body: form, headers: { 'content-type': 'application/x-www-form-urlencoded' } }), e, '/api/auth/apple/callback');
    const q = sessionFromRedirect(cb);
    const me = await meOf(q.get('session')!);
    expect(me.email).toBe('relay@privaterelay.appleid.com');
    expect(me.name).toBe('홍길동');
  });

  it('서명이 틀린 id_token 은 거부한다', async () => {
    const other = (await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify'])) as CryptoKeyPair;
    const bad = await signJwt({ alg: 'RS256', kid: 'apple-k1' }, { iss: 'https://appleid.apple.com', aud: 'kr.co.ganpanda.web', sub: 'x', exp: Math.floor(Date.now() / 1000) + 600 }, other.privateKey);
    expect(await verifyJwtRS256(bad, [rsaJwk])).toBeNull();
    const good = await signJwt({ alg: 'RS256', kid: 'apple-k1' }, { iss: 'https://appleid.apple.com', aud: 'kr.co.ganpanda.web', sub: 'x', exp: Math.floor(Date.now() / 1000) + 600 }, rsa.privateKey);
    expect(await verifyJwtRS256(good, [rsaJwk])).toMatchObject({ sub: 'x' });
  });
});

describe('키가 없는 공급자', () => {
  it('시작하면 503', async () => {
    expect((await api('/api/auth/apple/start', { redirect: 'manual' })).status).toBe(503);
  });
});
