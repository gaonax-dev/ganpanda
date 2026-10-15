// 프로젝트 그룹 · 상태 · 정산 (2026-10-15 사용자: "프로젝트 그룹을 만들고 계산서를 그룹에서 한번에, 상태 대기/진행중/완료,
// 정산 받은 금액/계약 금액. 오너는 기본으로, 멤버는 오너가 설정해 준다"). 멤버는 팀(설정) 단위 → team.ts
import { authenticate } from './auth';
import { json, randomToken, readJson, text } from './http';
import { pubProject, type ProjectRow } from './projects';
import { teamAccess } from './team';

export interface GroupRow { id: string; owner_id: string; name: string; created_at: number }

const NAME_MAX = 60;
const getGroup = (env: Env, id: string) => env.DB.prepare('SELECT * FROM groups WHERE id = ?').bind(id).first<GroupRow>();
const pubGroup = (g: GroupRow, a: { role: 'owner' | 'member'; canBilling: boolean }) => ({ id: g.id, name: g.name, createdAt: g.created_at, role: a.role, canBilling: a.canBilling });

/** 그룹 보기용 프로젝트: 정산 금액은 볼 수 있는 사람에게만 */
const pubProjectIn = (p: ProjectRow, billing: boolean) => {
  const base = pubProject(p, 'owner');
  if (billing) return base;
  const { contractAmount: _c, paidAmount: _p, quoteTotal: _q, ...rest } = base;
  return rest;
};

export async function handleGroups(req: Request, env: Env, pathname: string): Promise<Response> {
  const me = await authenticate(req, env);
  if (!me) return text('unauthorized', 401);

  if (pathname === '/api/groups') {
    if (req.method === 'GET') {
      const own = await env.DB.prepare('SELECT * FROM groups WHERE owner_id = ? ORDER BY created_at DESC, id').bind(me.id).all<GroupRow>();
      // 내가 팀 멤버인 오너들의 그룹
      const joined = await env.DB.prepare('SELECT g.*, m.can_billing FROM team_members m JOIN groups g ON g.owner_id = m.owner_id WHERE m.account_id = ? ORDER BY g.created_at DESC, g.id')
        .bind(me.id).all<GroupRow & { can_billing: number }>();
      return json({ groups: [...own.results.map((g) => pubGroup(g, { role: 'owner', canBilling: true })), ...joined.results.map((g) => pubGroup(g, { role: 'member', canBilling: !!g.can_billing }))] });
    }
    if (req.method === 'POST') {
      // 이름 + (선택) 바로 넣을 프로젝트들 (시프트로 고른 뒤 오른쪽 클릭 → 그룹 만들기)
      const body = await readJson<{ name?: string; projectIds?: string[] }>(req);
      const name = typeof body?.name === 'string' ? body.name.trim().slice(0, NAME_MAX) : '';
      if (!name) return text('bad name', 400);
      const g: GroupRow = { id: randomToken().slice(0, 16), owner_id: me.id, name, created_at: Date.now() };
      const ids = Array.isArray(body?.projectIds) ? body!.projectIds!.filter((x): x is string => typeof x === 'string').slice(0, 200) : [];
      await env.DB.batch([
        env.DB.prepare('INSERT INTO groups (id, owner_id, name, created_at) VALUES (?, ?, ?, ?)').bind(g.id, g.owner_id, g.name, g.created_at),
        ...ids.map((id) => env.DB.prepare('UPDATE projects SET group_id = ? WHERE id = ? AND owner_id = ?').bind(g.id, id, me.id)),
      ]);
      return json({ group: pubGroup(g, { role: 'owner', canBilling: true }) }, 201);
    }
    return text('method', 405);
  }

  const m = pathname.match(/^\/api\/groups\/([^/]+)$/);
  if (!m) return text('not found', 404);
  const g = await getGroup(env, m[1]);
  if (!g) return text('group not found', 404);
  const access = await teamAccess(env, g.owner_id, me);
  if (!access) return text('forbidden', 403);

  if (req.method === 'GET') {
    const projects = await env.DB.prepare('SELECT * FROM projects WHERE group_id = ? ORDER BY created_at DESC, id').bind(g.id).all<ProjectRow>();
    return json({ group: pubGroup(g, access), projects: projects.results.map((p) => pubProjectIn(p, access.canBilling)) });
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
      env.DB.prepare('DELETE FROM groups WHERE id = ?').bind(g.id),
    ]);
    return new Response(null, { status: 204 });
  }
  return text('method', 405);
}
