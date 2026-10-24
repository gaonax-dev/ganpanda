// 소셜 로그인 (1-2d): 카카오·구글·애플. 서버가 OAuth 전 과정을 처리하고 세션을 앱(/login#session=)으로 넘긴다.
import { acceptTeamInvites } from './team';
import { json, randomToken, sha256hex, text } from './http';
import { normalizeEmail, type Account, markEmailVerified } from './auth';
import { appleClientSecret, verifyJwtRS256 } from './oauth/jwt';

export type Provider = 'kakao' | 'google' | 'apple';
const PROVIDERS: Provider[] = ['kakao', 'google', 'apple'];
const STATE_TTL = 10 * 60 * 1000;
const SESSION_TTL = 90 * 24 * 60 * 60 * 1000;

/** email 은 공급자가 확인한 주소만 (카카오 is_email_verified — 2026-10-21 카카오 기본 로그인: 확인 안 된 이메일로 남의 계정에 붙지 않도록) */
interface Identity { provider: Provider; providerId: string; email: string | null; name: string | null }

/** 공급자 호출 (테스트에서 가짜로 바꿔 끼운다) */
let oauthFetch: typeof fetch = (input, init) => fetch(input, init);
export function setOauthFetch(f: typeof fetch | null) { oauthFetch = f ?? ((input, init) => fetch(input, init)); }

export function configured(env: Env, p: Provider): boolean {
  if (p === 'google') return !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
  if (p === 'kakao') return !!(env.KAKAO_CLIENT_ID && env.KAKAO_CLIENT_SECRET);
  return !!(env.APPLE_CLIENT_ID && env.APPLE_TEAM_ID && env.APPLE_KEY_ID && env.APPLE_PRIVATE_KEY);
}

const callbackUrl = (req: Request, p: Provider) => `${new URL(req.url).origin}/api/auth/${p}/callback`;

function authorizeUrl(env: Env, p: Provider, redirect: string, state: string): string {
  const q = new URLSearchParams({ response_type: 'code', redirect_uri: redirect, state });
  if (p === 'google') {
    q.set('client_id', env.GOOGLE_CLIENT_ID); q.set('scope', 'openid email profile'); q.set('prompt', 'select_account');
    return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
  }
  if (p === 'kakao') {
    q.set('client_id', env.KAKAO_CLIENT_ID); q.set('scope', 'account_email profile_nickname');
    return `https://kauth.kakao.com/oauth/authorize?${q}`;
  }
  q.set('client_id', env.APPLE_CLIENT_ID); q.set('scope', 'name email'); q.set('response_mode', 'form_post');
  return `https://appleid.apple.com/auth/authorize?${q}`;
}

/** code → 공급자 사용자 정보. 실패하면 null */
async function exchange(env: Env, p: Provider, code: string, redirect: string, extra: Record<string, string>): Promise<Identity | null> {
  const form = (o: Record<string, string>) => ({ method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(o) });
  if (p === 'google') {
    const t = await oauthFetch('https://oauth2.googleapis.com/token', form({ grant_type: 'authorization_code', code, client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, redirect_uri: redirect }));
    if (!t.ok) return null;
    const { access_token } = await t.json<{ access_token: string }>();
    const u = await oauthFetch('https://www.googleapis.com/oauth2/v2/userinfo', { headers: { authorization: `Bearer ${access_token}` } });
    if (!u.ok) return null;
    const info = await u.json<{ id: string; email?: string; name?: string }>();
    return { provider: p, providerId: String(info.id), email: info.email ?? null, name: info.name ?? null };
  }
  if (p === 'kakao') {
    const t = await oauthFetch('https://kauth.kakao.com/oauth/token', form({ grant_type: 'authorization_code', code, client_id: env.KAKAO_CLIENT_ID, client_secret: env.KAKAO_CLIENT_SECRET, redirect_uri: redirect }));
    if (!t.ok) return null;
    const { access_token } = await t.json<{ access_token: string }>();
    const u = await oauthFetch('https://kapi.kakao.com/v2/user/me', { headers: { authorization: `Bearer ${access_token}` } });
    if (!u.ok) return null;
    const info = await u.json<{ id: number; kakao_account?: { email?: string; is_email_verified?: boolean }; properties?: { nickname?: string } }>();
    const ka = info.kakao_account;
    return { provider: p, providerId: String(info.id), email: ka?.email && ka.is_email_verified ? ka.email : null, name: info.properties?.nickname ?? null }; // 확인된 이메일만
  }
  // 애플: code → id_token, 애플 공개키로 검증. 이름은 첫 로그인 때 form 의 user 에만 온다
  const t = await oauthFetch('https://appleid.apple.com/auth/token', form({ grant_type: 'authorization_code', code, client_id: env.APPLE_CLIENT_ID, client_secret: await appleClientSecret(env), redirect_uri: redirect }));
  if (!t.ok) return null;
  const { id_token } = await t.json<{ id_token: string }>();
  const k = await oauthFetch('https://appleid.apple.com/auth/keys');
  if (!k.ok) return null;
  const { keys } = await k.json<{ keys: JsonWebKey[] }>();
  const claims = await verifyJwtRS256(id_token, keys);
  if (!claims || claims.iss !== 'https://appleid.apple.com' || claims.aud !== env.APPLE_CLIENT_ID || typeof claims.sub !== 'string') return null;
  let name: string | null = null;
  try {
    const u = extra.user ? JSON.parse(extra.user) as { name?: { firstName?: string; lastName?: string } } : null;
    if (u?.name) name = `${u.name.lastName ?? ''}${u.name.firstName ?? ''}`.trim() || null;
  } catch { /* 이름 없음 */ }
  return { provider: p, providerId: claims.sub, email: typeof claims.email === 'string' ? claims.email : null, name };
}

/** 공급자 ID → 기존 계정, 없으면 같은 이메일 계정에 연결, 없으면 새 계정 */
async function accountFor(env: Env, id: Identity): Promise<Account> {
  const now = Date.now();
  const linked = await env.DB.prepare('SELECT a.* FROM identities i JOIN accounts a ON a.id = i.account_id WHERE i.provider = ? AND i.provider_id = ?')
    .bind(id.provider, id.providerId).first<Account>();
  if (linked) return linked;
  const email = id.email ? normalizeEmail(id.email) : `${id.provider}-${id.providerId}@noemail.ganpanda.co.kr`;
  let account = await env.DB.prepare('SELECT * FROM accounts WHERE email = ?').bind(email).first<Account>();
  if (account && id.email) account = await markEmailVerified(env, account); // 공급자가 확인한 이메일
  if (!account) {
    account = { id: crypto.randomUUID(), email, name: id.name ?? '', plan: 'free', created_at: now };
    await env.DB.prepare('INSERT INTO accounts (id, email, name, plan, created_at, email_verified) VALUES (?, ?, ?, ?, ?, ?)').bind(account.id, account.email, account.name, account.plan, account.created_at, id.email ? 1 : 0).run();
  } else if (!account.name && id.name) {
    await env.DB.prepare('UPDATE accounts SET name = ? WHERE id = ?').bind(id.name, account.id).run();
    account = { ...account, name: id.name };
  }
  await env.DB.prepare('INSERT OR IGNORE INTO identities (provider, provider_id, account_id, email, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(id.provider, id.providerId, account.id, id.email, now).run();
  return account;
}

export async function handleSocial(req: Request, env: Env, pathname: string): Promise<Response> {
  if (pathname === '/api/auth/providers') return json({ providers: PROVIDERS.filter((p) => configured(env, p)) });
  const m = pathname.match(/^\/api\/auth\/(kakao|google|apple)\/(start|callback)$/);
  if (!m) return text('not found', 404);
  const p = m[1] as Provider;
  if (!configured(env, p)) return text('provider not configured', 503);
  const url = new URL(req.url);
  const redirect = callbackUrl(req, p);

  if (m[2] === 'start') {
    const state = randomToken();
    const next = url.searchParams.get('next') || '/';
    if (!next.startsWith('/')) return text('bad next', 400);
    await env.DB.prepare('INSERT INTO oauth_states (state, provider, next, created_at) VALUES (?, ?, ?, ?)').bind(state, p, next, Date.now()).run();
    return Response.redirect(authorizeUrl(env, p, redirect, state), 302);
  }

  // callback: 구글·카카오는 GET 쿼리, 애플은 POST form
  const params = req.method === 'POST' ? new URLSearchParams(await req.text()) : url.searchParams;
  const code = params.get('code'), state = params.get('state');
  if (!code || !state) return text('missing code/state', 400);
  const row = await env.DB.prepare('SELECT * FROM oauth_states WHERE state = ? AND provider = ?').bind(state, p).first<{ next: string; created_at: number }>();
  if (row) await env.DB.prepare('DELETE FROM oauth_states WHERE state = ?').bind(state).run(); // 1회용
  if (!row || row.created_at < Date.now() - STATE_TTL) return text('bad state', 400);

  const identity = await exchange(env, p, code, redirect, { user: params.get('user') ?? '' });
  if (!identity) return text('provider error', 502);
  const account = await accountFor(env, identity);
  const session = randomToken();
  await env.DB.prepare('INSERT INTO sessions (token_hash, account_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
    .bind(await sha256hex(session), account.id, Date.now(), Date.now() + SESSION_TTL).run();
  await acceptTeamInvites(env, account.id); // 카카오 이메일 앞으로 온 멤버 초대 (2026-10-24)
  const hash = new URLSearchParams({ session, next: row.next });
  return Response.redirect(`${env.APP_URL.replace(/\/+$/, '')}/login#${hash}`, 302);
}
