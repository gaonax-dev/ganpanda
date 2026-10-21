// 가게 사장의 사업자(여럿) · 일반 주문 · 요청 취소(간판집 제안 건수 환불) · 재요청(재견적) — 2026-10-22 사용자:
// "견적요청 버튼 클릭하면 사업자등록확인 요청 대화식으로 … 사업자 확인이되면 사업자 인증 배지 … 사업자없으면 일반 주문 … 사업자 추가도 … 선택가능하게 …
//  견적이 요청되면 수정이 불가능하다. 견적요청 취소 후 재 요청할수있다. 견적 입찰한 업체들은 토큰을 돌려받고 재 견적 간판다에서 요청을 보낸다"
import { beforeEach, describe, expect, it } from 'vitest';
import { env } from 'cloudflare:test';
import { api, get, json, login } from './helpers';
import { setNtsFetch } from '../src/business';

const VALIDATE = 'https://api.odcloud.kr/api/nts-businessman/v1/validate';
let reply: { valid: '01' | '02'; cd: string } | null = { valid: '01', cd: '01' };
beforeEach(() => {
  reply = { valid: '01', cd: '01' };
  setNtsFetch(async (input) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (!url.startsWith(VALIDATE)) return new Response('no mock', { status: 500 });
    if (!reply) return new Response('down', { status: 503 });
    return Response.json({ data: [{ valid: reply.valid, status: { b_stt_cd: reply.cd } }] });
  });
});
const bno = (nine: string) => { const w = [1, 3, 7, 1, 3, 7, 1, 3, 5]; let s = 0; for (let i = 0; i < 9; i++) s += Number(nine[i]) * w[i]; s += Math.floor((Number(nine[8]) * 5) / 10); return nine + String((10 - (s % 10)) % 10); };
const nine = () => String(100000000 + Math.floor(Math.random() * 8e8));
const randPhone = () => `010${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`;
const store = (no = bno(nine()), o: Record<string, string> = {}) => ({ bizNo: no, ownerName: '홍길동', startDate: '2020-01-05', name: '바로 정육점', address: '경기도 광주시 경안로 1', ...o });
const req = (o: Record<string, unknown> = {}) => ({ store: '바로 정육점', address: '경기도 광주시 경안로 1', phone: randPhone(), text: '전면 간판', ...o });

describe('가게 사장의 사업자 (여럿, 선택)', () => {
  it('국세청 진위확인이 맞으면 인증된 사업자로 저장, 여러 개 추가·목록·삭제', async () => {
    const s = await login(`st-${crypto.randomUUID().slice(0, 6)}@example.com`);
    const a = await json('/api/me/stores', store(), s);
    expect(a.status).toBe(201);
    const { store: st } = await a.json<{ store: { id: string; verified: boolean; name: string; bizNo: string; status: string } }>();
    expect(st).toMatchObject({ verified: true, name: '바로 정육점', status: 'active' });
    await json('/api/me/stores', store(undefined, { name: '두번째 가게' }), s);
    const list = await (await get('/api/me/stores', s)).json<{ stores: { id: string; name: string }[] }>();
    expect(list.stores.map((x) => x.name)).toEqual(['두번째 가게', '바로 정육점']); // 최근 것이 위
    expect((await api(`/api/me/stores/${st.id}`, { method: 'DELETE', headers: { authorization: `Bearer ${s}` } })).status).toBe(200);
    expect((await (await get('/api/me/stores', s)).json<{ stores: unknown[] }>()).stores).toHaveLength(1);
  });
  it('불일치 400 mismatch, 미등록 400 not_registered, 폐업 400 biz_closed, 국세청 장애 502, 자릿수 400', async () => {
    const s = await login(`st-${crypto.randomUUID().slice(0, 6)}@example.com`);
    reply = { valid: '02', cd: '01' };
    expect(await (await json('/api/me/stores', store(), s)).json()).toEqual({ error: 'mismatch' });
    reply = { valid: '02', cd: '' };
    expect(await (await json('/api/me/stores', store(), s)).json()).toEqual({ error: 'not_registered' });
    reply = { valid: '01', cd: '03' };
    expect(await (await json('/api/me/stores', store(), s)).json()).toEqual({ error: 'biz_closed' });
    reply = null;
    expect((await json('/api/me/stores', store(), s)).status).toBe(502);
    expect((await json('/api/me/stores', store('1234567890'), s)).status).toBe(400);
    expect((await json('/api/me/stores', store(), '')).status).toBe(401);
  });
  it('사본을 사업자에 올려 두면 그 사업자로 보낸 요청에 사본이 따라간다 (제안 보낸 간판집만 열람)', async () => {
    const s = await login(`st-${crypto.randomUUID().slice(0, 6)}@example.com`);
    const { store: st } = await (await json('/api/me/stores', store(), s)).json<{ store: { id: string } }>();
    const up = await api(`/api/me/stores/${st.id}/doc`, { method: 'PUT', body: new Uint8Array([137, 80, 78, 71, 1]), headers: { 'content-type': 'image/png', authorization: `Bearer ${s}` } });
    expect(up.status).toBe(200);
    const r = await json('/api/requests', req({ storeId: st.id }), s);
    expect(r.status).toBe(201);
    const { id } = await r.json<{ id: string }>();
    const row = await env.DB.prepare('SELECT biz_no, biz_verified, biz_doc, owner_name, store_id, general FROM requests WHERE id = ?').bind(id).first<Record<string, unknown>>();
    expect(row).toMatchObject({ biz_verified: 1, owner_name: '홍길동', store_id: st.id, general: 0 });
    expect(row!.biz_doc).toBeTruthy();
    expect(await env.ASSETS.get(`requests/${id}/biz-doc`)).toBeTruthy();
  });
  it('남의 사업자·인증 안 된 사업자로는 못 보낸다', async () => {
    const s = await login(`st-${crypto.randomUUID().slice(0, 6)}@example.com`), other = await login(`st-${crypto.randomUUID().slice(0, 6)}@example.com`);
    const { store: st } = await (await json('/api/me/stores', store(), s)).json<{ store: { id: string } }>();
    expect((await json('/api/requests', req({ storeId: st.id }), other)).status).toBe(400);
  });
});

describe('일반 주문 (사업자 없음)', () => {
  it('general: true 면 사업자 확인 없이 받고 일반 주문으로 표시', async () => {
    const s = await login(`gn-${crypto.randomUUID().slice(0, 6)}@example.com`);
    const r = await json('/api/requests', req({ general: true }), s);
    expect(r.status).toBe(201);
    const { id } = await r.json<{ id: string }>();
    const v = await (await get(`/api/requests/${id}`, s)).json<{ request: { general: boolean; bizVerified: boolean; region: string } }>();
    expect(v.request).toMatchObject({ general: true, bizVerified: false, region: '경기 광주시' });
    expect((await json('/api/requests', req(), s)).status).toBe(400); // 사업자도 일반 주문도 아니면 verification_required
  });
});

describe('요청 취소 — 요청을 닫기만 (2026-10-22 "취소만 남기고 환불 재요청 빼줘": 간판집은 이미 연락처를 받았다)', () => {
  it('취소하면 status cancelled, 제안 건수는 그대로, 간판집 목록에는 취소됨, 더는 제안 못 함; prevId 는 무시', async () => {
    const cust = await login(`cx-${crypto.randomUUID().slice(0, 6)}@example.com`);
    const shop = await login(`sx-${crypto.randomUUID().slice(0, 6)}@example.com`);
    const late = await login(`sl-${crypto.randomUUID().slice(0, 6)}@example.com`);
    await json('/api/me/request-settings', { receive: true, regions: ['경기 광주시'] }, shop, 'PUT');
    await json('/api/me/request-settings', { receive: true, regions: ['경기 광주시'] }, late, 'PUT');
    const { id, key } = await (await json('/api/requests', req({ general: true }), cust)).json<{ id: string; key: string }>();
    const { project } = await (await json(`/api/requests/${id}/respond`, {}, shop)).json<{ project: { id: string } }>();
    await json(`/api/projects/${project.id}/invites`, { role: 'viewer', kind: 'proposal' }, shop);
    const used = async () => (await (await get('/api/me', shop)).json<{ usage: { proposals: number } }>()).usage.proposals;
    expect(await used()).toBe(1);
    expect((await json(`/api/requests/${id}/cancel`, {}, shop)).status).toBe(403); // 간판집은 못 취소
    const c = await json(`/api/requests/${id}/cancel?key=${key}`, {}, '');
    expect(c.status).toBe(200);
    expect(await c.json()).toEqual({ ok: true });
    expect(await used()).toBe(1); // 환불 없음
    const v = await (await get(`/api/requests/${id}`, cust)).json<{ request: { status: string; cancelledAt: number } }>();
    expect(v.request.status).toBe('cancelled');
    expect((await json(`/api/requests/${id}/cancel`, {}, cust)).status).toBe(409);
    const list = await (await get('/api/requests', shop)).json<{ requests: { id: string; status: string }[] }>();
    expect(list.requests.find((r) => r.id === id)!.status).toBe('cancelled');
    expect((await (await get('/api/requests', late)).json<{ requests: { id: string }[] }>()).requests.map((r) => r.id)).not.toContain(id); // 새 간판집에는 안 보임
    expect((await json(`/api/requests/${id}/respond`, {}, late)).status).toBe(403);
    // 다시 보내면 그냥 새 요청 (재요청·재견적 없음)
    const re = await json('/api/requests', req({ general: true, prevId: id }), cust);
    expect(re.status).toBe(201);
    const { id: id2 } = await re.json<{ id: string }>();
    expect(await env.DB.prepare('SELECT prev_id FROM requests WHERE id = ?').bind(id2).first()).toEqual({ prev_id: null });
  });
});
