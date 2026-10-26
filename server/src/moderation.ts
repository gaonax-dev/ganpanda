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

// ---------- 운영자 계정 조치 · 이의 신청 (2026-10-27 "전부 진행해줘" — 약관 개정안 제5조의2) ----------
const FROM_NOTICE = { email: 'login@ganpanda.co.kr', name: '간판다' };
type MemberRow = { id: string; email: string; name: string; created_at: number; suspended_until: number | null; banned: number; suspend_reason: string | null; requests_blocked: number | null };
const statusOf = (m: MemberRow, now = Date.now()) => (m.banned ? 'banned' : m.suspended_until && m.suspended_until > now ? 'suspended' : 'active');
const ACTION_LABEL: Record<string, string> = { warn: '경고', suspend: '이용 정지', ban: '영구 이용 정지(이용계약 해지)', lift: '이용 제한 해제' };

async function notifyMember(env: Env, email: string, subject: string, body: string) {
  if (!env.EMAIL || email.endsWith('@noemail.ganpanda.co.kr')) return;
  try { await env.EMAIL.send({ to: email, from: FROM_NOTICE, subject: `[간판다] ${subject}`, text: body }); } catch { /* 무시 */ }
}

/**
 * 운영자: GET /api/operator/members?q= (이메일·이름·아이디) · POST /api/operator/members/:id/action {action: warn|suspend|ban|lift, days?, reason}
 * · GET /api/operator/appeals · POST /api/operator/appeals/:id {decision: accept|reject, reply}
 */
export async function handleMemberActions(req: Request, env: Env, pathname: string, url: URL): Promise<Response> {
  const me = await authenticate(req, env);
  if (!me) return text('unauthorized', 401);
  if (!isOperator(env, me.email)) return text('forbidden', 403);
  const now = Date.now();
  if (pathname === '/api/operator/members' && req.method === 'GET') {
    const q = str(url.searchParams.get('q'), 80);
    const rows = q
      ? (await env.DB.prepare('SELECT id, email, name, created_at, suspended_until, banned, suspend_reason, requests_blocked FROM accounts WHERE id = ? OR email LIKE ? OR name LIKE ? ORDER BY created_at DESC LIMIT 20').bind(q, `%${q}%`, `%${q}%`).all<MemberRow>()).results
      : (await env.DB.prepare('SELECT id, email, name, created_at, suspended_until, banned, suspend_reason, requests_blocked FROM accounts WHERE banned = 1 OR suspended_until > ? ORDER BY created_at DESC LIMIT 50').bind(now).all<MemberRow>()).results;
    const out = [];
    for (const m of rows) {
      const acts = (await env.DB.prepare('SELECT action, reason, until, by_email, created_at FROM account_actions WHERE account_id = ? ORDER BY created_at DESC LIMIT 20').bind(m.id).all<{ action: string; reason: string; until: number | null; by_email: string; created_at: number }>()).results;
      out.push({ id: m.id, email: m.email, name: m.name, createdAt: m.created_at, status: statusOf(m, now), until: m.suspended_until, reason: m.suspend_reason ?? '', requestsBlocked: !!m.requests_blocked, actions: acts.map((a) => ({ action: a.action, reason: a.reason, until: a.until, by: a.by_email, at: a.created_at })) });
    }
    return json({ members: out });
  }
  const act = pathname.match(/^\/api\/operator\/members\/([^/]+)\/action$/);
  if (act && req.method === 'POST') {
    const b = await readJson<{ action?: string; days?: number; reason?: string }>(req);
    const action = b?.action;
    if (action !== 'warn' && action !== 'suspend' && action !== 'ban' && action !== 'lift') return json({ error: 'bad_action' }, 400);
    const m = await env.DB.prepare('SELECT id, email, name, created_at, suspended_until, banned, suspend_reason, requests_blocked FROM accounts WHERE id = ?').bind(decodeURIComponent(act[1])).first<MemberRow>();
    if (!m) return text('not found', 404);
    if (isOperator(env, m.email)) return json({ error: 'operator' }, 400);
    const reason = str(b?.reason, 300);
    const days = Math.min(365, Math.max(1, Math.round(Number(b?.days) || 7)));
    const until = action === 'suspend' ? now + days * 86_400_000 : null;
    const stmts = [env.DB.prepare('INSERT INTO account_actions (id, account_id, action, reason, until, by_email, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(randomToken().slice(0, 16), m.id, action, reason, until, me.email, now)];
    if (action === 'suspend') stmts.push(env.DB.prepare('UPDATE accounts SET suspended_until = ?, suspend_reason = ? WHERE id = ?').bind(until, reason, m.id));
    if (action === 'ban') stmts.push(env.DB.prepare('UPDATE accounts SET banned = 1, suspend_reason = ? WHERE id = ?').bind(reason, m.id)); // 세션은 남긴다 — 로그인한 채 정지 화면과 이의 신청을 보게
    if (action === 'lift') stmts.push(env.DB.prepare('UPDATE accounts SET banned = 0, suspended_until = NULL, suspend_reason = NULL WHERE id = ?').bind(m.id));
    await env.DB.batch(stmts);
    const when = until ? ` (${new Date(until).toLocaleDateString('ko-KR')}까지)` : '';
    await notifyMember(env, m.email, ACTION_LABEL[action],
      action === 'lift' ? '간판다 이용 제한이 해제되었습니다. 다시 이용하실 수 있습니다.'
        : `간판다 이용약관에 따라 ${ACTION_LABEL[action]}${when} 조치를 했습니다.\n\n사유: ${reason || '-'}\n\n이 조치에 이의가 있으면 통지를 받은 날부터 14일 안에 간판다에 로그인해 이의를 신청하거나 support@ganpanda.co.kr 로 알려 주세요.`);
    return json({ ok: true, status: action === 'warn' ? statusOf(m, now) : action === 'lift' ? 'active' : action === 'ban' ? 'banned' : 'suspended' });
  }
  if (pathname === '/api/operator/appeals' && req.method === 'GET') {
    const rows = (await env.DB.prepare('SELECT p.*, a.email, a.name FROM appeals p LEFT JOIN accounts a ON a.id = p.account_id ORDER BY p.created_at DESC LIMIT 100').all<{ id: string; account_id: string; text: string; status: string; reply: string; created_at: number; resolved_at: number | null; email: string | null; name: string | null }>()).results;
    return json({ appeals: rows.map((r) => ({ id: r.id, accountId: r.account_id, email: r.email ?? '', name: r.name ?? '', text: r.text, status: r.status, reply: r.reply, createdAt: r.created_at, ...(r.resolved_at ? { resolvedAt: r.resolved_at } : {}) })) });
  }
  const ap = pathname.match(/^\/api\/operator\/appeals\/([A-Za-z0-9_-]{1,32})$/);
  if (ap && req.method === 'POST') {
    const b = await readJson<{ decision?: string; reply?: string }>(req);
    const decision = b?.decision === 'accept' ? 'accepted' : b?.decision === 'reject' ? 'rejected' : null;
    if (!decision) return json({ error: 'bad_decision' }, 400);
    const row = await env.DB.prepare('SELECT * FROM appeals WHERE id = ?').bind(ap[1]).first<{ id: string; account_id: string; status: string }>();
    if (!row) return text('not found', 404);
    const reply = str(b?.reply, 1000);
    const stmts = [env.DB.prepare('UPDATE appeals SET status = ?, reply = ?, resolved_at = ? WHERE id = ?').bind(decision, reply, now, row.id)];
    if (decision === 'accepted') stmts.push(env.DB.prepare('UPDATE accounts SET banned = 0, suspended_until = NULL, suspend_reason = NULL WHERE id = ?').bind(row.account_id), env.DB.prepare('INSERT INTO account_actions (id, account_id, action, reason, until, by_email, created_at) VALUES (?, ?, ?, ?, NULL, ?, ?)').bind(randomToken().slice(0, 16), row.account_id, 'lift', `이의 신청 인정${reply ? ` — ${reply}` : ''}`, me.email, now));
    await env.DB.batch(stmts);
    const acc = await env.DB.prepare('SELECT email FROM accounts WHERE id = ?').bind(row.account_id).first<{ email: string }>();
    if (acc) await notifyMember(env, acc.email, decision === 'accepted' ? '이의 신청이 받아들여졌습니다' : '이의 신청 결과', decision === 'accepted' ? `이용 제한을 해제했습니다.${reply ? `\n\n${reply}` : ''}` : `검토 결과 조치를 유지합니다.${reply ? `\n\n사유: ${reply}` : ''}`);
    return json({ ok: true });
  }
  return text('not found', 404);
}

/** 이의 신청: POST /api/me/appeals {text} — 정지 중에도 된다(라우터 예외). 처리 대기 중이면 하나만 */
export async function handleAppeal(req: Request, env: Env): Promise<Response> {
  if (req.method !== 'POST') return text('method not allowed', 405);
  const me = await authenticate(req, env);
  if (!me) return text('unauthorized', 401);
  const b = await readJson<{ text?: string }>(req);
  const t = str(b?.text, 2000);
  if (!t) return json({ error: 'text_required' }, 400);
  const open = await env.DB.prepare("SELECT id FROM appeals WHERE account_id = ? AND status = 'open'").bind(me.id).first();
  if (open) return json({ error: 'already_open' }, 409);
  const id = randomToken().slice(0, 16);
  await env.DB.prepare('INSERT INTO appeals (id, account_id, text, created_at) VALUES (?, ?, ?, ?)').bind(id, me.id, t, Date.now()).run();
  if (env.EMAIL) for (const to of operatorEmails(env)) {
    try { await env.EMAIL.send({ to, from: FROM_NOTICE, subject: '[간판다] 이의 신청', text: `${me.email} 님의 이의 신청:\n\n${t}\n\n운영자 화면 /ops 에서 처리하세요.` }); } catch { /* 무시 */ }
  }
  return json({ ok: true, id }, 201);
}

/**
 * 관리자: 가입 계정 목록 (2026-10-27 "관리자가 페이지가 없다. 우선 가입 계정을 보고 싶어") — GET /api/operator/accounts?q=&kind=shop|consumer|none&limit=&offset=
 * 최근 가입 순, 계정마다 종류·요금제·사업자(상호·상태)·내 프로젝트 수·마지막 접속(세션 시작)·상태·약관 동의 버전, 요약(전체·오늘·7일·간판집·가게 사장·사업자 확인·정지)
 */
export async function handleAccountList(req: Request, env: Env, url: URL): Promise<Response> {
  const me = await authenticate(req, env);
  if (!me) return text('unauthorized', 401);
  if (!isOperator(env, me.email)) return text('forbidden', 403);
  const q = str(url.searchParams.get('q'), 80), kind = str(url.searchParams.get('kind'), 10);
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get('limit')) || 50)), offset = Math.max(0, Number(url.searchParams.get('offset')) || 0);
  const now = Date.now();
  const kst = new Date(now + 9 * 3_600_000); const todayStart = Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate()) - 9 * 3_600_000;
  const kindSql = kind === 'shop' || kind === 'consumer' ? 'AND a.kind = ?' : kind === 'none' ? 'AND a.kind IS NULL' : '';
  const binds: unknown[] = [q, `%${q}%`, ...(kind === 'shop' || kind === 'consumer' ? [kind] : []), limit, offset];
  const rows = (await env.DB.prepare(`SELECT a.id, a.email, a.name, a.kind, a.plan, a.created_at, a.email_verified, a.terms_version, a.suspended_until, a.banned, a.requests_blocked,
      b.name AS biz, b.status AS biz_status,
      (SELECT COUNT(*) FROM projects p WHERE p.owner_id = a.id AND (p.kind IS NULL OR p.kind NOT IN ('request'))) AS projects,
      (SELECT MAX(s.created_at) FROM sessions s WHERE s.account_id = a.id) AS last_seen
    FROM accounts a LEFT JOIN businesses b ON b.account_id = a.id
    WHERE (?1 = '' OR a.id = ?1 OR a.email LIKE ?2 OR a.name LIKE ?2) ${kindSql}
    ORDER BY a.created_at DESC LIMIT ? OFFSET ?`).bind(...binds).all<{ id: string; email: string; name: string; kind: string | null; plan: string; created_at: number; email_verified: number; terms_version: string | null; suspended_until: number | null; banned: number; requests_blocked: number | null; biz: string | null; biz_status: string | null; projects: number; last_seen: number | null }>()).results;
  const sum = await env.DB.prepare(`SELECT COUNT(*) AS total, SUM(created_at >= ?) AS today, SUM(created_at >= ?) AS week, SUM(kind = 'shop') AS shops, SUM(kind = 'consumer') AS consumers,
      SUM(banned = 1 OR suspended_until > ?) AS suspended, (SELECT COUNT(*) FROM businesses) AS verified FROM accounts`).bind(todayStart, now - 7 * 86_400_000, now).first<Record<string, number | null>>();
  return json({
    accounts: rows.map((a) => ({ id: a.id, email: a.email, name: a.name, kind: a.kind, plan: a.plan, createdAt: a.created_at, emailVerified: !!a.email_verified, termsVersion: a.terms_version, projects: a.projects, lastSeenAt: a.last_seen, status: a.banned ? 'banned' : a.suspended_until && a.suspended_until > now ? 'suspended' : 'active', requestsBlocked: !!a.requests_blocked, business: a.biz !== null ? { name: a.biz, status: a.biz_status ?? '' } : null, operator: isOperator(env, a.email) })),
    summary: { total: sum?.total ?? 0, today: sum?.today ?? 0, week: sum?.week ?? 0, shops: sum?.shops ?? 0, consumers: sum?.consumers ?? 0, verified: sum?.verified ?? 0, suspended: sum?.suspended ?? 0 },
    next: rows.length === limit ? offset + limit : null,
  });
}
