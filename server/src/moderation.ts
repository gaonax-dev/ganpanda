// 신고·차단 (2026-10-26 사용자: "신고·차단 기능 진행해줘" — 앱스토어 1.2 사용자 생성 콘텐츠: 신고 수단·사용자 차단·운영자 처리·연락처).
// 2026-10-24 "신고 단추 필요없다"는 간판다 밖 거래 신고(가게 사장 → 간판집, bypass.ts)에 대한 것 — 이것은 대화·사용자 신고
import { authenticate } from './auth';
import { json, randomToken, readJson, text } from './http';
import { isOperator, operatorEmails } from './operator';
import { resolveAccess } from './projects';

export const REPORT_REASONS = ['spam', 'abuse', 'sexual', 'fraud', 'other'] as const;
const REASON_LABEL: Record<string, string> = { spam: '스팸·광고', abuse: '욕설·괴롭힘·혐오', sexual: '음란물', fraud: '사기·개인정보 침해', other: '기타' };
const FROM = { email: 'login@ganpanda.co.kr', name: '간판다' };
const ID_RE = /^[A-Za-z0-9:_-]{1,80}$/;
const str = (v: unknown, n: number) => (typeof v === 'string' ? v.trim().slice(0, n) : '');

/** POST /api/reports — 로그인했거나, 프로젝트 메시지면 그 프로젝트에 들어올 수 있는 사람(초대 링크 손님 포함) */
export async function handleReports(req: Request, env: Env, url: URL): Promise<Response> {
  if (req.method !== 'POST') return text('method not allowed', 405);
  const b = await readJson<{ projectId?: string; messageId?: string; targetId?: string; targetName?: string; reason?: string; detail?: string; reporterName?: string }>(req);
  const reason = str(b?.reason, 20);
  if (!(REPORT_REASONS as readonly string[]).includes(reason)) return json({ error: 'bad_reason' }, 400);
  const projectId = str(b?.projectId, 64), messageId = str(b?.messageId, 64), targetId = str(b?.targetId, 80);
  if (targetId && !ID_RE.test(targetId)) return json({ error: 'bad_target' }, 400);
  let reporterId: string | null = null, reporterName = str(b?.reporterName, 40), excerpt = '';
  if (projectId) {
    const r = await resolveAccess(req, env, projectId, url.searchParams.get('invite'));
    if (typeof r === 'number') return text('no access', r);
    reporterId = r.account?.id ?? null;
    if (r.account) reporterName = r.account.name || r.account.email.split('@')[0];
    if (messageId) excerpt = ((await env.ROOM.getByName(projectId).messageText(messageId)) ?? '').slice(0, 500);
  } else {
    const me = await authenticate(req, env);
    if (!me) return text('unauthorized', 401);
    reporterId = me.id; reporterName = me.name || me.email.split('@')[0];
  }
  if (!targetId && !messageId) return json({ error: 'target_required' }, 400);
  const id = randomToken().slice(0, 16), now = Date.now(), targetName = str(b?.targetName, 40), detail = str(b?.detail, 1000);
  await env.DB.prepare('INSERT INTO content_reports (id, project_id, message_id, target_id, target_name, reason, detail, excerpt, reporter_id, reporter_name, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(id, projectId || null, messageId || null, targetId || null, targetName, reason, detail, excerpt, reporterId, reporterName, now).run();
  // 운영자에게 바로 메일 (24시간 안에 처리)
  if (env.EMAIL) for (const to of operatorEmails(env)) {
    try { await env.EMAIL.send({ to, from: FROM, subject: `[간판다] 신고 — ${REASON_LABEL[reason]}`, text: `신고가 들어왔습니다 (24시간 안에 처리).\n\n이유: ${REASON_LABEL[reason]}\n대상: ${targetName || targetId || '-'}\n${excerpt ? `메시지: ${excerpt}\n` : ''}${detail ? `내용: ${detail}\n` : ''}신고한 사람: ${reporterName || '-'}\n\n운영자 API: GET /api/operator/content-reports` }); } catch { /* 무시 */ }
  }
  return json({ ok: true, id }, 201);
}

/** /api/me/blocks — GET 목록 · POST {id, name} 추가 · DELETE /api/me/blocks/:id 해제 */
export async function handleBlocks(req: Request, env: Env, pathname: string): Promise<Response> {
  const me = await authenticate(req, env);
  if (!me) return text('unauthorized', 401);
  if (pathname === '/api/me/blocks' && req.method === 'GET') {
    const r = await env.DB.prepare('SELECT blocked_id AS id, name, created_at AS at FROM blocks WHERE account_id = ? ORDER BY created_at DESC').bind(me.id).all<{ id: string; name: string; at: number }>();
    return json({ blocks: r.results });
  }
  if (pathname === '/api/me/blocks' && req.method === 'POST') {
    const b = await readJson<{ id?: string; name?: string }>(req);
    const id = str(b?.id, 80);
    if (!id || !ID_RE.test(id) || id === me.id) return json({ error: 'bad_target' }, 400);
    await env.DB.prepare('INSERT OR REPLACE INTO blocks (account_id, blocked_id, name, created_at) VALUES (?, ?, ?, ?)').bind(me.id, id, str(b?.name, 40), Date.now()).run();
    return json({ ok: true }, 201);
  }
  const m = pathname.match(/^\/api\/me\/blocks\/(.+)$/);
  if (m && req.method === 'DELETE') {
    await env.DB.prepare('DELETE FROM blocks WHERE account_id = ? AND blocked_id = ?').bind(me.id, decodeURIComponent(m[1])).run();
    return json({ ok: true });
  }
  return text('not found', 404);
}

type Row = { id: string; project_id: string | null; message_id: string | null; target_id: string | null; target_name: string; reason: string; detail: string; excerpt: string; reporter_name: string; status: string; action: string | null; created_at: number; resolved_at: number | null };
/** 운영자: GET /api/operator/content-reports · POST /api/operator/content-reports/:id {action: hide|dismiss} — hide = 그 메시지를 문서에서 지운다 */
export async function handleContentReports(req: Request, env: Env, pathname: string): Promise<Response> {
  const me = await authenticate(req, env);
  if (!me) return text('unauthorized', 401);
  if (!isOperator(env, me.email)) return text('forbidden', 403);
  if (pathname === '/api/operator/content-reports' && req.method === 'GET') {
    const rows = (await env.DB.prepare('SELECT * FROM content_reports ORDER BY created_at DESC LIMIT 200').all<Row>()).results;
    return json({ reports: rows.map((r) => ({ id: r.id, projectId: r.project_id, messageId: r.message_id, targetId: r.target_id, targetName: r.target_name, reason: r.reason, reasonLabel: REASON_LABEL[r.reason] ?? r.reason, detail: r.detail, excerpt: r.excerpt, reporterName: r.reporter_name, status: r.status, ...(r.action ? { action: r.action } : {}), createdAt: r.created_at, ...(r.resolved_at ? { resolvedAt: r.resolved_at } : {}) })) });
  }
  const m = pathname.match(/^\/api\/operator\/content-reports\/([A-Za-z0-9_-]{1,32})$/);
  if (m && req.method === 'POST') {
    const b = await readJson<{ action?: string }>(req);
    const action = b?.action === 'hide' ? 'hide' : b?.action === 'dismiss' ? 'dismiss' : null;
    if (!action) return json({ error: 'bad_action' }, 400);
    const r = await env.DB.prepare('SELECT * FROM content_reports WHERE id = ?').bind(m[1]).first<Row>();
    if (!r) return text('not found', 404);
    if (action === 'hide' && r.project_id && r.message_id) await env.ROOM.getByName(r.project_id).removeMessage(r.message_id);
    await env.DB.prepare("UPDATE content_reports SET status = 'resolved', action = ?, resolved_at = ? WHERE id = ?").bind(action, Date.now(), r.id).run();
    return json({ ok: true });
  }
  return text('not found', 404);
}
