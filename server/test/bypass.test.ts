// 간판다 밖 거래 신고 (2026-10-24 사용자: "열람기록이 있는 간판 가계에게 요청서 없이 진행하게되었을때 환불 금액을 업체가 보상…" → 위약금(크레딧 3배·최대 15만원) + 요청 받기 정지, 고객 보상 없음)
import { afterEach, describe, expect, it } from 'vitest';
import { env } from 'cloudflare:test';
import { get, json, login } from './helpers';
import { encryptKey, setTossFetch } from '../src/billing';
import { penaltyOf } from '../src/bypass';

const u = () => crypto.randomUUID().slice(0, 6);
const randPhone = () => `010${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`;
const shopFor = async () => { const s = await login(`bp-s-${u()}@example.com`); await json('/api/me/request-settings', { receive: true, regions: ['경기 광주시'] }, s, 'PUT'); return s; };
const idOf = async (s: string) => (await (await get('/api/me', s)).json<{ account: { id: string } }>()).account.id;
async function request(total = 2_800_000) {
  const cust = await login(`bp-c-${u()}@example.com`);
  const r = await (await json('/api/requests', { store: '신고 분식', address: '경기도 광주시 경안로 1', phone: randPhone(), general: true, floor: '1층', estimateTotal: total }, cust)).json<{ id: string; key: string }>();
  return { cust, ...r };
}
type Reports = { reports: { id: string; requestId: string; shop: string; status: string; penalty: number; viewers: { accountId: string; paid: boolean; blocked: boolean }[] }[] };

afterEach(() => { (env as unknown as { REQUEST_CREDITS: string }).REQUEST_CREDITS = ''; setTossFetch(null); });

describe('간판다 밖 거래 신고', () => {
  it('위약금 = 크레딧 3배, 최대 15만원', () => {
    expect(penaltyOf(8_400)).toBe(25_200);
    expect(penaltyOf(50_000)).toBe(150_000);
  });

  it('요청을 연 간판집은 열람 기록, 가게 사장이 신고(키 또는 세션) → 운영자 목록에 신고 + 열람 업체', async () => {
    const q = await request();
    const shop = await shopFor();
    expect((await json(`/api/requests/${q.id}/respond`, { mode: 'blank' }, shop)).status).toBe(201); // 가져오기 = 열람
    expect((await json(`/api/requests/${q.id}/report`, { shop: '', text: 'x' }, q.cust)).status).toBe(400);
    const stranger = await login(`bp-x-${u()}@example.com`);
    expect((await json(`/api/requests/${q.id}/report`, { shop: '한울광고' }, stranger)).status).toBe(403);
    expect((await json(`/api/requests/${q.id}/report?key=${q.key}`, { shop: '한울광고 010-1234-5678', text: '요청서 보고 직접 전화 왔어요' })).status).toBe(201);
    expect((await get('/api/operator/reports', shop)).status).toBe(403);
    const op = await login('op@example.com');
    const rep = (await (await get('/api/operator/reports', op)).json<Reports>()).reports.find((r) => r.requestId === q.id)!;
    expect(rep).toMatchObject({ shop: '한울광고 010-1234-5678', status: 'open', penalty: 25_200 });
    expect(rep.viewers).toEqual([expect.objectContaining({ accountId: await idOf(shop), paid: false, blocked: false })]);
  });

  it('제재 → 위약금(결제 꺼짐이면 미납) + 요청 받기 정지(새 요청 안 보임, 켤 수 없음) + 운영자가 풀기. 열람하지 않은 업체는 제재 못 함', async () => {
    const q = await request();
    const shop = await shopFor();
    await json(`/api/requests/${q.id}/respond`, { mode: 'blank' }, shop);
    const other = await shopFor();
    await json(`/api/requests/${q.id}/report?key=${q.key}`, { shop: '어떤 간판' });
    const op = await login('op@example.com');
    const rep = (await (await get('/api/operator/reports', op)).json<Reports>()).reports.find((r) => r.requestId === q.id)!;
    expect((await json(`/api/operator/reports/${rep.id}`, { action: 'penalize', accountId: await idOf(other) }, op)).status).toBe(400); // 열람 안 함
    const r = await json(`/api/operator/reports/${rep.id}`, { action: 'penalize', accountId: await idOf(shop) }, op);
    expect(await r.json()).toMatchObject({ status: 'penalized', amount: 25_200, paid: false });
    expect((await json(`/api/operator/reports/${rep.id}`, { action: 'dismiss' }, op)).status).toBe(409);
    const q2 = await request();
    expect((await (await get('/api/requests', shop)).json<{ requests: { id: string }[] }>()).requests.map((x) => x.id)).not.toContain(q2.id);
    expect((await json('/api/me/request-settings', { receive: true, regions: ['경기 광주시'] }, shop, 'PUT')).status).toBe(403);
    expect((await json(`/api/operator/accounts/${await idOf(shop)}/unblock`, {}, op)).status).toBe(200);
    expect((await json('/api/me/request-settings', { receive: true, regions: ['경기 광주시'] }, shop, 'PUT')).status).toBe(200);
  });

  it('결제가 켜져 있고 카드가 있으면 위약금을 결제한다', async () => {
    (env as unknown as { REQUEST_CREDITS: string }).REQUEST_CREDITS = '1';
    const charges: number[] = [];
    setTossFetch(async (_i, init) => { const b = JSON.parse(String(init?.body ?? '{}')); charges.push(b.amount); return new Response(JSON.stringify({ status: 'DONE', paymentKey: 'pk', approvedAt: '2026-10-24T10:00:00+09:00' }), { headers: { 'content-type': 'application/json' } }); });
    const q = await request();
    const shop = await shopFor();
    await env.DB.prepare('INSERT INTO billing (account_id, customer_key, billing_key_enc, card_label, updated_at) VALUES (?, ?, ?, ?, ?)').bind(await idOf(shop), `gpc_${u()}`, await encryptKey(env as unknown as Env, `bk_${u()}`), '카드', Date.now()).run();
    await json(`/api/requests/${q.id}/respond`, { mode: 'blank' }, shop);
    await json(`/api/requests/${q.id}/report?key=${q.key}`, { shop: '그 업체' });
    const op = await login('op@example.com');
    const rep = (await (await get('/api/operator/reports', op)).json<Reports>()).reports.find((r) => r.requestId === q.id)!;
    expect(await (await json(`/api/operator/reports/${rep.id}`, { action: 'penalize', accountId: await idOf(shop) }, op)).json()).toMatchObject({ paid: true, amount: 25_200 });
    expect(charges).toEqual([25_200]);
    const pay = (await (await get('/api/me/billing', shop)).json<{ payments: { kind: string; amount: number }[] }>()).payments;
    expect(pay[0]).toMatchObject({ kind: 'penalty', amount: 25_200 });
  });
});
