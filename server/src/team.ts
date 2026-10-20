// 팀 멤버 (계정 단위, 설정에서 관리): 오너가 가입된 계정의 이메일로 추가. can_billing = 정산 금액 보기
// 2026-10-15 사용자: "멤버 관리는 설정에서 하고 프로젝트별·그룹별 관리는 하지 않는다"
import { authenticate, normalizeEmail, type Account } from './auth';
import { json, readJson, text } from './http';
import { planOf } from './plans';
import { membersOf } from './usage';

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
  const m = pathname.match(/^\/api\/me\/team(?:\/([^/]+))?$/);
  if (!m) return text('not found', 404);
  const accountId = m[1];
  if (!accountId && req.method === 'GET') {
    const rows = await env.DB.prepare('SELECT m.*, a.email, a.name FROM team_members m JOIN accounts a ON a.id = m.account_id WHERE m.owner_id = ? ORDER BY m.created_at')
      .bind(me.id).all<TeamRow & { email: string; name: string }>();
    return json({ members: rows.results.map(pubMember) });
  }
  if (!accountId && req.method === 'POST') {
    const body = await readJson<{ email?: string; canBilling?: boolean }>(req);
    const email = typeof body?.email === 'string' ? normalizeEmail(body.email) : '';
    if (!email) return text('bad email', 400);
    const acc = await env.DB.prepare('SELECT * FROM accounts WHERE email = ?').bind(email).first<Account>();
    if (!acc) return text('account not found', 404);
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
