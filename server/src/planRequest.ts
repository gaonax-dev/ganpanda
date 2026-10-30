// 유료 버전 신청 (2026-10-30 사용자: "무료로 사용하시고 정식서비스될때 유료사용으로 전환하게 하고 바로 서비스들어간다. 유료 버전을 신청하면 1-2시간 후에 처리해주고
// 정식 결제서비스 시작되면 그때 유료 전환을 요청한다." → "운영자가 아니고 서버에서"). 토스가 견적 연동 수수료 구조로 입점을 거절해(2026-10-30) 정식 결제 전까지:
// 신청 → 매시간 작업이 신청 1시간 뒤 요금제를 올린다(1~2시간 안) — 결제 없음. 정식 결제(PAYMENTS_LIVE=1)가 시작되면 신청을 닫고 유료 전환을 요청한다
import { authenticate } from './auth';
import { json, readJson, text } from './http';
import { PLANS, paymentsLive } from './plans';
export { paymentsLive };

export const PLAN_GRANT_DELAY_MS = 60 * 60_000;
const PAID = ['basic', 'pro'].filter((id) => id in PLANS);

interface Row { plan: string; requested_at: number; granted_at: number | null }

export async function handlePlanRequest(req: Request, env: Env): Promise<Response> {
  const me = await authenticate(req, env);
  if (!me) return text('unauthorized', 401);
  if (req.method === 'GET') {
    const r = await env.DB.prepare('SELECT plan, requested_at, granted_at FROM plan_requests WHERE account_id = ?').bind(me.id).first<Row>();
    return json({ beta: !paymentsLive(env, me.email), delayMs: PLAN_GRANT_DELAY_MS, request: r ? { plan: r.plan, requestedAt: r.requested_at, grantedAt: r.granted_at } : null });
  }
  if (req.method !== 'POST') return text('method not allowed', 405);
  if (paymentsLive(env, me.email)) return json({ error: 'payments_live' }, 409);
  const body = await readJson<{ plan?: string }>(req);
  if (!body?.plan || !PAID.includes(body.plan)) return json({ error: 'bad_plan' }, 400);
  const now = Date.now();
  await env.DB.prepare('INSERT INTO plan_requests (account_id, plan, requested_at, granted_at) VALUES (?, ?, ?, NULL) ON CONFLICT(account_id) DO UPDATE SET plan = excluded.plan, requested_at = excluded.requested_at, granted_at = NULL')
    .bind(me.id, body.plan, now).run();
  return json({ ok: true, request: { plan: body.plan, requestedAt: now, grantedAt: null } });
}

/** 매시간: 1시간 넘은 신청의 요금제를 올린다(정식 결제가 시작된 뒤에도 그 전에 들어온 신청은 처리). 올린 수 */
export async function runPlanGrants(env: Env, now = Date.now()): Promise<number> {
  const { results } = await env.DB.prepare('SELECT account_id, plan, requested_at FROM plan_requests WHERE granted_at IS NULL AND requested_at <= ?').bind(now - PLAN_GRANT_DELAY_MS).all<{ account_id: string; plan: string; requested_at: number }>();
  for (const r of results) {
    // 그사이 다시 신청했으면(requested_at 이 바뀜) 이번엔 건드리지 않는다
    await env.DB.batch([
      env.DB.prepare('UPDATE accounts SET plan = ? WHERE id = ? AND EXISTS (SELECT 1 FROM plan_requests WHERE account_id = ? AND requested_at = ? AND granted_at IS NULL)').bind(r.plan, r.account_id, r.account_id, r.requested_at),
      env.DB.prepare('UPDATE plan_requests SET granted_at = ? WHERE account_id = ? AND requested_at = ? AND granted_at IS NULL').bind(now, r.account_id, r.requested_at),
    ]);
  }
  return results.length;
}
