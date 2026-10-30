// 유료 버전 신청 (2026-10-30 사용자: "무료로 사용하시고 정식서비스될때 유료사용으로 전환하게 하고 바로 서비스들어간다. 유료 버전을 신청하면 1-2시간 후에 처리해주고
// 정식 결제서비스 시작되면 그때 유료 전환을 요청한다." → "운영자가 아니고 서버에서"): 결제 없이 신청 → 서버가 1시간 뒤(매시간 작업이라 1~2시간 안) 요금제를 올린다
import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:test';
import { PLAN_GRANT_DELAY_MS, runPlanGrants } from '../src/planRequest';
import { get, json, login } from './helpers';

async function shop() {
  const s = await login(`plan-${crypto.randomUUID().slice(0, 8)}@example.com`);
  const id = (await (await get('/api/me', s)).json<{ account: { id: string } }>()).account.id;
  return { s, id };
}
const planOf = async (s: string) => (await (await get('/api/me', s)).json<{ account: { plan: string } }>()).account.plan;

describe('유료 버전 신청', () => {
  it('신청하면 기다림 상태, 1시간이 지나기 전에는 그대로, 지나면 서버가 요금제를 올린다', async () => {
    const { s } = await shop();
    const r = await json('/api/me/plan-request', { plan: 'pro' }, s);
    expect(r.status).toBe(200);
    const st = await (await get('/api/me/plan-request', s)).json<{ beta: boolean; request: { plan: string; requestedAt: number; grantedAt: number | null } }>();
    expect(st.beta).toBe(true);
    expect(st.request.plan).toBe('pro');
    expect(st.request.grantedAt).toBeNull();
    expect(await planOf(s)).toBe('free');
    await runPlanGrants(env, st.request.requestedAt + PLAN_GRANT_DELAY_MS - 1);
    expect(await planOf(s)).toBe('free');
    expect(await runPlanGrants(env, st.request.requestedAt + PLAN_GRANT_DELAY_MS)).toBeGreaterThanOrEqual(1);
    expect(await planOf(s)).toBe('pro');
    const after = await (await get('/api/me/plan-request', s)).json<{ request: { grantedAt: number | null } }>();
    expect(after.request.grantedAt).not.toBeNull();
  });
  it('계정 정보에 정식 결제 전 여부 — 설정이 바로 신청 칸을 고른다', async () => {
    const { s } = await shop();
    expect((await (await get('/api/me', s)).json<{ account: { paymentsBeta: boolean } }>()).account.paymentsBeta).toBe(true);
  });
  it('1시간은 1~2시간 안에 처리되도록 (매시간 작업)', () => {
    expect(PLAN_GRANT_DELAY_MS).toBe(60 * 60_000);
  });
  it('다른 요금제로 다시 신청하면 새 신청 — 적용될 때까지 지금 요금제 그대로', async () => {
    const { s } = await shop();
    await json('/api/me/plan-request', { plan: 'basic' }, s);
    const t0 = (await (await get('/api/me/plan-request', s)).json<{ request: { requestedAt: number } }>()).request.requestedAt;
    await runPlanGrants(env, t0 + PLAN_GRANT_DELAY_MS);
    expect(await planOf(s)).toBe('basic');
    await json('/api/me/plan-request', { plan: 'pro' }, s);
    const st = await (await get('/api/me/plan-request', s)).json<{ request: { plan: string; grantedAt: number | null; requestedAt: number } }>();
    expect(st.request).toMatchObject({ plan: 'pro', grantedAt: null });
    expect(await planOf(s)).toBe('basic');
    await runPlanGrants(env, st.request.requestedAt + PLAN_GRANT_DELAY_MS);
    expect(await planOf(s)).toBe('pro');
  });
  it('없는 요금제·무료는 신청할 수 없고, 로그인해야 한다', async () => {
    const { s } = await shop();
    expect((await json('/api/me/plan-request', { plan: 'free' }, s)).status).toBe(400);
    expect((await json('/api/me/plan-request', { plan: 'gold' }, s)).status).toBe(400);
    expect((await json('/api/me/plan-request', { plan: 'pro' })).status).toBe(401);
  });
  it('정식 결제가 시작되면(PAYMENTS_LIVE=1) 신청을 받지 않는다', async () => {
    const { s } = await shop();
    const prev = env.PAYMENTS_LIVE;
    (env as { PAYMENTS_LIVE?: string }).PAYMENTS_LIVE = '1';
    try {
      expect((await json('/api/me/plan-request', { plan: 'pro' }, s)).status).toBe(409);
      expect((await (await get('/api/me/plan-request', s)).json<{ beta: boolean }>()).beta).toBe(false);
    } finally { (env as { PAYMENTS_LIVE?: string }).PAYMENTS_LIVE = prev; }
  });
});
