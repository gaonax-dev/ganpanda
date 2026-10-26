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
    // 고객이 있는 방 (2026-10-26): 회사 밖 사람 — 계정 없는 손님(g:…)도
    const customer = r.id !== 'team' && ids.some((x) => x && !company.includes(x)) ? 1 : 0;
    for (const a of new Set(ids.filter((x) => x && !x.startsWith('g:')))) {
      stmts.push(env.DB.prepare('INSERT INTO talk_index (account_id, project_id, room_id, room_name, last_ts, last_text, last_author, customer) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(a, projectId, r.id, r.name.slice(0, 40), r.last?.ts ?? 0, r.last?.text ?? '', r.last?.author ?? '', customer));
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

interface Row { project_id: string; room_id: string; room_name: string; last_ts: number; last_text: string; last_author: string; project_name: string | null; customer: number }

/** /api/me/talks — 내 모든 톡방 · /api/me/talks/:project/:room — 그 방 메시지 읽기(GET)·보내기(POST) */
export async function handleMyTalks(req: Request, env: Env, pathname: string): Promise<Response> {
  const me = await authenticate(req, env);
  if (!me) return text('unauthorized', 401);
  if (pathname === '/api/me/talks' && req.method === 'GET') {
    const r = await env.DB.prepare('SELECT t.*, p.name AS project_name FROM talk_index t LEFT JOIN projects p ON p.id = t.project_id WHERE t.account_id = ? ORDER BY t.last_ts DESC LIMIT 200').bind(me.id).all<Row>();
    // 방 멤버 아이디 (2026-10-26 [사용자] 탭에서 사람을 누르면 그 사람이 있는 방만)
    const members = new Map<string, string[]>();
    const pids = [...new Set(r.results.map((x) => x.project_id))];
    for (let i = 0; i < pids.length; i += 50) {
      const part = pids.slice(i, i + 50);
      const rows = await env.DB.prepare(`SELECT project_id, room_id, account_id FROM talk_index WHERE project_id IN (${part.map(() => '?').join(',')})`).bind(...part).all<{ project_id: string; room_id: string; account_id: string }>();
      for (const m of rows.results) { const k = `${m.project_id}/${m.room_id}`; members.set(k, [...(members.get(k) ?? []), m.account_id]); }
    }
    return json({ talks: r.results.map((x) => ({ projectId: x.project_id, projectName: x.project_name ?? '', roomId: x.room_id, roomName: x.room_name, customer: !!x.customer, memberIds: members.get(`${x.project_id}/${x.room_id}`) ?? [], last: x.last_ts ? { ts: x.last_ts, text: x.last_text, author: x.last_author } : null })) });
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

/**
 * /api/me/people — 메인 톡 [사용자] 탭 (2026-10-26 "사용자에 맴버, 요청, 고객 배지"): 나와 이어진 사람들.
 * member = 같은 회사(내가 소유자면 팀 멤버, 팀 멤버면 소유자와 다른 멤버) · customer = 회사 프로젝트 톡방의 회사 밖 계정 · request = 회사가 제안해 연락처가 열린(결제된) 견적 요청을 보낸 계정.
 * 이름만 돌려준다(이메일·연락처 없음). 계정 없는 손님은 목록에 없다
 */
export async function handleMyPeople(req: Request, env: Env): Promise<Response> {
  const me = await authenticate(req, env);
  if (!me) return text('unauthorized', 401);
  const ownerRows = await env.DB.prepare('SELECT owner_id FROM team_members WHERE account_id = ?').bind(me.id).all<{ owner_id: string }>();
  const owners = [me.id, ...ownerRows.results.map((x) => x.owner_id)];
  const company = new Set<string>();
  for (const o of owners) for (const id of await companyIds(env, o)) company.add(id);
  const badges = new Map<string, Set<string>>();
  const add = (id: string, b: string) => { if (id && id !== me.id) badges.set(id, (badges.get(id) ?? new Set()).add(b)); };
  for (const id of company) add(id, 'member');
  const inOwners = owners.map(() => '?').join(',');
  const talk = await env.DB.prepare(`SELECT DISTINCT t.account_id FROM talk_index t JOIN projects p ON p.id = t.project_id WHERE p.owner_id IN (${inOwners})`).bind(...owners).all<{ account_id: string }>();
  for (const x of talk.results) if (!company.has(x.account_id)) add(x.account_id, 'customer');
  const asked = await env.DB.prepare(`SELECT DISTINCT q.account_id FROM request_responses rr JOIN requests q ON q.id = rr.request_id WHERE rr.account_id IN (${inOwners}) AND rr.paid_at IS NOT NULL AND q.account_id IS NOT NULL`).bind(...owners).all<{ account_id: string }>();
  for (const x of asked.results) if (!company.has(x.account_id)) add(x.account_id, 'request');
  const ids = [...badges.keys()];
  const names = new Map<string, string>();
  for (let i = 0; i < ids.length; i += 50) {
    const part = ids.slice(i, i + 50);
    const rows = await env.DB.prepare(`SELECT id, name, email FROM accounts WHERE id IN (${part.map(() => '?').join(',')})`).bind(...part).all<{ id: string; name: string | null; email: string }>();
    for (const a of rows.results) names.set(a.id, a.name || a.email.split('@')[0]);
  }
  const ORDER = ['member', 'request', 'customer'];
  const people = ids.filter((id) => names.has(id)).map((id) => ({ id, name: names.get(id)!, badges: ORDER.filter((b) => badges.get(id)!.has(b)) }))
    .sort((a, b) => ORDER.indexOf(a.badges[0]) - ORDER.indexOf(b.badges[0]) || a.name.localeCompare(b.name, 'ko'));
  return json({ people });
}
