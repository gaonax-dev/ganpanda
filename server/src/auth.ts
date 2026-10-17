// 계정·로그인 (1-2a): 이메일·비밀번호(기본, 2026-10-15) · 이메일 매직링크(비밀번호 재설정 겸) → 세션 Bearer 토큰. 카카오·구글·애플은 1-2d.
import { PLANS } from './plans';
import { json, randomToken, readJson, sha256hex, text } from './http';
import { hashPassword, validPassword, verifyPassword } from './password';
import { usageOf } from './usage';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const FROM = { email: 'login@ganpanda.co.kr', name: '간판다' };
const LOGIN_TTL = 15 * 60 * 1000;
const SESSION_TTL = 90 * 24 * 60 * 60 * 1000;
const NAME_MAX = 40;

export interface Account { id: string; email: string; name: string; plan: string; created_at: number; prices?: string | null; password_hash?: string | null; email_verified?: number }

const LOCK_WINDOW = 15 * 60 * 1000;
const VERIFY_TTL = 24 * 60 * 60 * 1000;
const LOCK_FAILS = 10;

export const normalizeEmail = (e: string) => e.trim().toLowerCase();

/** Authorization: Bearer <세션> → 계정 (없거나 만료면 null) */
export async function authenticate(req: Request, env: Env): Promise<(Account & { sessionHash: string }) | null> {
  const m = req.headers.get('authorization')?.match(/^Bearer\s+(\S+)$/i);
  if (!m) return null;
  const sessionHash = await sha256hex(m[1]);
  const row = await env.DB.prepare(
    'SELECT a.* FROM sessions s JOIN accounts a ON a.id = s.account_id WHERE s.token_hash = ? AND s.expires_at > ?',
  ).bind(sessionHash, Date.now()).first<Account>();
  return row ? { ...row, sessionHash } : null;
}

const publicAccount = (a: Account) => ({ id: a.id, email: a.email, name: a.name, plan: a.plan, hasPassword: !!a.password_hash });

/** 새 세션 (reset = 비밀번호 재설정 링크로 들어온 세션: 15분 동안 현재 비밀번호 없이 새 비밀번호 설정 가능) */
async function newSession(env: Env, accountId: string, reset = false): Promise<string> {
  const session = randomToken();
  const now = Date.now();
  await env.DB.prepare('INSERT INTO sessions (token_hash, account_id, created_at, expires_at, reset_until) VALUES (?, ?, ?, ?, ?)')
    .bind(await sha256hex(session), accountId, now, now + SESSION_TTL, reset ? now + LOGIN_TTL : null).run();
  return session;
}

/**
 * 이메일 소유가 확인됨(메일 링크·소셜). 확인 전에 걸려 있던 비밀번호는 지운다 — 남이 내 이메일로 먼저 비밀번호 가입해 둔 경우를 막는다
 */
export async function markEmailVerified(env: Env, a: Account): Promise<Account> {
  if (a.email_verified) return a;
  await env.DB.prepare('UPDATE accounts SET email_verified = 1, password_hash = NULL WHERE id = ?').bind(a.id).run();
  return { ...a, email_verified: 1, password_hash: null };
}

async function signup(req: Request, env: Env): Promise<Response> {
  const body = await readJson<{ email?: string; password?: string; name?: string }>(req);
  const email = typeof body?.email === 'string' ? normalizeEmail(body.email) : '';
  if (!EMAIL_RE.test(email)) return text('bad email', 400);
  if (!validPassword(body?.password)) return text('bad password', 400);
  const name = typeof body?.name === 'string' ? body.name.trim().slice(0, NAME_MAX) : '';
  // 가입할 때 이메일 인증 (2026-10-15 사용자: "가입할 때 이메일 인증도 받게 해줘"): 인증 메일의 링크를 열어야 로그인된다
  const exists = await env.DB.prepare('SELECT * FROM accounts WHERE email = ?').bind(email).first<Account>();
  if (exists?.email_verified) return text('already registered', 409);
  const hash = await hashPassword(body!.password!);
  if (exists) {
    // 아직 인증 안 된 가입: 마지막 가입 시도의 비밀번호로 덮고 인증 메일을 다시 보낸다 (남이 먼저 걸어 둔 것이 남지 않게)
    await env.DB.prepare('UPDATE accounts SET password_hash = ?, name = ? WHERE id = ?').bind(hash, name || exists.name, exists.id).run();
  } else {
    await env.DB.prepare('INSERT INTO accounts (id, email, name, plan, created_at, password_hash, email_verified) VALUES (?, ?, ?, ?, ?, ?, 0)')
      .bind(crypto.randomUUID(), email, name, 'free', Date.now(), hash).run();
  }
  return sendLink(env, email, 'verify');
}

async function passwordLogin(req: Request, env: Env): Promise<Response> {
  const body = await readJson<{ email?: string; password?: string }>(req);
  const email = typeof body?.email === 'string' ? normalizeEmail(body.email) : '';
  if (!email || typeof body?.password !== 'string') return text('bad request', 400);
  const now = Date.now();
  const fails = await env.DB.prepare('SELECT COUNT(*) AS n FROM login_failures WHERE email = ? AND at > ?').bind(email, now - LOCK_WINDOW).first<{ n: number }>();
  if ((fails?.n ?? 0) >= LOCK_FAILS) return text('too many attempts', 429);
  const account = await env.DB.prepare('SELECT * FROM accounts WHERE email = ?').bind(email).first<Account>();
  if (!account || !(await verifyPassword(body.password, account.password_hash))) {
    await env.DB.prepare('INSERT INTO login_failures (email, at) VALUES (?, ?)').bind(email, now).run();
    return text('invalid credentials', 401);
  }
  await env.DB.prepare('DELETE FROM login_failures WHERE email = ?').bind(email).run();
  if (!account.email_verified) return text('email not verified', 403); // 인증 메일의 링크를 먼저
  return json({ session: await newSession(env, account.id), account: publicAccount(account) });
}

async function requestEmailLogin(req: Request, env: Env): Promise<Response> {
  const body = await readJson<{ email?: string; reset?: boolean }>(req);
  const email = typeof body?.email === 'string' ? normalizeEmail(body.email) : '';
  if (!EMAIL_RE.test(email)) return text('bad email', 400);
  return sendLink(env, email, body?.reset === true ? 'reset' : 'login');
}

type LinkPurpose = 'login' | 'reset' | 'verify';
/** 메일 링크 발급·발송 (login = 로그인, reset = 비밀번호 재설정, verify = 가입 이메일 인증). 개발 모드는 링크를 응답에 */
async function sendLink(env: Env, email: string, purpose: LinkPurpose): Promise<Response> {
  const token = randomToken();
  const now = Date.now();
  await env.DB.prepare('INSERT INTO login_tokens (token_hash, email, created_at, expires_at, purpose) VALUES (?, ?, ?, ?, ?)')
    .bind(await sha256hex(token), email, now, now + (purpose === 'verify' ? VERIFY_TTL : LOGIN_TTL), purpose === 'login' ? null : purpose).run();
  const link = `${env.APP_URL.replace(/\/+$/, '')}/login?token=${token}${purpose === 'reset' ? '&reset=1' : purpose === 'verify' ? '&verify=1' : ''}`;
  if (env.AUTH_DEV_LINK === '1') return json({ ok: true, link }, 202);
  if (!env.EMAIL) return text('email sending not configured', 503);
  try {
    await env.EMAIL.send(loginMail(email, link, purpose));
  } catch (e) {
    // 발송 실패: 링크가 떠돌지 않도록 토큰을 바로 폐기
    await env.DB.prepare('UPDATE login_tokens SET used_at = ? WHERE token_hash = ?').bind(now, await sha256hex(token)).run();
    const err = e as { code?: string; message?: string };
    console.error('login email failed', err.code, err.message);
    return text('email send failed', 502);
  }
  return json({ ok: true }, 202);
}

/** 매직링크 메일 본문 (텍스트·HTML 둘 다) */
function loginMail(to: string, link: string, purpose: LinkPurpose = 'login') {
  const reset = purpose === 'reset', verify = purpose === 'verify';
  const what = reset ? '비밀번호 재설정' : verify ? '가입 이메일 인증' : '로그인';
  const valid = verify ? '24시간' : '15분';
  const text = [
    `간판다 ${what} 링크입니다.`, '', verify ? `아래 링크를 열면 이메일이 인증되고 가입이 끝납니다 (${valid} 동안 유효, 한 번만 사용 가능).` : reset ? '아래 링크를 열면 로그인되고 새 비밀번호를 정할 수 있습니다 (15분 동안 유효, 한 번만 사용 가능).' : '아래 링크를 열면 로그인됩니다 (15분 동안 유효, 한 번만 사용 가능).', link, '',
    '본인이 요청하지 않았다면 이 메일은 무시해도 됩니다.',
  ].join('\n');
  const html = `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
<h2 style="margin:0 0 12px">간판다 ${what}</h2>
<p>${verify ? '아래 버튼을 누르면 이메일이 인증되고 가입이 끝납니다' : `아래 버튼을 누르면 로그인됩니다${reset ? '. 이어서 새 비밀번호를 정하세요' : ''}`}. 링크는 <b>${valid}</b> 동안 유효하고 한 번만 쓸 수 있습니다.</p>
<p style="margin:24px 0"><a href="${link}" style="background:#ffcc00;color:#1a1500;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:8px;display:inline-block">${reset ? '비밀번호 재설정' : verify ? '이메일 인증하기' : '로그인하기'}</a></p>
<p style="color:#666;font-size:12px">버튼이 안 눌리면 이 주소를 브라우저에 붙여 넣으세요:<br><a href="${link}">${link}</a></p>
<p style="color:#666;font-size:12px">본인이 ${verify ? '가입하지' : '요청하지'} 않았다면 이 메일은 무시해도 됩니다.</p></div>`;
  return { to, from: FROM, subject: `[간판다] ${what} 링크`, text, html };
}

async function verifyEmailLogin(req: Request, env: Env): Promise<Response> {
  const body = await readJson<{ token?: string }>(req);
  if (typeof body?.token !== 'string' || !body.token) return text('bad token', 400);
  const hash = await sha256hex(body.token);
  const row = await env.DB.prepare('SELECT * FROM login_tokens WHERE token_hash = ?').bind(hash)
    .first<{ email: string; expires_at: number; used_at: number | null; purpose: string | null }>();
  if (!row) return text('unknown token', 404);
  const now = Date.now();
  if (row.used_at || row.expires_at < now) return text('token expired or used', 410);
  await env.DB.prepare('UPDATE login_tokens SET used_at = ? WHERE token_hash = ?').bind(now, hash).run();

  let account = await env.DB.prepare('SELECT * FROM accounts WHERE email = ?').bind(row.email).first<Account>();
  if (!account) {
    account = { id: crypto.randomUUID(), email: row.email, name: '', plan: 'free', created_at: now, email_verified: 1 };
    await env.DB.prepare('INSERT INTO accounts (id, email, name, plan, created_at, email_verified) VALUES (?, ?, ?, ?, ?, 1)')
      .bind(account.id, account.email, account.name, account.plan, account.created_at).run();
  } else if (row.purpose === 'verify') {
    // 가입 인증: 가입 때 정한 비밀번호를 그대로 두고 인증만
    if (!account.email_verified) await env.DB.prepare('UPDATE accounts SET email_verified = 1 WHERE id = ?').bind(account.id).run();
    account = { ...account, email_verified: 1 };
  } else account = await markEmailVerified(env, account);
  const reset = row.purpose === 'reset';
  return json({ session: await newSession(env, account.id, reset), account: publicAccount(account), reset });
}

export async function handleAuth(req: Request, env: Env, pathname: string): Promise<Response> {
  if (pathname === '/api/auth/email' && req.method === 'POST') return requestEmailLogin(req, env);
  if (pathname === '/api/auth/verify' && req.method === 'POST') return verifyEmailLogin(req, env);
  if (pathname === '/api/auth/signup' && req.method === 'POST') return signup(req, env);
  if (pathname === '/api/auth/resend-verify' && req.method === 'POST') {
    const body = await readJson<{ email?: string }>(req);
    const email = typeof body?.email === 'string' ? normalizeEmail(body.email) : '';
    if (!EMAIL_RE.test(email)) return text('bad email', 400);
    const a = await env.DB.prepare('SELECT email_verified, password_hash FROM accounts WHERE email = ?').bind(email).first<Account>();
    if (a && !a.email_verified && a.password_hash) return sendLink(env, email, 'verify');
    return json({ ok: true }, 202);
  }
  if (pathname === '/api/auth/login' && req.method === 'POST') return passwordLogin(req, env);

  const me = await authenticate(req, env);
  if (!me) return text('unauthorized', 401);

  if (pathname === '/api/auth/logout' && req.method === 'POST') {
    await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(me.sessionHash).run();
    return new Response(null, { status: 204 });
  }
  if (pathname === '/api/me' && req.method === 'GET') {
    return json({ account: publicAccount(me), prices: me.prices ? JSON.parse(me.prices) : null, ...(await usageOf(env, me.id, me.plan)) });
  }
  if (pathname === '/api/me/password' && req.method === 'POST') {
    // 새 비밀번호 설정: 비밀번호가 있으면 현재 비밀번호가 맞아야 한다. 재설정 링크로 들어온 직후(15분)는 예외
    const body = await readJson<{ password?: string; current?: string }>(req);
    if (!validPassword(body?.password)) return text('bad password', 400);
    const s = await env.DB.prepare('SELECT reset_until FROM sessions WHERE token_hash = ?').bind(me.sessionHash).first<{ reset_until: number | null }>();
    const resetOk = !!s?.reset_until && s.reset_until > Date.now();
    if (me.password_hash && !resetOk && !(typeof body?.current === 'string' && (await verifyPassword(body.current, me.password_hash)))) return text('wrong current password', 403);
    await env.DB.prepare('UPDATE accounts SET password_hash = ? WHERE id = ?').bind(await hashPassword(body!.password!), me.id).run();
    if (resetOk) await env.DB.prepare('UPDATE sessions SET reset_until = NULL WHERE token_hash = ?').bind(me.sessionHash).run();
    return json({ ok: true });
  }
  // 개발 모드 전용 (AUTH_DEV_LINK=1, 로컬·E2E): 내 요금제 바꾸기. 운영에서는 관리자가 D1 에서 바꾼다 (결제 미구현)
  if (pathname === '/api/me/plan' && req.method === 'PUT') {
    if (env.AUTH_DEV_LINK !== '1') return text('not found', 404);
    const body = await readJson<{ plan?: string }>(req);
    if (!body?.plan || !(body.plan in PLANS)) return text('bad plan', 400);
    await env.DB.prepare('UPDATE accounts SET plan = ? WHERE id = ?').bind(body.plan, me.id).run();
    return json({ account: { ...publicAccount(me), plan: body.plan } });
  }
  if (pathname === '/api/me' && req.method === 'PATCH') {
    const body = await readJson<{ name?: string }>(req);
    const name = typeof body?.name === 'string' ? body.name.trim().slice(0, NAME_MAX) : null;
    if (name === null) return text('bad name', 400);
    await env.DB.prepare('UPDATE accounts SET name = ? WHERE id = ?').bind(name, me.id).run();
    return json({ account: { ...publicAccount(me), name } });
  }
  return text('not found', 404);
}
