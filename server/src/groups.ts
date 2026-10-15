// 프로젝트 그룹 · 멤버 · 상태 · 정산 (2026-10-15 사용자: "프로젝트 그룹을 만들고 계산서를 그룹에서 한번에, 상태 대기/진행중/완료,
// 정산 받은 금액/계약 금액. 해당 내역은 오너는 기본으로, 멤버는 오너가 설정해 준다")
import { authenticate, normalizeEmail, type Account } from './auth';
import { json, randomToken, readJson, text } from './http';
import { pubProject, type ProjectRow } from './projects';

export interface GroupRow { id: string; owner_id: string; name: string; created_at: number }
interface MemberRow { group_id: string; account_id: string; can_billing: number; created_at: number }

const NAME_MAX = 60;
export const PROJECT_STATUSES = ['waiting', 'ongoing', 'done'] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

const getGroup = (env: Env, id: string) => env.DB.prepare('SELECT * FROM groups WHERE id = ?').bind(id).first<GroupRow>();
const getMember = (env: Env, groupId: string, accountId: string) =>
  env.DB.prepare('SELECT * FROM group_members WHERE group_id = ? AND account_id = ?').bind(groupId, accountId).first<MemberRow>();

/** 그룹에 대한 내 자격: 오너(정산 기본) / 멤버(오너가 정한 정산 보기) / 없음 */
async function groupAccess(env: Env, g: GroupRow, me: Account): Promise<{ role: 'owner' | 'member'; canBilling: boolean } | null> {
  if (g.owner_id === me.id) return { role: 'owner', canBilling: true };
  const m = await getMember(env, g.id, me.id);
  return m ? { role: 'member', canBilling: !!m.can_billing } : null;
}

const pubGroup = (g: GroupRow, a: { role: 'owner' | 'member'; canBilling: boolean }) => ({ id: g.id, name: g.name, createdAt: g.created_at, role: a.role, canBilling: a.canBilling });

/** 그룹 보기용 프로젝트: 정산 금액은 볼 수 있는 사람에게만 */
const pubProjectIn = (p: ProjectRow, billing: boolean) => {
  const base = pubProject(p, 'owner');
  if (billing) return base;
  const { contractAmount: _c, paidAmount: _p, ...rest } = base;
  return rest;
};

export async function handleGroups(req: Request, env: Env, pathname: string): Promise<Response> {
  const me = await authenticate(req, env);
  if (!me) return text('unauthorized', 401);

  if (pathname === '/api/groups') {
    if (req.method === 'GET') {
      const own = await env.DB.prepare('SELECT * FROM groups WHERE owner_id = ? ORDER BY created_at DESC, id').bind(me.id).all<GroupRow>();
      const joined = await env.DB.prepare('SELECT g.*, m.can_billing FROM group_members m JOIN groups g ON g.id = m.group_id WHERE m.account_id = ? ORDER BY g.created_at DESC, g.id')
        .bind(me.id).all<GroupRow & { can_billing: number }>();
      return json({ groups: [...own.results.map((g) => pubGroup(g, { role: 'owner', canBilling: true })), ...joined.results.map((g) => pubGroup(g, { role: 'member', canBilling: !!g.can_billing }))] });
    }
    if (req.method === 'POST') {
      const body = await readJson<{ name?: string }>(req);
      const name = typeof body?.name === 'string' ? body.name.trim().slice(0, NAME_MAX) : '';
      if (!name) return text('bad name', 400);
      const g: GroupRow = { id: randomToken().slice(0, 16), owner_id: me.id, name, created_at: Date.now() };
      await env.DB.prepare('INSERT INTO groups (id, owner_id, name, created_at) VALUES (?, ?, ?, ?)').bind(g.id, g.owner_id, g.name, g.created_at).run();
      return json({ group: pubGroup(g, { role: 'owner', canBilling: true }) }, 201);
    }
    return text('method', 405);
  }

  const m = pathname.match(/^\/api\/groups\/([^/]+)(?:\/members(?:\/([^/]+))?)?$/);
  if (!m) return text('not found', 404);
  const g = await getGroup(env, m[1]);
  if (!g) return text('group not found', 404);
  const access = await groupAccess(env, g, me);
  if (!access) return text('forbidden', 403);
  const membersPath = pathname.includes('/members');
  const memberId = m[2];

  if (!membersPath) {
    if (req.method === 'GET') {
      const projects = await env.DB.prepare('SELECT * FROM projects WHERE group_id = ? ORDER BY created_at DESC, id').bind(g.id).all<ProjectRow>();
      const out: Record<string, unknown> = { group: pubGroup(g, access), projects: projects.results.map((p) => pubProjectIn(p, access.canBilling)) };
      if (access.role === 'owner') {
        const members = await env.DB.prepare('SELECT m.account_id, m.can_billing, m.created_at, a.email, a.name FROM group_members m JOIN accounts a ON a.id = m.account_id WHERE m.group_id = ? ORDER BY m.created_at')
          .bind(g.id).all<{ account_id: string; can_billing: number; created_at: number; email: string; name: string }>();
        out.members = members.results.map((r) => ({ accountId: r.account_id, email: r.email, name: r.name, canBilling: !!r.can_billing, createdAt: r.created_at }));
      }
      return json(out);
    }
    if (access.role !== 'owner') return text('forbidden', 403);
    if (req.method === 'PATCH') {
      const body = await readJson<{ name?: string }>(req);
      const name = typeof body?.name === 'string' ? body.name.trim().slice(0, NAME_MAX) : '';
      if (!name) return text('bad name', 400);
      await env.DB.prepare('UPDATE groups SET name = ? WHERE id = ?').bind(name, g.id).run();
      return json({ group: pubGroup({ ...g, name }, access) });
    }
    if (req.method === 'DELETE') {
      await env.DB.batch([
        env.DB.prepare('UPDATE projects SET group_id = NULL WHERE group_id = ?').bind(g.id),
        env.DB.prepare('DELETE FROM group_members WHERE group_id = ?').bind(g.id),
        env.DB.prepare('DELETE FROM groups WHERE id = ?').bind(g.id),
      ]);
      return new Response(null, { status: 204 });
    }
    return text('method', 405);
  }

  // 멤버 관리는 오너만
  if (access.role !== 'owner') return text('forbidden', 403);
  if (!memberId && req.method === 'POST') {
    const body = await readJson<{ email?: string; canBilling?: boolean }>(req);
    const email = typeof body?.email === 'string' ? normalizeEmail(body.email) : '';
    if (!email) return text('bad email', 400);
    const acc = await env.DB.prepare('SELECT * FROM accounts WHERE email = ?').bind(email).first<Account>();
    if (!acc) return text('account not found', 404);
    if (acc.id === me.id) return text('owner', 400);
    const row: MemberRow = { group_id: g.id, account_id: acc.id, can_billing: body?.canBilling ? 1 : 0, created_at: Date.now() };
    await env.DB.prepare('INSERT OR REPLACE INTO group_members (group_id, account_id, can_billing, created_at) VALUES (?, ?, ?, ?)').bind(row.group_id, row.account_id, row.can_billing, row.created_at).run();
    return json({ member: { accountId: acc.id, email: acc.email, name: acc.name, canBilling: !!row.can_billing, createdAt: row.created_at } }, 201);
  }
  if (memberId && req.method === 'PATCH') {
    const body = await readJson<{ canBilling?: boolean }>(req);
    if (typeof body?.canBilling !== 'boolean') return text('bad body', 400);
    const r = await env.DB.prepare('UPDATE group_members SET can_billing = ? WHERE group_id = ? AND account_id = ?').bind(body.canBilling ? 1 : 0, g.id, memberId).run();
    if (!r.meta.changes) return text('member not found', 404);
    return json({ ok: true });
  }
  if (memberId && req.method === 'DELETE') {
    await env.DB.prepare('DELETE FROM group_members WHERE group_id = ? AND account_id = ?').bind(g.id, memberId).run();
    return new Response(null, { status: 204 });
  }
  return text('method', 405);
}
