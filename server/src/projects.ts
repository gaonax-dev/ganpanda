// 프로젝트(= 방)·초대 링크·접근 권한 (1-2b)
import { authenticate, type Account } from './auth';
import { json, randomToken, readJson, sha256hex, text } from './http';
import { planOf } from './plans';

export type Role = 'owner' | 'editor' | 'viewer';
const INVITE_ROLES = new Set<Role>(['viewer', 'editor']);
const NAME_MAX = 60;

export interface ProjectRow { id: string; owner_id: string; name: string; created_at: number }
interface InviteRow { token_hash: string; project_id: string; role: Role; created_at: number; revoked_at: number | null }

/** 방 ID: 16자 base64url (서버 ROOM_RE 와 호환) */
const newRoomId = () => randomToken().slice(0, 16);
const inviteUrl = (env: Env, projectId: string, token: string) =>
  `${env.APP_URL.replace(/\/+$/, '')}/?room=${projectId}&invite=${token}`;
const pub = (p: ProjectRow, role: Role) => ({ id: p.id, name: p.name, createdAt: p.created_at, role });

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
    const seats = { used: await env.ACCOUNT.getByName(r.project.owner_id).usedSeats(), limit: planOf(owner?.plan ?? 'free').seats };
    return json({ role: r.role, project: { id: r.project.id, name: r.project.name }, seats });
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
      const p: ProjectRow = { id: newRoomId(), owner_id: me.id, name, created_at: Date.now() };
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
      const body = await readJson<{ name?: string }>(req);
      const name = typeof body?.name === 'string' ? body.name.trim().slice(0, NAME_MAX) : '';
      if (!name) return text('bad name', 400);
      await env.DB.prepare('UPDATE projects SET name = ? WHERE id = ?').bind(name, project.id).run();
      return json({ project: pub({ ...project, name }, 'owner') });
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
      return json({ invites: rows.results.map((r) => ({ id: r.token_hash.slice(0, 16), role: r.role, createdAt: r.created_at, revoked: !!r.revoked_at })) });
    }
    if (req.method === 'POST') {
      const body = await readJson<{ role?: Role }>(req);
      const role = body?.role;
      if (!role || !INVITE_ROLES.has(role)) return text('bad role', 400);
      const token = randomToken();
      await env.DB.prepare('INSERT INTO invites (token_hash, project_id, role, created_at) VALUES (?, ?, ?, ?)')
        .bind(await sha256hex(token), project.id, role, Date.now()).run();
      return json({ token, role, url: inviteUrl(env, project.id, token) }, 201);
    }
  } else if (req.method === 'DELETE') {
    await env.DB.prepare('UPDATE invites SET revoked_at = ? WHERE project_id = ? AND substr(token_hash, 1, 16) = ?')
      .bind(Date.now(), project.id, inviteId).run();
    return new Response(null, { status: 204 });
  }
  return text('not found', 404);
}
