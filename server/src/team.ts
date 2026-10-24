// 팀 멤버 (계정 단위, 설정에서 관리): 오너가 가입된 계정의 이메일로 추가. can_billing = 정산 금액 보기
// 2026-10-15 사용자: "멤버 관리는 설정에서 하고 프로젝트별·그룹별 관리는 하지 않는다"
import { authenticate, normalizeEmail, type Account } from './auth';
import { json, randomToken, readJson, sha256hex, text } from './http';
import { planOf } from './plans';
import { membersOf } from './usage';

export const INVITE_TTL = 7 * 24 * 60 * 60 * 1000;
const FROM = { email: 'login@ganpanda.co.kr', name: '간판다' };
interface InviteRow { token_hash: string; owner_id: string; email: string; can_billing: number; created_at: number; expires_at: number; used_at: number | null }
const pendingSql = 'used_at IS NULL AND expires_at > ?';

/** 이 이메일 앞으로 온 대기 중 초대를 받아들인다 — 그 이메일의 계정으로 로그인할 때마다(메일 링크·비밀번호·소셜). 이메일 소유가 확인된 로그인만 여기 온다 */
export async function acceptTeamInvites(env: Env, accountId: string) {
  const a = await env.DB.prepare('SELECT email FROM accounts WHERE id = ?').bind(accountId).first<{ email: string }>();
  if (!a) return;
  const now = Date.now();
  const rows = await env.DB.prepare(`SELECT * FROM team_invites WHERE email = ? AND ${pendingSql}`).bind(a.email, now).all<InviteRow>();
  for (const r of rows.results) {
    if (r.owner_id === accountId) continue;
    await env.DB.batch([
      env.DB.prepare('INSERT OR IGNORE INTO team_members (owner_id, account_id, can_billing, created_at) VALUES (?, ?, ?, ?)').bind(r.owner_id, accountId, r.can_billing, now),
      env.DB.prepare('UPDATE team_invites SET used_at = ? WHERE token_hash = ?').bind(now, r.token_hash),
    ]);
  }
}

/** 초대 링크 토큰으로 이 계정을 팀에 (이메일 상관없음 — 소셜 로그인 경로). 받아들이면 초대한 사람 이름, 아니면 null */
export async function acceptInviteToken(env: Env, token: string, accountId: string): Promise<string | null> {
  const r = await inviteOf(env, token);
  if (typeof r === 'number' || r.owner_id === accountId) return null;
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare('INSERT OR IGNORE INTO team_members (owner_id, account_id, can_billing, created_at) VALUES (?, ?, ?, ?)').bind(r.owner_id, accountId, r.can_billing, now),
    env.DB.prepare('UPDATE team_invites SET used_at = ? WHERE token_hash = ?').bind(now, r.token_hash),
  ]);
  return ownerName(env, r.owner_id);
}

/** 초대 링크 토큰 → 대기 중 초대 (없음 404 / 쓰였거나 만료 410) */
export async function inviteOf(env: Env, token: string): Promise<InviteRow | 404 | 410> {
  const r = await env.DB.prepare('SELECT * FROM team_invites WHERE token_hash = ?').bind(await sha256hex(token)).first<InviteRow>();
  if (!r) return 404;
  if (r.used_at || r.expires_at < Date.now()) return 410;
  return r;
}

/** 초대한 사람 이름: 계정 이름 → 사업자 상호 → 이메일 */
async function ownerName(env: Env, ownerId: string): Promise<string> {
  const o = await env.DB.prepare('SELECT a.name, a.email, b.name AS biz FROM accounts a LEFT JOIN businesses b ON b.account_id = a.id WHERE a.id = ?').bind(ownerId).first<{ name: string; email: string; biz: string | null }>();
  return o?.name || o?.biz || o?.email || '간판다 사용자';
}

/** 공개: 초대 링크 정보 (가입 화면에 "OO 의 멤버로 초대") */
export async function handleTeamInvite(env: Env, token: string): Promise<Response> {
  const r = await inviteOf(env, token);
  if (r === 404) return json({ error: 'not_found' }, 404);
  if (r === 410) return json({ error: 'expired' }, 410);
  return json({ email: r.email, ownerName: await ownerName(env, r.owner_id), expiresAt: r.expires_at });
}

function inviteMail(to: string, link: string, owner: string) {
  const text = [`${owner}님이 간판다 팀 멤버로 초대했습니다.`, '', '아래 링크를 열고 비밀번호만 정하면 가입이 끝나고 바로 팀에 들어갑니다 (7일 동안 유효, 한 번만 사용 가능).', link, '', '카카오로 가입해도 이 이메일이 카카오 계정의 이메일과 같으면 팀에 들어갑니다.', '모르는 초대라면 이 메일은 무시해도 됩니다.'].join('\n');
  const html = `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
<h2 style="margin:0 0 12px">간판다 팀 초대</h2>
<p><b>${owner.replace(/[<>&]/g, '')}</b>님이 간판다 팀 멤버로 초대했습니다. 아래 버튼을 누르고 비밀번호만 정하면 바로 팀에 들어갑니다. 링크는 <b>7일</b> 동안 유효하고 한 번만 쓸 수 있습니다.</p>
<p style="margin:24px 0"><a href="${link}" style="background:#ffcc00;color:#1a1500;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:8px;display:inline-block">가입하고 팀 들어가기</a></p>
<p style="color:#666;font-size:12px">버튼이 안 눌리면 이 주소를 브라우저에 붙여 넣으세요:<br><a href="${link}">${link}</a></p>
<p style="color:#666;font-size:12px">모르는 초대라면 이 메일은 무시해도 됩니다.</p></div>`;
  return { to, from: FROM, subject: `[간판다] ${owner}님이 팀 멤버로 초대했습니다`, text, html };
}

export interface TeamRow { owner_id: string; account_id: string; can_billing: number; created_at: number }

/** 오너의 팀에서 내 자격 (오너 자신은 정산 기본) */
export async function teamAccess(env: Env, ownerId: string, me: Account): Promise<{ role: 'owner' | 'member'; canBilling: boolean } | null> {
  if (ownerId === me.id) return { role: 'owner', canBilling: true };
  const m = await env.DB.prepare('SELECT * FROM team_members WHERE owner_id = ? AND account_id = ?').bind(ownerId, me.id).first<TeamRow>();
  return m ? { role: 'member', canBilling: !!m.can_billing } : null;
}

const pubMember = (r: TeamRow & { email: string; name: string }) => ({ accountId: r.account_id, email: r.email, name: r.name, canBilling: !!r.can_billing, createdAt: r.created_at });

export async function handleTeam(req: Request, env: Env, pathname: string): Promise<Response> {
  const me = await authenticate(req, env);
  if (!me) return text('unauthorized', 401);
  const m = pathname.match(/^\/api\/me\/team(?:\/([^/]+))?$/) ?? (pathname.startsWith('/api/me/team/invites/') ? [pathname, undefined] : null);
  if (!m) return text('not found', 404);
  const accountId = m[1];
  if (!accountId && req.method === 'GET') {
    const rows = await env.DB.prepare('SELECT m.*, a.email, a.name FROM team_members m JOIN accounts a ON a.id = m.account_id WHERE m.owner_id = ? ORDER BY m.created_at')
      .bind(me.id).all<TeamRow & { email: string; name: string }>();
    const inv = await env.DB.prepare(`SELECT * FROM team_invites WHERE owner_id = ? AND ${pendingSql} ORDER BY created_at`).bind(me.id, Date.now()).all<InviteRow>();
    return json({ members: rows.results.map(pubMember), invites: inv.results.map((r) => ({ email: r.email, canBilling: !!r.can_billing, createdAt: r.created_at, expiresAt: r.expires_at })) });
  }
  const im = pathname.match(/^\/api\/me\/team\/invites\/([^/]+)$/);
  if (im && req.method === 'DELETE') {
    await env.DB.prepare('DELETE FROM team_invites WHERE owner_id = ? AND email = ? AND used_at IS NULL').bind(me.id, normalizeEmail(decodeURIComponent(im[1]))).run();
    return new Response(null, { status: 204 });
  }
  if (!accountId && req.method === 'POST') {
    const body = await readJson<{ email?: string; canBilling?: boolean }>(req);
    const email = typeof body?.email === 'string' ? normalizeEmail(body.email) : '';
    if (!email) return text('bad email', 400);
    const acc = await env.DB.prepare('SELECT * FROM accounts WHERE email = ?').bind(email).first<Account>();
    if (!acc) return invite(env, me, email, !!body?.canBilling);
    if (acc.id === me.id) return text('owner', 400);
    // 요금제 멤버 한도 (2026-10-21) — 이미 있는 멤버를 다시 보내는 것(정산 보기 바꾸기)은 세지 않는다
    const exists = await env.DB.prepare('SELECT 1 FROM team_members WHERE owner_id = ? AND account_id = ?').bind(me.id, acc.id).first();
    if (!exists) {
      const used = await membersOf(env, me.id), limit = planOf(me.plan).members;
      if (used >= limit) return json({ error: 'member_limit', used, limit }, 403);
    }
    const row: TeamRow = { owner_id: me.id, account_id: acc.id, can_billing: body?.canBilling ? 1 : 0, created_at: Date.now() };
    await env.DB.prepare('INSERT OR REPLACE INTO team_members (owner_id, account_id, can_billing, created_at) VALUES (?, ?, ?, ?)').bind(row.owner_id, row.account_id, row.can_billing, row.created_at).run();
    return json({ member: pubMember({ ...row, email: acc.email, name: acc.name }) }, 201);
  }
  if (accountId && req.method === 'PATCH') {
    const body = await readJson<{ canBilling?: boolean }>(req);
    if (typeof body?.canBilling !== 'boolean') return text('bad body', 400);
    const r = await env.DB.prepare('UPDATE team_members SET can_billing = ? WHERE owner_id = ? AND account_id = ?').bind(body.canBilling ? 1 : 0, me.id, accountId).run();
    if (!r.meta.changes) return text('member not found', 404);
    return json({ ok: true });
  }
  if (accountId && req.method === 'DELETE') {
    await env.DB.prepare('DELETE FROM team_members WHERE owner_id = ? AND account_id = ?').bind(me.id, accountId).run();
    return new Response(null, { status: 204 });
  }
  return text('method', 405);
}

/** 가입 안 한 이메일 → 가입 링크 메일 (2026-10-24). 같은 이메일에 다시 보내면 예전 링크는 버리고 새로 */
async function invite(env: Env, me: Account, email: string, canBilling: boolean): Promise<Response> {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return text('bad email', 400);
  const now = Date.now();
  const again = await env.DB.prepare(`SELECT 1 FROM team_invites WHERE owner_id = ? AND email = ? AND ${pendingSql}`).bind(me.id, email, now).first();
  if (!again) {
    const used = await membersOf(env, me.id), limit = planOf(me.plan).members;
    if (used >= limit) return json({ error: 'member_limit', used, limit }, 403);
  }
  const token = randomToken();
  await env.DB.batch([
    env.DB.prepare('DELETE FROM team_invites WHERE owner_id = ? AND email = ? AND used_at IS NULL').bind(me.id, email),
    env.DB.prepare('INSERT INTO team_invites (token_hash, owner_id, email, can_billing, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)').bind(await sha256hex(token), me.id, email, canBilling ? 1 : 0, now, now + INVITE_TTL),
  ]);
  const link = `${env.APP_URL.replace(/\/+$/, '')}/login?team=${token}`;
  const inv = { email, canBilling, createdAt: now, expiresAt: now + INVITE_TTL };
  if (env.AUTH_DEV_LINK === '1') return json({ invite: inv, link }, 202);
  if (!env.EMAIL) return text('email sending not configured', 503);
  try {
    await env.EMAIL.send(inviteMail(email, link, await ownerName(env, me.id)));
  } catch (e) {
    await env.DB.prepare('DELETE FROM team_invites WHERE token_hash = ?').bind(await sha256hex(token)).run();
    const err = e as { code?: string; message?: string };
    console.error('team invite email failed', err.code, err.message);
    return text('email send failed', 502);
  }
  return json({ invite: inv }, 202);
}
