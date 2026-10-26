// 계정 종류·전환·삭제 (2026-10-22 사용자: "사업자는 소비자 등록이 안된다. 소비자는 사업자로 변경하고 기존 데이터는 사업자로 이관된다, 계정삭제도 필요하다.")
import { authenticate, type Account } from './auth';
import { json, readJson, sha256hex, text } from './http';

export type AccountKind = 'shop' | 'consumer';

/** 종류가 없으면 정한다: 보통 프로젝트가 있으면 간판집, 아니면 want. 정해진 종류를 돌려준다 */
export async function settleKind(env: Env, me: Account, want: AccountKind): Promise<AccountKind> {
  if (me.kind === 'shop' || me.kind === 'consumer') return me.kind;
  const own = await env.DB.prepare("SELECT 1 FROM projects WHERE owner_id = ? AND (kind IS NULL OR kind NOT IN ('estimate', 'request')) LIMIT 1").bind(me.id).first();
  const kind: AccountKind = own ? 'shop' : want;
  await env.DB.prepare('UPDATE accounts SET kind = ? WHERE id = ?').bind(kind, me.id).run();
  me.kind = kind;
  return kind;
}

/** POST /api/me/kind {kind: 'shop'} — 가게 사장 → 간판집 (되돌릴 수 없음). 견적 초안 방은 보통 프로젝트가 되고 요청·사업자는 그대로 */
async function convert(req: Request, env: Env, me: Account): Promise<Response> {
  const b = await readJson<{ kind?: string }>(req);
  if (b?.kind !== 'shop') return json({ error: 'only_to_shop' }, 400); // 간판집 → 가게 사장은 없다
  await env.DB.batch([
    env.DB.prepare("UPDATE projects SET kind = NULL WHERE owner_id = ? AND kind = 'estimate'").bind(me.id),
    env.DB.prepare("UPDATE accounts SET kind = 'shop' WHERE id = ?").bind(me.id),
  ]);
  return json({ kind: 'shop' });
}

/** R2 의 prefix 아래를 모두 지운다 */
async function dropPrefix(bucket: R2Bucket, prefix: string) {
  let cursor: string | undefined;
  do {
    const l = await bucket.list({ prefix, cursor });
    if (l.objects.length) await bucket.delete(l.objects.map((o) => o.key));
    cursor = l.truncated ? l.cursor : undefined;
  } while (cursor);
}

/**
 * DELETE /api/me {confirm: '삭제'} — 계정 삭제. 되돌릴 수 없다.
 * 내 프로젝트(방·백업 포함)·그룹·팀·사업자·로그인 정보를 지우고, 내가 보낸 요청은 닫고 연락처·사업자 정보를 지운다(받은 간판집 기록은 남되 개인정보 없음).
 * 사진 에셋은 다른 계정이 쓰지 않는 것만 지운다(내용 해시로 공유됨)
 */
async function remove(req: Request, env: Env, me: Account): Promise<Response> {
  const b = await readJson<{ confirm?: string }>(req);
  if (b?.confirm !== '삭제') return json({ error: 'confirm_required' }, 400);
  const now = Date.now();
  const projects = (await env.DB.prepare('SELECT id FROM projects WHERE owner_id = ?').bind(me.id).all<{ id: string }>()).results.map((p) => p.id);
  const groups = (await env.DB.prepare('SELECT id FROM groups WHERE owner_id = ?').bind(me.id).all<{ id: string }>()).results.map((g) => g.id);
  const myRequests = (await env.DB.prepare('SELECT id FROM requests WHERE account_id = ?').bind(me.id).all<{ id: string }>()).results.map((r) => r.id);
  const stores = (await env.DB.prepare('SELECT id FROM stores WHERE account_id = ?').bind(me.id).all<{ id: string }>()).results.map((s) => s.id);
  const assets = (await env.DB.prepare('SELECT asset_id FROM account_assets WHERE account_id = ?').bind(me.id).all<{ asset_id: string }>()).results.map((a) => a.asset_id);
  const inList = (ids: string[]) => ids.map(() => '?').join(',');
  // 남의 프로젝트에 남긴 대화는 "탈퇴한 회원"으로 (2026-10-27 약관 제3조의3) — 들어간 적 있는 프로젝트 + 톡방 멤버였던 프로젝트
  const seen = new Set([
    ...(await env.DB.prepare('SELECT project_id FROM project_seen WHERE account_id = ?').bind(me.id).all<{ project_id: string }>()).results.map((x) => x.project_id),
    ...(await env.DB.prepare('SELECT DISTINCT project_id FROM talk_index WHERE account_id = ?').bind(me.id).all<{ project_id: string }>()).results.map((x) => x.project_id),
  ].filter((id) => !projects.includes(id)));
  for (const pid of seen) { try { await env.ROOM.getByName(pid).anonymizeAuthor(me.id); } catch { /* 방이 없으면 넘어간다 */ } }
  const stmts: D1PreparedStatement[] = [
    // 영구 정지된 채 탈퇴하면 1년 동안 같은 이메일로 다시 가입 못 함 (약관 개정안 제3조의2) — 이메일은 해시로만 남긴다
    ...(me.banned ? [env.DB.prepare('INSERT OR REPLACE INTO banned_emails (email_hash, until) VALUES (?, ?)').bind(await sha256hex(me.email.toLowerCase()), now + 365 * 86_400_000)] : []),
    env.DB.prepare('DELETE FROM project_seen WHERE account_id = ?').bind(me.id),
    env.DB.prepare('DELETE FROM talk_index WHERE account_id = ?').bind(me.id),
    env.DB.prepare('DELETE FROM blocks WHERE account_id = ?').bind(me.id),
    // 내가 보낸 요청: 닫고 개인정보를 지운다
    env.DB.prepare("UPDATE requests SET status = CASE WHEN status = 'open' THEN 'cancelled' ELSE status END, cancelled_at = COALESCE(cancelled_at, ?), phone = '', email = NULL, address = '', owner_name = NULL, start_date = NULL, biz_no = NULL, biz_doc = NULL, store_id = NULL, account_id = NULL WHERE account_id = ?").bind(now, me.id),
    env.DB.prepare('DELETE FROM request_responses WHERE account_id = ?').bind(me.id),
  ];
  if (projects.length) {
    stmts.push(
      env.DB.prepare(`UPDATE requests SET snapshot_project = NULL, snapshot_photos = NULL WHERE snapshot_project IN (${inList(projects)})`).bind(...projects),
      env.DB.prepare(`DELETE FROM request_responses WHERE project_id IN (${inList(projects)})`).bind(...projects),
      env.DB.prepare(`DELETE FROM invites WHERE project_id IN (${inList(projects)})`).bind(...projects),
      env.DB.prepare(`DELETE FROM projects WHERE id IN (${inList(projects)})`).bind(...projects),
    );
  }
  if (groups.length) {
    stmts.push(
      env.DB.prepare(`UPDATE projects SET group_id = NULL WHERE group_id IN (${inList(groups)})`).bind(...groups),
      env.DB.prepare(`DELETE FROM groups WHERE id IN (${inList(groups)})`).bind(...groups),
    );
  }
  stmts.push(
    env.DB.prepare('DELETE FROM team_members WHERE owner_id = ? OR account_id = ?').bind(me.id, me.id),
    env.DB.prepare('DELETE FROM team_invites WHERE owner_id = ? OR email = ?').bind(me.id, me.email), // 보낸·받은 멤버 초대 (2026-10-24)
    env.DB.prepare('DELETE FROM stores WHERE account_id = ?').bind(me.id),
    env.DB.prepare('DELETE FROM businesses WHERE account_id = ?').bind(me.id),
    env.DB.prepare('DELETE FROM spec_rules WHERE account_id = ?').bind(me.id),
    env.DB.prepare('UPDATE spec_samples SET account_id = NULL WHERE account_id = ?').bind(me.id),
    env.DB.prepare('DELETE FROM account_assets WHERE account_id = ?').bind(me.id),
    env.DB.prepare('DELETE FROM identities WHERE account_id = ?').bind(me.id),
    env.DB.prepare('DELETE FROM sessions WHERE account_id = ?').bind(me.id),
    env.DB.prepare('DELETE FROM login_tokens WHERE email = ?').bind(me.email),
    env.DB.prepare('DELETE FROM login_failures WHERE email = ?').bind(me.email),
    env.DB.prepare('DELETE FROM accounts WHERE id = ?').bind(me.id),
  );
  await env.DB.batch(stmts);
  // 저장소 정리 (D1 이 먼저 — 실패해도 계정은 이미 없다)
  for (const id of projects) {
    try { await env.ROOM.getByName(id).wipe(); } catch { /* 다음에 */ }
    try { await dropPrefix(env.BACKUP, `rooms/${id}/`); } catch { /* 다음에 */ }
  }
  for (const id of myRequests) { try { await dropPrefix(env.ASSETS, `requests/${id}/`); } catch { /* 다음에 */ } }
  for (const id of stores) { try { await dropPrefix(env.ASSETS, `stores/${id}/`); } catch { /* 다음에 */ } }
  for (const a of assets) {
    const used = await env.DB.prepare('SELECT 1 FROM account_assets WHERE asset_id = ? LIMIT 1').bind(a).first();
    if (!used) { try { await env.ASSETS.delete(a); await env.BACKUP.delete(a); } catch { /* 다음에 */ } }
  }
  return json({ ok: true });
}

export async function handleAccountKind(req: Request, env: Env, pathname: string): Promise<Response> {
  const me = await authenticate(req, env);
  if (!me) return text('unauthorized', 401);
  if (pathname === '/api/me/kind' && req.method === 'POST') return convert(req, env, me);
  if (pathname === '/api/me' && req.method === 'DELETE') return remove(req, env, me);
  return text('not found', 404);
}
