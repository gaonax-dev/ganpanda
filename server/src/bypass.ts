// 간판다 밖 거래 신고 (2026-10-24 사용자: "역으로 요청한 주인에게 신고 포상을 주면 되나? 열람기록이 있는 간판 가계에게 요청서 없이 진행하게되었을때 환불 금액을 업체가 보상하고 …"
// → 제재 = 위약금(크레딧 3배, 최대 15만원) + 요청 받기 정지, 고객 보상은 이번엔 없음):
// 요청을 연 간판집은 기록되고(request_views), 가게 사장이 [간판다 밖에서 연락받았어요]로 신고 → 운영자가 열람 업체 중에서 골라 제재하거나 기각
import { authenticate, type Account } from './auth';
import { chargeBillingRaw } from './billing';
import { creditsOn, requestFee } from './credit';
import { json, randomToken, readJson, text } from './http';
import { isOperator } from './operator';

export const PENALTY_MULTIPLE = 3;
export const PENALTY_MAX = 150_000;
export const penaltyOf = (fee: number) => Math.min(PENALTY_MAX, fee * PENALTY_MULTIPLE);
const FROM = { email: 'login@ganpanda.co.kr', name: '간판다' };

/** 간판집이 요청을 열었다 (처음 한 번만 남는다) */
export async function recordView(env: Env, requestId: string, accountId: string) {
  await env.DB.prepare('INSERT OR IGNORE INTO request_views (request_id, account_id, first_at) VALUES (?, ?, ?)').bind(requestId, accountId, Date.now()).run();
}

/** 가게 사장 신고: POST /api/requests/:id/report {shop, text} — 고객 확인은 부르는 쪽(customerOk) */
export async function createReport(req: Request, env: Env, requestId: string): Promise<Response> {
  const b = await readJson<{ shop?: string; text?: string }>(req);
  const shop = typeof b?.shop === 'string' ? b.shop.trim().slice(0, 100) : '';
  if (!shop) return json({ error: 'shop_required' }, 400);
  const id = randomToken().slice(0, 16);
  await env.DB.prepare('INSERT INTO request_reports (id, request_id, shop_text, text, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(id, requestId, shop, typeof b?.text === 'string' ? b.text.trim().slice(0, 1000) : '', Date.now()).run();
  if (env.EMAIL) {
    for (const to of (env.OPERATOR_EMAILS ?? '').split(',').map((s) => s.trim()).filter(Boolean)) {
      try { await env.EMAIL.send({ to, from: FROM, subject: '[간판다] 간판다 밖 거래 신고', text: `요청 ${requestId} 에 신고가 들어왔습니다.\n업체: ${shop}\n\n받은 요청 화면의 "신고"에서 처리하세요.` }); } catch { /* 무시 */ }
    }
  }
  return json({ ok: true, id }, 201);
}

type ReportRow = { id: string; request_id: string; shop_text: string; text: string; status: string; created_at: number; resolved_at: number | null; penalized_account: string | null; amount: number | null; paid: number | null };

/** 운영자: GET /api/operator/reports · POST /api/operator/reports/:id {action: penalize|dismiss, accountId} · POST /api/operator/accounts/:id/unblock */
export async function handleOperator(req: Request, env: Env, pathname: string): Promise<Response> {
  const me = await authenticate(req, env);
  if (!me) return text('unauthorized', 401);
  if (!isOperator(env, me.email)) return text('forbidden', 403);
  if (pathname === '/api/operator/reports' && req.method === 'GET') {
    const rows = (await env.DB.prepare('SELECT * FROM request_reports ORDER BY created_at DESC LIMIT 100').all<ReportRow>()).results;
    const out = [];
    for (const r of rows) {
      const q = await env.DB.prepare('SELECT store, region, floor, fee, estimate_total FROM requests WHERE id = ?').bind(r.request_id).first<{ store: string; region: string; floor: string; fee: number | null; estimate_total: number | null }>();
      const viewers = (await env.DB.prepare(`SELECT v.account_id, v.first_at, a.email, a.name, a.requests_blocked, b.name AS biz, b.b_no,
          EXISTS(SELECT 1 FROM request_responses rr WHERE rr.request_id = v.request_id AND rr.account_id = v.account_id) AS paid
        FROM request_views v JOIN accounts a ON a.id = v.account_id LEFT JOIN businesses b ON b.account_id = v.account_id WHERE v.request_id = ? ORDER BY v.first_at`).bind(r.request_id)
        .all<{ account_id: string; first_at: number; email: string; name: string; requests_blocked: number; biz: string | null; b_no: string | null; paid: number }>()).results;
      const fee = q?.fee ?? requestFee(q?.estimate_total);
      out.push({ id: r.id, requestId: r.request_id, shop: r.shop_text, text: r.text, status: r.status, createdAt: r.created_at, resolvedAt: r.resolved_at, penalizedAccount: r.penalized_account, amount: r.amount, paid: r.paid === null ? null : !!r.paid,
        request: q ? { store: q.store, region: q.region, floor: q.floor, fee } : null, penalty: penaltyOf(fee),
        viewers: viewers.map((v) => ({ accountId: v.account_id, firstAt: v.first_at, email: v.email, name: v.name, business: v.biz, bizNo: v.b_no, paid: !!v.paid, blocked: !!v.requests_blocked })) });
    }
    return json({ reports: out });
  }
  const unblock = pathname.match(/^\/api\/operator\/accounts\/([^/]+)\/unblock$/);
  if (unblock && req.method === 'POST') {
    await env.DB.prepare('UPDATE accounts SET requests_blocked = 0 WHERE id = ?').bind(unblock[1]).run();
    return json({ ok: true });
  }
  const m = pathname.match(/^\/api\/operator\/reports\/([A-Za-z0-9_-]{16})$/);
  if (!m || req.method !== 'POST') return text('not found', 404);
  const rep = await env.DB.prepare('SELECT * FROM request_reports WHERE id = ?').bind(m[1]).first<ReportRow>();
  if (!rep) return text('not found', 404);
  if (rep.status !== 'open') return json({ error: 'resolved' }, 409);
  const b = await readJson<{ action?: string; accountId?: string }>(req);
  const now = Date.now();
  if (b?.action === 'dismiss') {
    await env.DB.prepare("UPDATE request_reports SET status = 'dismissed', resolved_at = ? WHERE id = ?").bind(now, rep.id).run();
    return json({ ok: true, status: 'dismissed' });
  }
  if (b?.action !== 'penalize' || typeof b.accountId !== 'string') return json({ error: 'bad_action' }, 400);
  // 그 요청을 연(열람 기록이 있는) 간판집만
  const viewed = await env.DB.prepare('SELECT 1 FROM request_views WHERE request_id = ? AND account_id = ?').bind(rep.request_id, b.accountId).first();
  if (!viewed) return json({ error: 'not_viewer' }, 400);
  const shop = await env.DB.prepare('SELECT * FROM accounts WHERE id = ?').bind(b.accountId).first<Account>();
  if (!shop) return json({ error: 'not_viewer' }, 400);
  const q = await env.DB.prepare('SELECT store, fee, estimate_total FROM requests WHERE id = ?').bind(rep.request_id).first<{ store: string; fee: number | null; estimate_total: number | null }>();
  const amount = penaltyOf(q?.fee ?? requestFee(q?.estimate_total));
  // 위약금: 결제가 켜져 있으면 등록 카드로, 아니면(또는 카드 없음·거절) 미납으로 남긴다. 어느 쪽이든 요청 받기 정지
  const paid = creditsOn(env) ? (await chargeBillingRaw(env, shop, amount, '간판다 위약금 (간판다 밖 거래)', 'penalty', rep.request_id)) === true : false;
  await env.DB.batch([
    env.DB.prepare("UPDATE request_reports SET status = 'penalized', resolved_at = ?, penalized_account = ?, amount = ?, paid = ? WHERE id = ?").bind(now, shop.id, amount, paid ? 1 : 0, rep.id),
    env.DB.prepare('UPDATE accounts SET requests_blocked = 1, receive_requests = 0 WHERE id = ?').bind(shop.id),
  ]);
  if (env.EMAIL) {
    try {
      await env.EMAIL.send({ to: shop.email, from: FROM, subject: '[간판다] 요청 받기가 정지되었습니다',
        text: `간판다에서 연 견적 요청(${q?.store ?? ''})의 가게 사장님과 크레딧 없이 간판다 밖에서 거래한 것으로 확인되어, 이용약관 제4조의5에 따라 위약금 ${amount.toLocaleString('ko-KR')}원${paid ? '이 등록 카드로 결제되었고' : '이 부과되었고'} 견적 요청 받기가 정지되었습니다.\n이의가 있으면 support@ganpanda.co.kr 로 알려 주세요.` });
    } catch { /* 무시 */ }
  }
  return json({ ok: true, status: 'penalized', amount, paid });
}
