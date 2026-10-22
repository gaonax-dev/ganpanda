// 톡 색인과 메인 화면 톡 (2026-10-22 사용자: "메인화면에서 모든 톡방을 열어서 확인하고 링크를 누르면 해당 프로젝트의 링크로 이동", "닉은 사용하는데 아이디로 연결하라는 거지")
// 방 원본은 프로젝트 문서(Yjs talks). 서버는 방이 생기거나 톡 메시지가 오갈 때 talk_index 를 다시 만든다 — 멤버(계정 id)마다 한 줄.
import { authenticate } from './auth';
import { json, readJson, text } from './http';
import { getProject } from './projects';

const ROOM_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

/** 회사 멤버 = 소유자 + 소유자의 팀 멤버 */
async function companyIds(env: Env, ownerId: string): Promise<string[]> {
  const r = await env.DB.prepare('SELECT account_id FROM team_members WHERE owner_id = ?').bind(ownerId).all<{ account_id: string }>();
  return [ownerId, ...r.results.map((x) => x.account_id)];
}

/** 프로젝트의 톡 색인을 문서 내용으로 다시 만든다. 손님 아이디(g:…)는 계정이 없어 색인하지 않는다 */
export async function syncTalkIndex(env: Env, projectId: string): Promise<void> {
  const project = await getProject(env, projectId);
  if (!project) return;
  const rooms = await env.ROOM.getByName(projectId).talkIndex();
  const company = await companyIds(env, project.owner_id);
  const stmts = [env.DB.prepare('DELETE FROM talk_index WHERE project_id = ?').bind(projectId)];
  for (const r of rooms) {
    const ids = r.id === 'team' ? company : [r.createdById, ...r.memberIds];
    for (const a of new Set(ids.filter((x) => x && !x.startsWith('g:')))) {
      stmts.push(env.DB.prepare('INSERT INTO talk_index (account_id, project_id, room_id, room_name, last_ts, last_text, last_author) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .bind(a, projectId, r.id, r.name.slice(0, 40), r.last?.ts ?? 0, r.last?.text ?? '', r.last?.author ?? ''));
    }
  }
  await env.DB.batch(stmts);
}

/** 이 계정이 이 프로젝트의 어느 톡방 멤버인가 (방 멤버는 초대 링크 없이 프로젝트에 들어간다) */
export async function talkMember(env: Env, accountId: string, projectId: string, roomId?: string): Promise<boolean> {
  const q = roomId
    ? env.DB.prepare('SELECT 1 FROM talk_index WHERE account_id = ? AND project_id = ? AND room_id = ?').bind(accountId, projectId, roomId)
    : env.DB.prepare('SELECT 1 FROM talk_index WHERE account_id = ? AND project_id = ? LIMIT 1').bind(accountId, projectId);
  return !!(await q.first());
}

interface Row { project_id: string; room_id: string; room_name: string; last_ts: number; last_text: string; last_author: string; project_name: string | null }

/** /api/me/talks — 내 모든 톡방 · /api/me/talks/:project/:room — 그 방 메시지 읽기(GET)·보내기(POST) */
export async function handleMyTalks(req: Request, env: Env, pathname: string): Promise<Response> {
  const me = await authenticate(req, env);
  if (!me) return text('unauthorized', 401);
  if (pathname === '/api/me/talks' && req.method === 'GET') {
    const r = await env.DB.prepare('SELECT t.*, p.name AS project_name FROM talk_index t LEFT JOIN projects p ON p.id = t.project_id WHERE t.account_id = ? ORDER BY t.last_ts DESC LIMIT 200').bind(me.id).all<Row>();
    return json({ talks: r.results.map((x) => ({ projectId: x.project_id, projectName: x.project_name ?? '', roomId: x.room_id, roomName: x.room_name, last: x.last_ts ? { ts: x.last_ts, text: x.last_text, author: x.last_author } : null })) });
  }
  const m = pathname.match(/^\/api\/me\/talks\/([^/]+)\/([^/]+)$/);
  if (!m) return text('not found', 404);
  const projectId = decodeURIComponent(m[1]), roomId = decodeURIComponent(m[2]);
  if (!ROOM_ID_RE.test(roomId) || !(await talkMember(env, me.id, projectId, roomId))) return text('forbidden', 403);
  const room = env.ROOM.getByName(projectId);
  if (req.method === 'GET') return json({ messages: await room.talkMessages(roomId) });
  if (req.method === 'POST') {
    const b = await readJson<{ text?: string }>(req);
    const t = typeof b?.text === 'string' ? b.text.trim().slice(0, 2000) : '';
    if (!t) return text('bad message', 400);
    const msg = await room.addMessage(`talk:${roomId}`, me.name || me.email.split('@')[0], t, 'chat', [], [], me.id);
    await syncTalkIndex(env, projectId);
    return json({ message: msg }, 201);
  }
  return text('method not allowed', 405);
}
