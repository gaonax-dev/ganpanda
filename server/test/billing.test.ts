// 결제 (2026-10-23 사용자: "/Users/eshell/dev/xlpop 에 토스페이먼츠로 결제 붙이고 있다. 여기도 진행해줘"):
// 토스 자동결제(빌링키)로 베이직·프로 월 구독. 결제 실패 7일 유예(합산 없음) → 무료, 해지 = 기간 끝까지 쓰고 갱신 안 함 (pricing.md 구독 정지 정책)
import { beforeEach, describe, expect, it } from 'vitest';
import { env } from 'cloudflare:test';
import { addMonthsKst, allowedToPay, decryptKey, encryptKey, isTestKey, runBillingCycle, setTossFetch } from '../src/billing';
import { get, json, login } from './helpers';

type Call = { url: string; auth: string | null; idem: string | null; body: Record<string, unknown> };
let calls: Call[] = [];
/** 결제 결과 차례 (없으면 성공) */
let chargeResults: ('ok' | 'fail')[] = [];
beforeEach(() => {
  calls = []; chargeResults = [];
  setTossFetch(async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const h = new Headers(init?.headers);
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    calls.push({ url, auth: h.get('authorization'), idem: h.get('idempotency-key'), body });
    const res = (status: number, b: unknown) => new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } });
    if (url.endsWith('/v1/billing/authorizations/issue')) return res(200, { billingKey: `bk_${body.authKey}`, customerKey: body.customerKey, cardCompany: '롯데', card: { number: '43301234****123*', cardType: '신용' } });
    if (url.includes('/v1/billing/bk_')) {
      if ((chargeResults.shift() ?? 'ok') === 'fail') return res(400, { code: 'REJECT_CARD_COMPANY', message: '카드사 거절' });
      return res(200, { status: 'DONE', paymentKey: `pk_${body.orderId}`, orderId: body.orderId, totalAmount: body.amount, approvedAt: '2026-10-23T10:00:00+09:00', receipt: { url: 'https://receipt/x' } });
    }
    if (url.includes('/v1/payments/orders/')) return res(200, { status: 'CANCELED', orderId: url.split('/').pop(), paymentKey: 'pk' });
    return res(404, { code: 'NOT_FOUND', message: url });
  });
});

const DAY = 86400_000;
async function shop(withBusiness = true) {
  const email = `pay-${crypto.randomUUID().slice(0, 8)}@example.com`;
  const s = await login(email);
  const id = (await (await get('/api/me', s)).json<{ account: { id: string } }>()).account.id;
  if (withBusiness) {
    const no = String(1000000000 + Math.floor(Math.random() * 8999999999)).slice(0, 10);
    await env.DB.prepare("INSERT INTO businesses (b_no, account_id, owner_name, start_dt, name, status, verified_at, checked_at) VALUES (?, ?, '홍길동', '20200101', '간판집', 'active', 0, 0)").bind(no, id).run();
  }
  return { s, id, email };
}
const planOf = async (id: string) => (await env.DB.prepare('SELECT plan FROM accounts WHERE id = ?').bind(id).first<{ plan: string }>())!.plan;
const billingRow = (id: string) => env.DB.prepare('SELECT * FROM billing WHERE account_id = ?').bind(id).first<Record<string, unknown>>();
async function subscribe(s: string, plan = 'basic') {
  const p = await (await json('/api/me/billing/prepare', { plan }, s)).json<{ customerKey: string; clientKey: string }>();
  return json('/api/me/billing/issue', { authKey: 'auth1', customerKey: p.customerKey, plan }, s);
}

describe('키·도우미', () => {
  it('테스트 키 구분, 테스트 키는 허용 목록만 (비면 모두)', () => {
    expect(isTestKey('test_sk_abc')).toBe(true);
    expect(isTestKey('live_sk_abc')).toBe(false);
    const e = (allow: string) => ({ TOSS_SECRET_KEY: 'test_sk_x', TOSS_TEST_ALLOW_EMAILS: allow }) as unknown as Env;
    expect(allowedToPay(e(''), 'a@x.com')).toBe(true);
    expect(allowedToPay(e('a@x.com, b@x.com'), 'B@x.com')).toBe(true);
    expect(allowedToPay(e('a@x.com'), 'c@x.com')).toBe(false);
    expect(allowedToPay({ TOSS_SECRET_KEY: 'live_sk_x', TOSS_TEST_ALLOW_EMAILS: 'a@x.com' } as unknown as Env, 'c@x.com')).toBe(true);
  });

  it('빌링키는 암호화해 저장 (AES-GCM, 위조하면 풀리지 않음)', async () => {
    const enc = await encryptKey(env as unknown as Env, 'bk_secret');
    expect(enc).not.toContain('bk_secret');
    expect(await decryptKey(env as unknown as Env, enc)).toBe('bk_secret');
    const bad = enc.slice(0, -4) + (enc.endsWith('AAAA') ? 'BBBB' : 'AAAA');
    await expect(decryptKey(env as unknown as Env, bad)).rejects.toThrow();
  });

  it('다음 결제일 = 한국 시각 같은 날, 말일은 그 달 마지막 날로 (기준일 유지)', () => {
    const kst = (s: string) => Date.parse(s + '+09:00');
    expect(addMonthsKst(kst('2026-01-15T10:00:00'), 1, 15)).toBe(kst('2026-02-15T10:00:00'));
    expect(addMonthsKst(kst('2026-01-31T10:00:00'), 1, 31)).toBe(kst('2026-02-28T10:00:00'));
    expect(addMonthsKst(kst('2026-02-28T10:00:00'), 1, 31)).toBe(kst('2026-03-31T10:00:00'));
  });
});

describe('구독 시작', () => {
  it('사업자 확인이 먼저 (유료 전환 = 세금계산서 조건, 2026-10-21 결정)', async () => {
    const { s } = await shop(false);
    const r = await json('/api/me/billing/prepare', { plan: 'basic' }, s);
    expect(r.status).toBe(403);
    expect(await r.json()).toMatchObject({ error: 'business_required' });
  });

  it('카드 등록(빌링키 발급) → 첫 달 바로 결제 → 요금제 베이직, 다음 결제일 한 달 뒤', async () => {
    const { s, id, email } = await shop();
    const cfg = await (await get('/api/me/billing', s)).json<{ configured: boolean; test: boolean; clientKey: string; plans: { id: string; priceKrw: number }[] }>();
    expect(cfg).toMatchObject({ configured: true, test: true, clientKey: 'test_ck_ganpanda' });
    expect(cfg.plans.map((p) => [p.id, p.priceKrw])).toEqual([['basic', 30000], ['pro', 60000]]);
    const before = Date.now();
    const r = await subscribe(s, 'basic');
    expect(r.status).toBe(200);
    expect(await planOf(id)).toBe('basic');
    const issue = calls.find((c) => c.url.endsWith('/authorizations/issue'))!;
    expect(issue.auth).toBe('Basic ' + btoa('test_sk_ganpanda:'));
    const charge = calls.find((c) => c.url.includes('/v1/billing/bk_auth1'))!;
    expect(charge.body).toMatchObject({ amount: 30000, orderName: '간판다 베이직 1개월', customerEmail: email });
    expect(charge.idem).toBe(charge.body.orderId);
    const row = (await billingRow(id))!;
    expect(row.billing_key_enc).not.toContain('bk_auth1');
    expect(row).toMatchObject({ plan: 'basic', auto_renew: 1, card_label: '롯데 43301234****123*' });
    expect(Number(row.period_end)).toBeGreaterThan(before + 27 * DAY);
    const me = await (await get('/api/me/billing', s)).json<{ sub: { plan: string; autoRenew: boolean; card: string }; payments: { amount: number; status: string }[] }>();
    expect(me.sub).toMatchObject({ plan: 'basic', autoRenew: true, card: '롯데 43301234****123*' });
    expect(me.payments[0]).toMatchObject({ amount: 30000, status: 'DONE' });
  });

  it('첫 결제가 거절되면 요금제는 그대로, 오류 안내', async () => {
    const { s, id } = await shop();
    chargeResults = ['fail'];
    const r = await subscribe(s, 'pro');
    expect(r.status).toBe(402);
    expect(await r.json()).toMatchObject({ error: 'charge_failed', message: '카드사 거절' });
    expect(await planOf(id)).toBe('free');
  });

  it('남의 customerKey 로는 발급할 수 없다', async () => {
    const a = await shop(), b = await shop();
    const p = await (await json('/api/me/billing/prepare', { plan: 'basic' }, a.s)).json<{ customerKey: string }>();
    await json('/api/me/billing/prepare', { plan: 'basic' }, b.s);
    const r = await json('/api/me/billing/issue', { authKey: 'x', customerKey: p.customerKey, plan: 'basic' }, b.s);
    expect(r.status).toBe(400);
  });
});

describe('매달 갱신 (cron)', () => {
  const due = async (id: string, at: number) => env.DB.prepare('UPDATE billing SET period_end = ?, last_try_at = NULL WHERE account_id = ?').bind(at, id).run();

  it('결제일이 되면 결제하고 다음 결제일은 원래 날짜에서 한 달 (다음 결제일부터 바꾼 요금제로)', async () => {
    const { s, id } = await shop();
    await subscribe(s, 'basic');
    expect((await json('/api/me/billing/plan', { plan: 'pro' }, s)).status).toBe(200);
    const end = Date.parse('2026-11-05T10:00:00+09:00');
    await due(id, end);
    calls = [];
    await runBillingCycle(env as unknown as Env, end + 3600_000);
    const charge = calls.find((c) => c.url.includes('/v1/billing/bk_'))!;
    expect(charge.body).toMatchObject({ amount: 60000 });
    expect(await planOf(id)).toBe('pro');
    expect((await billingRow(id))!.period_end).toBe(Date.parse('2026-12-05T10:00:00+09:00'));
  });

  it('실패하면 7일 유예(기능 그대로, 하루 한 번 재시도) — 유예 중 성공하면 다음 결제일은 원래 날짜', async () => {
    const { s, id } = await shop();
    await subscribe(s, 'basic');
    const end = Date.parse('2026-11-05T10:00:00+09:00');
    await due(id, end);
    chargeResults = ['fail'];
    await runBillingCycle(env as unknown as Env, end + 3600_000);
    let row = (await billingRow(id))!;
    expect(row.grace_until).toBe(end + 7 * DAY);
    expect(row.last_error).toBe('카드사 거절');
    expect(await planOf(id)).toBe('basic');
    calls = [];
    await runBillingCycle(env as unknown as Env, end + 2 * 3600_000); // 한 시간 뒤: 재시도 안 함
    expect(calls.filter((c) => c.url.includes('/v1/billing/bk_'))).toHaveLength(0);
    await runBillingCycle(env as unknown as Env, end + 2 * DAY); // 다음 날: 재시도 → 성공
    row = (await billingRow(id))!;
    expect(row.grace_until).toBeNull();
    expect(row.period_end).toBe(Date.parse('2026-12-05T10:00:00+09:00'));
    expect(await planOf(id)).toBe('basic');
  });

  it('유예 7일 안에 결제가 없으면 무료로 (그 7일은 청구 안 함)', async () => {
    const { s, id } = await shop();
    await subscribe(s, 'basic');
    const end = Date.parse('2026-11-05T10:00:00+09:00');
    await due(id, end);
    chargeResults = ['fail', 'fail', 'fail', 'fail', 'fail', 'fail', 'fail', 'fail'];
    for (let d = 0; d <= 7; d++) await runBillingCycle(env as unknown as Env, end + d * DAY + 3600_000);
    expect(await planOf(id)).toBe('free');
    expect((await billingRow(id))!).toMatchObject({ plan: null, auto_renew: 0 });
  });

  it('해지 = 기간 끝까지 쓰고 갱신 안 함, 기간 안에 해지 취소 가능', async () => {
    const { s, id } = await shop();
    await subscribe(s, 'basic');
    expect((await json('/api/me/billing/cancel', {}, s)).status).toBe(200);
    expect((await billingRow(id))!.auto_renew).toBe(0);
    expect((await json('/api/me/billing/resume', {}, s)).status).toBe(200);
    expect((await billingRow(id))!.auto_renew).toBe(1);
    await json('/api/me/billing/cancel', {}, s);
    const end = Date.parse('2026-11-05T10:00:00+09:00');
    await due(id, end);
    calls = [];
    await runBillingCycle(env as unknown as Env, end + 3600_000);
    expect(calls).toHaveLength(0);
    expect(await planOf(id)).toBe('free');
  });

  it('다시 구독하면 그날이 새 결제일', async () => {
    const { s, id } = await shop();
    await subscribe(s, 'basic');
    await json('/api/me/billing/cancel', {}, s);
    await due(id, Date.now() - DAY);
    await runBillingCycle(env as unknown as Env, Date.now());
    expect(await planOf(id)).toBe('free');
    const before = Date.now();
    expect((await subscribe(s, 'pro')).status).toBe(200);
    expect(await planOf(id)).toBe('pro');
    expect(Number((await billingRow(id))!.period_end)).toBeGreaterThan(before + 27 * DAY);
  });
});

describe('웹훅', () => {
  it('본문을 믿지 않고 토스에 다시 물어 취소면 기록만 취소로', async () => {
    const { s, id } = await shop();
    await subscribe(s, 'basic');
    const orderId = (await env.DB.prepare('SELECT order_id FROM payments WHERE account_id = ?').bind(id).first<{ order_id: string }>())!.order_id;
    const r = await json('/api/billing/webhook', { eventType: 'PAYMENT_STATUS_CHANGED', data: { orderId, status: 'DONE' } });
    expect(r.status).toBe(200);
    expect((await env.DB.prepare('SELECT status FROM payments WHERE order_id = ?').bind(orderId).first<{ status: string }>())!.status).toBe('CANCELED');
  });
});
