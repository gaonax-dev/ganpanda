// 계정·로그인 (1-2a): 이메일 매직링크 → 세션 Bearer 토큰. 카카오·구글은 1-2d.
import { json, randomToken, readJson, sha256hex, text } from './http';
import { usageOf } from './usage';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const FROM = { email: 'login@ganpanda.co.kr', name: '간판다' };
const LOGIN_TTL = 15 * 60 * 1000;
const SESSION_TTL = 90 * 24 * 60 * 60 * 1000;
const NAME_MAX = 40;

export interface Account { id: string; email: string; name: string; plan: string; created_at: number; prices?: string | null }

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

const publicAccount = (a: Account) => ({ id: a.id, email: a.email, name: a.name, plan: a.plan });

async function requestEmailLogin(req: Request, env: Env): Promise<Response> {
  const body = await readJson<{ email?: string }>(req);
  const email = typeof body?.email === 'string' ? normalizeEmail(body.email) : '';
  if (!EMAIL_RE.test(email)) return text('bad email', 400);
  const token = randomToken();
  const now = Date.now();
  await env.DB.prepare('INSERT INTO login_tokens (token_hash, email, created_at, expires_at) VALUES (?, ?, ?, ?)')
    .bind(await sha256hex(token), email, now, now + LOGIN_TTL).run();
  const link = `${env.APP_URL.replace(/\/+$/, '')}/login?token=${token}`;
  if (env.AUTH_DEV_LINK === '1') return json({ ok: true, link }, 202);
  if (!env.EMAIL) return text('email sending not configured', 503);
  try {
    await env.EMAIL.send(loginMail(email, link));
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
function loginMail(to: string, link: string) {
  const text = [
    '간판다 로그인 링크입니다.', '', '아래 링크를 열면 로그인됩니다 (15분 동안 유효, 한 번만 사용 가능).', link, '',
    '본인이 요청하지 않았다면 이 메일은 무시해도 됩니다.',
  ].join('\n');
  const html = `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
<h2 style="margin:0 0 12px">간판다 로그인</h2>
<p>아래 버튼을 누르면 로그인됩니다. 링크는 <b>15분</b> 동안 유효하고 한 번만 쓸 수 있습니다.</p>
<p style="margin:24px 0"><a href="${link}" style="background:#ffcc00;color:#1a1500;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:8px;display:inline-block">로그인하기</a></p>
<p style="color:#666;font-size:12px">버튼이 안 눌리면 이 주소를 브라우저에 붙여 넣으세요:<br><a href="${link}">${link}</a></p>
<p style="color:#666;font-size:12px">본인이 요청하지 않았다면 이 메일은 무시해도 됩니다.</p></div>`;
  return { to, from: FROM, subject: '[간판다] 로그인 링크', text, html };
}

async function verifyEmailLogin(req: Request, env: Env): Promise<Response> {
  const body = await readJson<{ token?: string }>(req);
  if (typeof body?.token !== 'string' || !body.token) return text('bad token', 400);
  const hash = await sha256hex(body.token);
  const row = await env.DB.prepare('SELECT * FROM login_tokens WHERE token_hash = ?').bind(hash)
    .first<{ email: string; expires_at: number; used_at: number | null }>();
  if (!row) return text('unknown token', 404);
  const now = Date.now();
  if (row.used_at || row.expires_at < now) return text('token expired or used', 410);
  await env.DB.prepare('UPDATE login_tokens SET used_at = ? WHERE token_hash = ?').bind(now, hash).run();

  let account = await env.DB.prepare('SELECT * FROM accounts WHERE email = ?').bind(row.email).first<Account>();
  if (!account) {
    account = { id: crypto.randomUUID(), email: row.email, name: '', plan: 'free', created_at: now };
    await env.DB.prepare('INSERT INTO accounts (id, email, name, plan, created_at) VALUES (?, ?, ?, ?, ?)')
      .bind(account.id, account.email, account.name, account.plan, account.created_at).run();
  }
  const session = randomToken();
  await env.DB.prepare('INSERT INTO sessions (token_hash, account_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
    .bind(await sha256hex(session), account.id, now, now + SESSION_TTL).run();
  return json({ session, account: publicAccount(account) });
}

export async function handleAuth(req: Request, env: Env, pathname: string): Promise<Response> {
  if (pathname === '/api/auth/email' && req.method === 'POST') return requestEmailLogin(req, env);
  if (pathname === '/api/auth/verify' && req.method === 'POST') return verifyEmailLogin(req, env);

  const me = await authenticate(req, env);
  if (!me) return text('unauthorized', 401);

  if (pathname === '/api/auth/logout' && req.method === 'POST') {
    await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(me.sessionHash).run();
    return new Response(null, { status: 204 });
  }
  if (pathname === '/api/me' && req.method === 'GET') {
    return json({ account: publicAccount(me), prices: me.prices ? JSON.parse(me.prices) : null, ...(await usageOf(env, me.id, me.plan)) });
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
