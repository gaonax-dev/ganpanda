// 결제 (2026-10-23 토스페이먼츠 자동결제 — xlpop 과 같은 결제창 SDK v2): 설정 "계정 · 구독" → 서버 /api/me/billing
// [구독] → prepare(customerKey) → 토스 카드 등록 창(requestBillingAuth) → 이 주소로 돌아옴(?billing=success&plan=…&customerKey&authKey) → issue → 첫 달 결제.
// 서버가 'fake' 키면(로컬·E2E) 토스 창 없이 바로 돌아온다.
import { SERVER_URL } from './sync';
import { AuthError, loadSession } from './auth';

export interface BillingInfo {
  configured: boolean;
  /** 테스트 결제(카드사 심사 중) — 실제 청구 없음 */
  test: boolean;
  fake: boolean;
  clientKey: string;
  /** 테스트 키일 때 허용 목록에 있는 계정인가 */
  allowed: boolean;
  /** 사업자 확인됨 (유료 전환 조건) */
  business: boolean;
  plan: string;
  plans: { id: 'basic' | 'pro'; name: string; priceKrw: number }[];
  sub: { plan: string | null; nextPlan: string | null; autoRenew: boolean; periodEnd: number | null; graceUntil: number | null; card: string; lastError: string | null; hasCard: boolean } | null;
  payments: { orderId: string; plan: string; amount: number; kind: string; status: string; receiptUrl: string | null; error: string | null; at: number }[];
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!SERVER_URL) throw new AuthError(0, '서버가 설정되지 않았습니다');
  const headers: Record<string, string> = {};
  if (init.body) headers['content-type'] = 'application/json';
  const session = loadSession();
  if (session) headers.authorization = `Bearer ${session}`;
  const r = await fetch(SERVER_URL + path, { ...init, headers });
  if (!r.ok) throw new AuthError(r.status, await r.text());
  return r.json();
}
const post = <T>(path: string, body: unknown = {}) => call<T>(path, { method: 'POST', body: JSON.stringify(body) });

export const BILLING_ERROR: Record<string, string> = {
  business_required: '구독하려면 먼저 위의 사업자 확인을 해 주세요 (세금계산서 발행 조건).',
  not_allowed: '지금은 카드사 심사 중이라 정해진 계정만 결제할 수 있습니다.',
  not_configured: '결제가 아직 켜져 있지 않습니다.',
  bad_plan: '요금제를 다시 골라 주세요.',
  bad_request: '결제 정보가 맞지 않습니다. 다시 시도해 주세요.',
  no_subscription: '구독 중이 아닙니다.',
};
export function describeBillingError(e: unknown): string {
  if (e instanceof AuthError) {
    try { const j = JSON.parse(e.message) as { error?: string; message?: string }; if (j.message) return j.message; if (j.error && BILLING_ERROR[j.error]) return BILLING_ERROR[j.error]; } catch { /* JSON 아님 */ }
  }
  return e instanceof Error ? e.message : String(e);
}

export const fetchBilling = () => call<BillingInfo>('/api/me/billing');
export const cancelSubscription = () => post('/api/me/billing/cancel');
export const resumeSubscription = () => post('/api/me/billing/resume');
export const setNextPlan = (plan: string) => post('/api/me/billing/plan', { plan });

// ---------- 토스 결제창 SDK v2 (스크립트, npm 패키지 없음) ----------
type TossPayments = (clientKey: string) => { payment(o: { customerKey: string }): { requestBillingAuth(o: { method: 'CARD'; successUrl: string; failUrl: string; customerEmail?: string; customerName?: string }): Promise<void> } };
let sdk: Promise<TossPayments> | null = null;
function loadSdk(): Promise<TossPayments> {
  sdk ??= new Promise((ok, fail) => {
    const s = document.createElement('script');
    s.src = 'https://js.tosspayments.com/v2/standard';
    s.onload = () => { const t = (window as unknown as { TossPayments?: TossPayments }).TossPayments; if (t) ok(t); else fail(new Error('토스 결제창을 불러오지 못했습니다')); };
    s.onerror = () => { sdk = null; fail(new Error('토스 결제창을 불러오지 못했습니다')); };
    document.head.appendChild(s);
  });
  return sdk;
}

/** 돌아올 주소: 지금 주소 + billing 인자 (토스가 customerKey·authKey 또는 code·message 를 붙인다) */
function returnUrl(kind: 'success' | 'fail', plan: string) {
  const u = new URL(location.href);
  for (const k of BILLING_PARAMS) u.searchParams.delete(k);
  u.searchParams.set('billing', kind);
  if (kind === 'success') u.searchParams.set('plan', plan);
  return u.toString();
}
/** [구독] / [카드 바꾸기]: 카드 등록 창을 연다 (성공하면 이 주소로 돌아와 issue) */
export async function startCardRegistration(plan: string, email: string, name: string) {
  const p = await post<{ customerKey: string; clientKey: string }>('/api/me/billing/prepare', { plan });
  if (p.clientKey === 'fake') { location.href = `${returnUrl('success', plan)}&customerKey=${encodeURIComponent(p.customerKey)}&authKey=fake-ok`; return; }
  const Toss = await loadSdk();
  await Toss(p.clientKey).payment({ customerKey: p.customerKey }).requestBillingAuth({ method: 'CARD', successUrl: returnUrl('success', plan), failUrl: returnUrl('fail', plan), customerEmail: email, ...(name ? { customerName: name } : {}) });
}

export const BILLING_PARAMS = ['billing', 'plan', 'customerKey', 'authKey', 'code', 'message', 'orderId'];
export type BillingReturn = { kind: 'success'; plan: string; customerKey: string; authKey: string } | { kind: 'fail'; message: string };
/** 시작 주소의 결제 결과를 읽고 주소에서 지운다 */
export function takeBillingReturn(): BillingReturn | null {
  const u = new URL(location.href);
  const kind = u.searchParams.get('billing');
  if (kind !== 'success' && kind !== 'fail') return null;
  const r: BillingReturn = kind === 'success'
    ? { kind, plan: u.searchParams.get('plan') ?? '', customerKey: u.searchParams.get('customerKey') ?? '', authKey: u.searchParams.get('authKey') ?? '' }
    : { kind, message: u.searchParams.get('message') || '카드 등록이 취소되었습니다.' };
  for (const k of BILLING_PARAMS) u.searchParams.delete(k);
  history.replaceState(null, '', u.pathname + (u.search ? u.search : ''));
  return r;
}
/** 돌아온 카드 등록 → 빌링키 발급 + (새 구독이면) 첫 달 결제 */
export const issueBilling = (r: { plan: string; customerKey: string; authKey: string }) =>
  post<{ ok: true; changed?: 'card' }>('/api/me/billing/issue', r);

// ---------- 유료 버전 신청 (2026-10-30, 정식 결제 전) ----------
// 토스가 견적 연동 수수료 구조로 입점을 거절해 정식 결제 전까지는 신청제: 신청 → 서버가 1~2시간 안에 요금제를 올린다(결제 없음)
export interface PlanRequestInfo {
  /** 정식 결제 전 (신청제) */
  beta: boolean;
  delayMs: number;
  request: { plan: string; requestedAt: number; grantedAt: number | null } | null;
}
export const fetchPlanRequest = () => call<PlanRequestInfo>('/api/me/plan-request');
export const requestPlan = (plan: 'basic' | 'pro') => post<{ ok: boolean }>('/api/me/plan-request', { plan });
