// 프로젝트(= 방)·초대 링크·접근 권한 (1-2b)
import { authenticate, type Account } from './auth';
import { teamAccess } from './team';
import { json, randomToken, readJson, sha256hex, text } from './http';
import { planOf } from './plans';
import { proposalsThisMonth } from './usage';
import { recordResponse } from './requests';

export type Role = 'owner' | 'editor' | 'viewer';
const INVITE_ROLES = new Set<Role>(['viewer', 'editor']);
const NAME_MAX = 60;

export interface ProjectRow { id: string; owner_id: string; name: string; created_at: number; request_id?: string | null; group_id?: string | null; status?: string; contract_amount?: number; paid_amount?: number; quote_total?: number; contract_override?: number | null }
interface InviteRow { token_hash: string; project_id: string; role: Role; created_at: number; revoked_at: number | null; kind?: string | null; /** 원문 (다시 복사용, 2026-10-17). 옛 링크는 null */ token?: string | null }

/** 방 ID: 16자 base64url (서버 ROOM_RE 와 호환) */
const newRoomId = () => randomToken().slice(0, 16);
const inviteUrl = (env: Env, projectId: string, token: string) =>
  `${env.APP_URL.replace(/\/+$/, '')}/?room=${projectId}&invite=${token}`;
/** 공개 형태: 그룹·상태(대기/진행중/완료)·정산(계약·받은 금액) 포함 (2026-10-15) */
/** 계약 금액 = 사용자가 입력한 값(contract_override) 또는 리스트 뷰 견적 합계(quote_total, 앱이 저장). contractAuto = 자동 */
export const pubProject = (p: ProjectRow, role: Role) => ({
  id: p.id, name: p.name, createdAt: p.created_at, role,
  groupId: p.group_id ?? null, status: p.status ?? 'waiting',
  quoteTotal: p.quote_total ?? 0,
  contractAmount: p.contract_override ?? p.quote_total ?? 0, contractAuto: p.contract_override == null,
  paidAmount: p.paid_amount ?? 0,
  ...(p.request_id ? { requestId: p.request_id } : {}),
});
const pub = pubProject;
const STATUSES = new Set(['waiting', 'ongoing', 'done']);
const amount = (v: unknown): number | null | undefined => (v === undefined ? undefined : typeof v === 'number' && isFinite(v) && v >= 0 ? Math.round(v) : null);

const getProject = (env: Env, id: string) => env.DB.prepare('SELECT * FROM projects WHERE id = ?').bind(id).first<ProjectRow>();

async function inviteByToken(env: Env, token: string): Promise<InviteRow | null> {
  const row = await env.DB.prepare('SELECT * FROM invites WHERE token_hash = ?').bind(await sha256hex(token)).first<InviteRow>();
  return row && !row.revoked_at ? row : null;
}

/**
 * 방 접근 권한: 소유자 세션 → owner, 초대 토큰 → 그 역할.
 * 반환: { role, project } | 상태 코드(401 자격 없음 / 403 권한 없음 / 404 방 없음)
 */
export async function resolveAccess(req: Request, env: Env, projectId: string, inviteToken: string | null)
  : Promise<{ role: Role; project: ProjectRow; account: Account | null } | 401 | 403 | 404> {
  const project = await getProject(env, projectId);
  if (!project) return 404;
  const account = await authenticate(req, env);
  if (account && account.id === project.owner_id) return { role: 'owner', project, account };
  if (inviteToken) {
    const inv = await inviteByToken(env, inviteToken);
    if (!inv) return account ? 403 : 401;
    if (inv.project_id !== project.id) return 403;
    return { role: inv.role, project, account };
  }
  return account ? 403 : 401;
}

export async function handleProjects(req: Request, env: Env, pathname: string, url: URL): Promise<Response> {
  // 초대 토큰 조회 (로그인 불필요)
  const inv = pathname.match(/^\/api\/invites\/([^/]+)$/);
  if (inv && req.method === 'GET') {
    const row = await inviteByToken(env, inv[1]);
    const project = row && (await getProject(env, row.project_id));
    if (!row || !project) return text('invite not found', 404);
    return json({ project: { id: project.id, name: project.name }, role: row.role });
  }

  // 방 접근 권한 (세션 또는 ?invite=)
  const access = pathname.match(/^\/api\/projects\/([^/]+)\/access$/);
  if (access && req.method === 'GET') {
    const r = await resolveAccess(req, env, access[1], url.searchParams.get('invite'));
    if (typeof r === 'number') return text('no access', r);
    const owner = await env.DB.prepare('SELECT plan FROM accounts WHERE id = ?').bind(r.project.owner_id).first<{ plan: string }>();
    const plan = planOf(owner?.plan ?? 'free');
    const seats = { used: await env.ACCOUNT.getByName(r.project.owner_id).usedSeats(), limit: plan.seats };
    // 정산 보기(이익율): 오너, 또는 오너 팀에서 "정산 보기"를 켠 멤버가 편집 초대로 들어온 경우 (2026-10-16)
    const billing = r.role === 'owner' || (r.role === 'editor' && !!r.account && !!(await teamAccess(env, r.project.owner_id, r.account))?.canBilling);
    // branding: 소유자 요금제가 무료면 제안 페이지에 "간판다로 만든 제안" (2026-10-17)
    // requestId: 요청에서 만든 프로젝트 — 소유자 앱이 요청 사진을 가져오는 신호 (2026-10-17)
    return json({ role: r.role, project: { id: r.project.id, name: r.project.name }, seats, billing, branding: plan.branding, ...(r.role === 'owner' && r.project.request_id ? { requestId: r.project.request_id } : {}) });
  }

  const me = await authenticate(req, env);
  if (!me) return text('unauthorized', 401);

  if (pathname === '/api/projects') {
    if (req.method === 'GET') {
      const rows = await env.DB.prepare('SELECT * FROM projects WHERE owner_id = ? ORDER BY created_at DESC, id').bind(me.id).all<ProjectRow>();
      return json({ projects: rows.results.map((p) => pub(p, 'owner')) });
    }
    if (req.method === 'POST') {
      const body = await readJson<{ name?: string }>(req);
      const name = typeof body?.name === 'string' ? body.name.trim().slice(0, NAME_MAX) : '';
      if (!name) return text('bad name', 400);
      const p: ProjectRow = { id: newRoomId(), owner_id: me.id, name, created_at: Date.now(), group_id: null, status: 'waiting', contract_amount: 0, paid_amount: 0, quote_total: 0, contract_override: null };
      await env.DB.prepare('INSERT INTO projects (id, owner_id, name, created_at) VALUES (?, ?, ?, ?)').bind(p.id, p.owner_id, p.name, p.created_at).run();
      return json({ project: pub(p, 'owner') }, 201);
    }
  }

  // 아래는 모두 소유자 전용
  const m = pathname.match(/^\/api\/projects\/([^/]+)(?:\/invites(?:\/([^/]+))?)?$/);
  if (!m) return text('not found', 404);
  const project = await getProject(env, m[1]);
  if (!project) return text('project not found', 404);
  if (project.owner_id !== me.id) return text('forbidden', 403);
  const sub = pathname.includes('/invites');
  const inviteId = m[2];

  if (!sub) {
    if (req.method === 'PATCH') {
      // 이름 · 그룹(내 그룹만, null = 그룹 없음) · 상태 · 계약 금액(숫자 = 직접 입력, null = 자동 계산 복구) · 받은 금액 · 견적 합계(앱이 저장) — 주어진 것만 바꾼다
      const body = await readJson<{ name?: string; groupId?: string | null; status?: string; contractAmount?: number | null; paidAmount?: number; quoteTotal?: number }>(req);
      if (!body) return text('bad body', 400);
      const next = { ...project };
      if (body.name !== undefined) { const name = typeof body.name === 'string' ? body.name.trim().slice(0, NAME_MAX) : ''; if (!name) return text('bad name', 400); next.name = name; }
      if (body.groupId !== undefined) {
        if (body.groupId === null) next.group_id = null;
        else {
          const g = await env.DB.prepare('SELECT owner_id FROM groups WHERE id = ?').bind(body.groupId).first<{ owner_id: string }>();
          if (!g) return text('group not found', 404);
          if (g.owner_id !== me.id) return text('forbidden', 403);
          next.group_id = body.groupId;
        }
      }
      if (body.status !== undefined) { if (typeof body.status !== 'string' || !STATUSES.has(body.status)) return text('bad status', 400); next.status = body.status; }
      const pd = amount(body.paidAmount), qt = amount(body.quoteTotal);
      if (pd === null || qt === null) return text('bad amount', 400);
      if (body.contractAmount === null) next.contract_override = null;
      else if (body.contractAmount !== undefined) { const c = amount(body.contractAmount); if (c === null || c === undefined) return text('bad amount', 400); next.contract_override = c; }
      if (pd !== undefined) next.paid_amount = pd;
      if (qt !== undefined) next.quote_total = qt;
      await env.DB.prepare('UPDATE projects SET name = ?, group_id = ?, status = ?, paid_amount = ?, quote_total = ?, contract_override = ? WHERE id = ?')
        .bind(next.name, next.group_id ?? null, next.status ?? 'waiting', next.paid_amount ?? 0, next.quote_total ?? 0, next.contract_override ?? null, project.id).run();
      return json({ project: pub(next, 'owner') });
    }
    if (req.method === 'DELETE') {
      await env.DB.batch([
        env.DB.prepare('DELETE FROM invites WHERE project_id = ?').bind(project.id),
        env.DB.prepare('DELETE FROM projects WHERE id = ?').bind(project.id),
      ]);
      return new Response(null, { status: 204 });
    }
  } else if (!inviteId) {
    if (req.method === 'GET') {
      const rows = await env.DB.prepare('SELECT * FROM invites WHERE project_id = ? ORDER BY created_at').bind(project.id).all<InviteRow>();
      // 토큰은 돌려주지 않는다. id = 해시 앞 16자
      // url: 소유자가 다시 복사할 수 있게 (폐기된 것·옛 링크는 없음) — 2026-10-17 "초대링크 다시보낼수 있게 복사버튼"
      return json({ invites: rows.results.map((r) => ({ id: r.token_hash.slice(0, 16), role: r.role, createdAt: r.created_at, revoked: !!r.revoked_at, ...(r.kind ? { kind: r.kind } : {}), ...(r.token && !r.revoked_at ? { url: inviteUrl(env, project.id, r.token) } : {}) })) });
    }
    if (req.method === 'POST') {
      const body = await readJson<{ role?: Role; kind?: string }>(req);
      const role = body?.role;
      if (!role || !INVITE_ROLES.has(role)) return text('bad role', 400);
      // kind = 'proposal': 제안 보내기 링크 — 무료 요금제는 한 달 건수 한도 (2026-10-17). 보통 초대는 세지 않는다
      const kind = body?.kind === 'proposal' ? 'proposal' : null;
      if (kind) {
        const limit = planOf(me.plan).proposalsPerMonth;
        const used = limit === null ? 0 : await proposalsThisMonth(env, me.id);
        if (limit !== null && used >= limit) return json({ error: 'proposal_limit', used, limit }, 402);
      }
      const token = randomToken();
      await env.DB.prepare('INSERT INTO invites (token_hash, project_id, role, created_at, kind, token) VALUES (?, ?, ?, ?, ?, ?)')
        .bind(await sha256hex(token), project.id, role, Date.now(), kind, token).run();
      if (kind) await recordResponse(env, project, `/p/${project.id}/${token}`); // 요청판 응답 기록 (경로만 — 앱이 서버 주소를 붙인다)
      return json({ token, role, url: inviteUrl(env, project.id, token) }, 201);
    }
  } else if (req.method === 'DELETE') {
    await env.DB.prepare('UPDATE invites SET revoked_at = ? WHERE project_id = ? AND substr(token_hash, 1, 16) = ?')
      .bind(Date.now(), project.id, inviteId).run();
    return new Response(null, { status: 204 });
  }
  return text('not found', 404);
}
