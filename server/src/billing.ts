// 결제 (2026-10-23 사용자: "/Users/eshell/dev/xlpop 에 토스페이먼츠로 결제 붙이고 있다. 여기도 진행해줘") — xlpop 과 같은 토스 자동결제(빌링키) 방식을 Workers·D1 로.
// 흐름: [구독] → prepare(customerKey) → 토스 카드 등록 창(requestBillingAuth) → 앱으로 돌아와 issue(authKey) → 빌링키 발급·암호화 저장 → 첫 달 결제 → 요금제.
// 매달: cron(매시간) runBillingCycle — 결제일이 된 구독을 결제. 정책(pricing.md 구독 정지, 2026-10-21): 실패 → 7일 유예(기능 그대로·하루 한 번 재시도),
// 유예 중 성공하면 다음 결제일은 원래 날짜(합산 없음), 7일 안에 못 하면 무료로(그 7일은 청구 안 함). 해지 = 기간 끝까지 쓰고 갱신 안 함, 다시 구독하면 그날이 새 결제일.
// 요금은 서버 기준표(plans.ts)로만 — 클라이언트 금액은 받지 않는다. 비밀 키는 이 파일에서만 쓴다.
import { authenticate } from './auth';
import { json, readJson, text } from './http';
import { PLANS } from './plans';

const TOSS = 'https://api.tosspayments.com';
const DAY = 86400_000;
const KST = 9 * 3600_000;
export const GRACE_MS = 7 * DAY;
/** 실패 재시도 간격 (하루 한 번 — cron 이 매시간이라 20시간) */
const RETRY_MS = 20 * 3600_000;
type PaidPlan = 'basic' | 'pro';
const PAID: PaidPlan[] = ['basic', 'pro'];
const isPaid = (p: unknown): p is PaidPlan => typeof p === 'string' && (PAID as string[]).includes(p);

/** 토스 호출 (테스트에서 가짜로 바꿔 끼운다) */
let tossFetch: typeof fetch = (input, init) => fetch(input, init);
export function setTossFetch(f: typeof fetch | null) { tossFetch = f ?? ((input, init) => fetch(input, init)); }

export const configured = (env: Env) => !!env.TOSS_CLIENT_KEY && !!env.TOSS_SECRET_KEY && !!env.BILLING_ENC_KEY;
/** 'fake' = 로컬·E2E: 토스 호출 없이 가짜 응답 (authKey 에 'fail' 이 들어가면 결제 거절) */
const isFake = (env: Env) => env.TOSS_SECRET_KEY === 'fake';
export const isTestKey = (key: string) => key.startsWith('test_');
/** 테스트 키(카드사 심사 중)는 허용 목록 계정만 결제 — 목록이 비면 모두, 운영 키는 모두 */
export function allowedToPay(env: Env, email: string): boolean {
  if (!isTestKey(env.TOSS_SECRET_KEY ?? '')) return true;
  const list = (env.TOSS_TEST_ALLOW_EMAILS ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  return !list.length || list.includes(email.toLowerCase());
}

/** 결제사 심사 계정 (2026-10-23 "테스트계정을 제공해야한다"): 테스트 키 동안 허용 목록에 이름이 직접 있는 계정은 사업자 확인 없이 구독 — 심사 담당자는 국세청 확인을 통과할 수 없다 */
export function businessWaived(env: Env, email: string): boolean {
  if (!isTestKey(env.TOSS_SECRET_KEY ?? '')) return false;
  return (env.TOSS_TEST_ALLOW_EMAILS ?? '').split(',').map((s) => s.trim().toLowerCase()).includes(email.toLowerCase());
}

// ---------- 빌링키 암호화 (AES-256-GCM, iv 12바이트 + 암호문 → base64) ----------
async function encKey(env: Env) {
  const hex = env.BILLING_ENC_KEY;
  if (!/^[0-9a-f]{64}$/i.test(hex)) throw new Error('BILLING_ENC_KEY must be 32-byte hex');
  const raw = new Uint8Array(hex.match(/../g)!.map((h) => parseInt(h, 16)));
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}
const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
export async function encryptKey(env: Env, plain: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await encKey(env), new TextEncoder().encode(plain)));
  const out = new Uint8Array(iv.length + ct.length); out.set(iv); out.set(ct, iv.length);
  return b64(out);
}
export async function decryptKey(env: Env, enc: string): Promise<string> {
  const all = unb64(enc);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: all.slice(0, 12) }, await encKey(env), all.slice(12));
  return new TextDecoder().decode(pt);
}

// ---------- 날짜 (한국 시각 기준 같은 날, 말일 보정은 기준일로 되돌린다) ----------
export const kstDay = (ts: number) => new Date(ts + KST).getUTCDate();
export function addMonthsKst(ts: number, n: number, anchorDay: number): number {
  const d = new Date(ts + KST);
  const y = d.getUTCFullYear(), m = d.getUTCMonth() + n;
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return Date.UTC(y, m, Math.min(anchorDay, last), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds(), d.getUTCMilliseconds()) - KST;
}

// ---------- 토스 API ----------
class TossError extends Error { constructor(public code: string, message: string) { super(message); } }
async function toss<T>(env: Env, path: string, body?: unknown, idem?: string): Promise<T> {
  const headers: Record<string, string> = { authorization: 'Basic ' + btoa(`${env.TOSS_SECRET_KEY}:`) };
  if (body) headers['content-type'] = 'application/json';
  if (idem) headers['idempotency-key'] = idem;
  const r = await tossFetch(TOSS + path, { method: body ? 'POST' : 'GET', headers, ...(body ? { body: JSON.stringify(body) } : {}) });
  const j = await r.json<Record<string, unknown>>().catch(() => ({}) as Record<string, unknown>);
  if (!r.ok) throw new TossError(String(j.code ?? r.status), String(j.message ?? '결제사 오류'));
  return j as T;
}
type Issued = { billingKey: string; cardCompany?: string; card?: { number?: string } };
async function issueBillingKey(env: Env, authKey: string, customerKey: string): Promise<{ billingKey: string; label: string }> {
  if (isFake(env)) return { billingKey: `bk_fake_${authKey}`, label: '테스트카드 1234-****' };
  const r = await toss<Issued>(env, '/v1/billing/authorizations/issue', { authKey, customerKey });
  return { billingKey: r.billingKey, label: [r.cardCompany, r.card?.number].filter(Boolean).join(' ') };
}
type Charged = { paymentKey?: string; approvedAt?: string; receipt?: { url?: string } };
async function chargeBillingKey(env: Env, billingKey: string, p: { customerKey: string; amount: number; orderId: string; orderName: string; customerEmail: string }): Promise<Charged> {
  if (isFake(env)) { if (billingKey.includes('fail')) throw new TossError('REJECT_CARD_COMPANY', '카드사 거절 (테스트)'); return { paymentKey: `pk_fake_${p.orderId}`, approvedAt: new Date().toISOString() }; }
  return toss<Charged>(env, `/v1/billing/${encodeURIComponent(billingKey)}`, p, p.orderId);
}

// ---------- 저장 ----------
export interface BillingRow { account_id: string; customer_key: string; billing_key_enc: string | null; card_label: string; plan: string | null; next_plan: string | null; auto_renew: number; period_end: number | null; anchor_day: number | null; grace_until: number | null; fail_count: number; last_error: string | null; last_try_at: number | null; updated_at: number }
const rowOf = (env: Env, id: string) => env.DB.prepare('SELECT * FROM billing WHERE account_id = ?').bind(id).first<BillingRow>();
const orderIdOf = () => `gp-${Date.now().toString(36)}-${[...crypto.getRandomValues(new Uint8Array(6))].map((b) => b.toString(16).padStart(2, '0')).join('')}`;

/** 한 번 결제하고 기록. 성공이면 true, 실패면 오류 문구 */
async function charge(env: Env, row: BillingRow, email: string, plan: PaidPlan, kind: 'first' | 'renew'): Promise<true | string> {
  const orderId = orderIdOf(), amount = PLANS[plan].priceKrw, now = Date.now();
  try {
    if (!row.billing_key_enc) throw new TossError('NO_CARD', '등록된 카드가 없습니다');
    const r = await chargeBillingKey(env, await decryptKey(env, row.billing_key_enc), { customerKey: row.customer_key, amount, orderId, orderName: `간판다 ${PLANS[plan].name} 1개월`, customerEmail: email });
    await env.DB.prepare("INSERT INTO payments (order_id, account_id, plan, amount, kind, status, payment_key, receipt_url, created_at, approved_at) VALUES (?, ?, ?, ?, ?, 'DONE', ?, ?, ?, ?)")
      .bind(orderId, row.account_id, plan, amount, kind, r.paymentKey ?? null, r.receipt?.url ?? null, now, r.approvedAt ? Date.parse(r.approvedAt) : now).run();
    return true;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await env.DB.prepare("INSERT INTO payments (order_id, account_id, plan, amount, kind, status, error, created_at) VALUES (?, ?, ?, ?, ?, 'FAILED', ?, ?)").bind(orderId, row.account_id, plan, amount, kind, msg, now).run();
    return msg;
  }
}
/** 이번 달(한국 시각) 1일 0시 */
export function kstMonthStart(ts: number): number {
  const d = new Date(ts + KST);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) - KST;
}
/** 이번 달 결제된 크레딧 합계 */
export async function creditUsed(env: Env, accountId: string, now = Date.now()): Promise<number> {
  const r = await env.DB.prepare("SELECT COALESCE(SUM(amount), 0) AS n FROM payments WHERE account_id = ? AND kind = 'credit' AND status = 'DONE' AND created_at >= ?").bind(accountId, kstMonthStart(now)).first<{ n: number }>();
  return Number(r?.n ?? 0);
}
/** 등록 카드로 한 번 결제하고 기록 (크레딧·위약금). 성공 true, 실패면 오류 문구 */
export async function chargeBillingRaw(env: Env, me: { id: string; email: string }, amount: number, orderName: string, kind: 'credit' | 'penalty', requestId: string): Promise<true | string> {
  if (!configured(env)) return 'not_configured';
  const row = await rowOf(env, me.id);
  if (!row?.billing_key_enc) return 'card_required';
  const orderId = orderIdOf(), now = Date.now();
  try {
    const r = await chargeBillingKey(env, await decryptKey(env, row.billing_key_enc), { customerKey: row.customer_key, amount, orderId, orderName, customerEmail: me.email });
    await env.DB.prepare("INSERT INTO payments (order_id, account_id, plan, amount, kind, status, payment_key, receipt_url, created_at, approved_at, request_id) VALUES (?, ?, ?, ?, ?, 'DONE', ?, ?, ?, ?, ?)")
      .bind(orderId, me.id, kind, amount, kind, r.paymentKey ?? null, r.receipt?.url ?? null, now, r.approvedAt ? Date.parse(r.approvedAt) : now, requestId).run();
    return true;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await env.DB.prepare("INSERT INTO payments (order_id, account_id, plan, amount, kind, status, error, created_at, request_id) VALUES (?, ?, ?, ?, ?, 'FAILED', ?, ?, ?)").bind(orderId, me.id, kind, amount, kind, msg, now, requestId).run();
    return msg;
  }
}

/**
 * 요청 크레딧 결제 (2026-10-24 "등록 카드로 쓴 만큼", 월 한도 500만원): 제안 링크를 만들 때 한 번.
 * 성공 true, 아니면 { status 402, body } — card_required(카드 없음) · credit_limit(이번 달 한도) · charge_failed(카드사 거절)
 */
export async function chargeCredit(env: Env, me: { id: string; email: string }, requestId: string, fee: number, limit: number): Promise<true | { status: 402 | 403 | 503; body: Record<string, unknown> }> {
  if (!configured(env)) return { status: 503, body: { error: 'not_configured' } };
  if (!allowedToPay(env, me.email)) return { status: 403, body: { error: 'not_allowed' } };
  const row = await rowOf(env, me.id);
  if (!row?.billing_key_enc) return { status: 402, body: { error: 'card_required', fee } };
  const used = await creditUsed(env, me.id);
  if (used + fee > limit) return { status: 402, body: { error: 'credit_limit', used, limit, fee } };
  const orderId = orderIdOf(), now = Date.now();
  try {
    const r = await chargeBillingKey(env, await decryptKey(env, row.billing_key_enc), { customerKey: row.customer_key, amount: fee, orderId, orderName: '간판다 견적 요청 크레딧', customerEmail: me.email });
    await env.DB.prepare("INSERT INTO payments (order_id, account_id, plan, amount, kind, status, payment_key, receipt_url, created_at, approved_at, request_id) VALUES (?, ?, 'credit', ?, 'credit', 'DONE', ?, ?, ?, ?, ?)")
      .bind(orderId, me.id, fee, r.paymentKey ?? null, r.receipt?.url ?? null, now, r.approvedAt ? Date.parse(r.approvedAt) : now, requestId).run();
    return true;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await env.DB.prepare("INSERT INTO payments (order_id, account_id, plan, amount, kind, status, error, created_at, request_id) VALUES (?, ?, 'credit', ?, 'credit', 'FAILED', ?, ?, ?)").bind(orderId, me.id, fee, msg, now, requestId).run();
    return { status: 402, body: { error: 'charge_failed', message: msg, fee } };
  }
}

async function endSubscription(env: Env, id: string) {
  await env.DB.batch([
    env.DB.prepare('UPDATE billing SET plan = NULL, next_plan = NULL, auto_renew = 0, grace_until = NULL, updated_at = ? WHERE account_id = ?').bind(Date.now(), id),
    env.DB.prepare("UPDATE accounts SET plan = 'free' WHERE id = ?").bind(id),
  ]);
}
/** 결제 성공 → 다음 기간 (갱신은 원래 결제일에서 한 달, 새 구독은 오늘부터) */
async function startPeriod(env: Env, id: string, plan: PaidPlan, periodEnd: number, anchor: number) {
  await env.DB.batch([
    env.DB.prepare('UPDATE billing SET plan = ?, next_plan = NULL, auto_renew = 1, period_end = ?, anchor_day = ?, grace_until = NULL, fail_count = 0, last_error = NULL, updated_at = ? WHERE account_id = ?').bind(plan, periodEnd, anchor, Date.now(), id),
    env.DB.prepare('UPDATE accounts SET plan = ? WHERE id = ?').bind(plan, id),
  ]);
}
async function renew(env: Env, row: BillingRow, email: string): Promise<boolean> {
  const plan = isPaid(row.next_plan) ? row.next_plan : isPaid(row.plan) ? row.plan : null;
  if (!plan || !row.period_end) return false;
  const r = await charge(env, row, email, plan, 'renew');
  // 기준일은 말일로 당겨진 때만 (1/31 → 2/28 → 3/31), 그 밖에는 실제 결제일의 날짜
  const day = kstDay(row.period_end), lastOfMonth = kstDay(row.period_end + DAY) === 1;
  const anchor = row.anchor_day && row.anchor_day > day && lastOfMonth ? row.anchor_day : day;
  if (r === true) { await startPeriod(env, row.account_id, plan, addMonthsKst(row.period_end, 1, anchor), anchor); return true; }
  await env.DB.prepare('UPDATE billing SET grace_until = ?, fail_count = fail_count + 1, last_error = ?, updated_at = ? WHERE account_id = ?')
    .bind(row.grace_until ?? row.period_end + GRACE_MS, r, Date.now(), row.account_id).run();
  return false;
}

/** 매시간(cron): 결제일이 된 구독 — 해지했으면 끝, 유예가 지났으면 무료로, 아니면 결제(실패는 하루 한 번 재시도) */
export async function runBillingCycle(env: Env, now = Date.now()): Promise<number> {
  if (!configured(env)) return 0;
  const { results } = await env.DB.prepare('SELECT b.*, a.email AS email FROM billing b JOIN accounts a ON a.id = b.account_id WHERE b.plan IS NOT NULL AND b.period_end <= ?').bind(now).all<BillingRow & { email: string }>();
  let n = 0;
  for (const row of results) {
    if (!row.auto_renew || (row.grace_until !== null && now >= row.grace_until)) { await endSubscription(env, row.account_id); n++; continue; }
    if (row.last_try_at !== null && now - row.last_try_at < RETRY_MS) continue;
    // 같은 구독을 두 번 결제하지 않게: 시도 시각을 먼저 차지한 실행만
    const claim = await env.DB.prepare('UPDATE billing SET last_try_at = ? WHERE account_id = ? AND last_try_at IS ?').bind(now, row.account_id, row.last_try_at).run();
    if (!claim.meta.changes) continue;
    await renew(env, row, row.email);
    n++;
  }
  return n;
}

// ---------- API ----------
async function hasBusiness(env: Env, id: string) {
  return !!(await env.DB.prepare("SELECT 1 FROM businesses WHERE account_id = ? AND status = 'active'").bind(id).first());
}
const subOf = (r: BillingRow | null) => (r ? { plan: r.plan, nextPlan: r.next_plan, autoRenew: !!r.auto_renew, periodEnd: r.period_end, graceUntil: r.grace_until, card: r.card_label, lastError: r.last_error, hasCard: !!r.billing_key_enc } : null);

export async function handleBilling(req: Request, env: Env, pathname: string): Promise<Response> {
  if (pathname === '/api/billing/webhook') return handleWebhook(req, env);
  const me = await authenticate(req, env);
  if (!me) return text('unauthorized', 401);
  const now = Date.now();
  if (pathname === '/api/me/billing' && req.method === 'GET') {
    const row = await rowOf(env, me.id);
    const { results } = await env.DB.prepare('SELECT order_id, plan, amount, kind, status, receipt_url, error, created_at FROM payments WHERE account_id = ? ORDER BY created_at DESC LIMIT 50').bind(me.id).all<{ order_id: string; plan: string; amount: number; kind: string; status: string; receipt_url: string | null; error: string | null; created_at: number }>();
    return json({
      configured: configured(env), test: isFake(env) || isTestKey(env.TOSS_SECRET_KEY ?? ''), fake: isFake(env), clientKey: configured(env) ? env.TOSS_CLIENT_KEY : '',
      allowed: allowedToPay(env, me.email), business: businessWaived(env, me.email) || (await hasBusiness(env, me.id)), plan: me.plan, // 심사 계정은 사업자 확인된 것으로
      plans: PAID.map((id) => ({ id, name: PLANS[id].name, priceKrw: PLANS[id].priceKrw })),
      sub: subOf(row),
      payments: results.map((p) => ({ orderId: p.order_id, plan: p.plan, amount: p.amount, kind: p.kind, status: p.status, receiptUrl: p.receipt_url, error: p.error, at: p.created_at })),
    });
  }
  if (req.method !== 'POST') return text('method not allowed', 405);
  if (!configured(env)) return json({ error: 'not_configured' }, 503);
  const body = (await readJson<{ plan?: string; authKey?: string; customerKey?: string }>(req)) ?? {};
  const row = await rowOf(env, me.id);

  if (pathname === '/api/me/billing/prepare' || pathname === '/api/me/billing/issue') {
    if (!allowedToPay(env, me.email)) return json({ error: 'not_allowed' }, 403);
    if (!businessWaived(env, me.email) && !(await hasBusiness(env, me.id))) return json({ error: 'business_required' }, 403);
    if (!isPaid(body.plan) && body.plan !== 'card') return json({ error: 'bad_plan' }, 400); // card = 카드만 등록 (요청 크레딧용, 2026-10-24)
  }
  if (pathname === '/api/me/billing/prepare') {
    if (row) return json({ customerKey: row.customer_key, clientKey: env.TOSS_CLIENT_KEY });
    const customerKey = `gpc_${crypto.randomUUID()}`;
    await env.DB.prepare('INSERT INTO billing (account_id, customer_key, updated_at) VALUES (?, ?, ?)').bind(me.id, customerKey, now).run();
    return json({ customerKey, clientKey: env.TOSS_CLIENT_KEY });
  }
  if (pathname === '/api/me/billing/issue') {
    if (!row || row.customer_key !== body.customerKey || typeof body.authKey !== 'string' || !body.authKey) return json({ error: 'bad_request' }, 400);
    let issued: { billingKey: string; label: string };
    try { issued = await issueBillingKey(env, body.authKey, row.customer_key); } catch (e) { return json({ error: 'issue_failed', message: e instanceof Error ? e.message : String(e) }, 402); }
    const enc = await encryptKey(env, issued.billingKey);
    await env.DB.prepare('UPDATE billing SET billing_key_enc = ?, card_label = ?, updated_at = ? WHERE account_id = ?').bind(enc, issued.label, now, me.id).run();
    const fresh = (await rowOf(env, me.id))!;
    const active = isPaid(fresh.plan) && (fresh.period_end ?? 0) > now;
    if (active) {
      // 카드 바꾸기 — 결제 실패 유예 중이면 바로 다시 결제
      if (fresh.grace_until !== null) await renew(env, fresh, me.email);
      return json({ ok: true, changed: 'card', sub: subOf(await rowOf(env, me.id)) });
    }
    if (body.plan === 'card') return json({ ok: true, changed: 'card', sub: subOf(await rowOf(env, me.id)) }); // 카드만 — 구독 결제 없음
    const r = await charge(env, fresh, me.email, body.plan as PaidPlan, 'first');
    if (r !== true) return json({ error: 'charge_failed', message: r }, 402);
    await startPeriod(env, me.id, body.plan as PaidPlan, addMonthsKst(now, 1, kstDay(now)), kstDay(now)); // 다시 구독하면 그날이 새 결제일
    return json({ ok: true, sub: subOf(await rowOf(env, me.id)) });
  }
  if (!row || !isPaid(row.plan)) return json({ error: 'no_subscription' }, 400);
  if (pathname === '/api/me/billing/cancel' || pathname === '/api/me/billing/resume') {
    await env.DB.prepare('UPDATE billing SET auto_renew = ?, updated_at = ? WHERE account_id = ?').bind(pathname.endsWith('resume') ? 1 : 0, now, me.id).run();
    return json({ ok: true, sub: subOf(await rowOf(env, me.id)) });
  }
  if (pathname === '/api/me/billing/plan') {
    if (!isPaid(body.plan)) return json({ error: 'bad_plan' }, 400);
    await env.DB.prepare('UPDATE billing SET next_plan = ?, updated_at = ? WHERE account_id = ?').bind(body.plan === row.plan ? null : body.plan, now, me.id).run();
    return json({ ok: true, sub: subOf(await rowOf(env, me.id)) });
  }
  return text('not found', 404);
}

/** 토스 웹훅: 본문은 믿지 않고 주문을 토스에 다시 물어 본다 — 취소(관리자 환불 등)면 기록만 취소로 (서명 없음, xlpop 과 같음) */
async function handleWebhook(req: Request, env: Env): Promise<Response> {
  if (req.method !== 'POST' || !configured(env) || isFake(env)) return json({ ok: true });
  const b = await readJson<{ data?: { orderId?: string } }>(req);
  const orderId = b?.data?.orderId;
  if (!orderId || !/^[\w-]{6,64}$/.test(orderId)) return json({ ok: true });
  const known = await env.DB.prepare('SELECT 1 FROM payments WHERE order_id = ?').bind(orderId).first();
  if (!known) return json({ ok: true });
  try {
    const p = await toss<{ status?: string }>(env, `/v1/payments/orders/${encodeURIComponent(orderId)}`);
    if (p.status === 'CANCELED' || p.status === 'PARTIAL_CANCELED') await env.DB.prepare("UPDATE payments SET status = 'CANCELED' WHERE order_id = ?").bind(orderId).run();
  } catch { /* 다음 웹훅·수동 확인 */ }
  return json({ ok: true });
}
