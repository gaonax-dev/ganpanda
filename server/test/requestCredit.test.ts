// 요청 크레딧 1단계 (2026-10-24 사용자: "견적요청을 간판가게가 열면 사진을 모두 제거하고 사이즈와 구성만 텍스트 그리고 리스트만 보이게 해야한다. 그리고 층 그리고 지역 만.
// 사진에 전화번호나 주소가 있어서 해당 내용으로 간판다를 거치지 않고 갈수 있어" → 사진은 "제안을 보낼 때" 열림, 크레딧 = 자동 견적 × 0.3% (최저 3,000 · 최고 50,000))
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { env } from 'cloudflare:test';
import * as Y from 'yjs';
import { api, get, json, login } from './helpers';
import { requestFee, CREDIT_MONTH_LIMIT } from '../src/credit';
import { encryptKey, setTossFetch } from '../src/billing';

const sha = async (b: Uint8Array) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', b))].slice(0, 16).map((x) => x.toString(16).padStart(2, '0')).join('');
const randPhone = () => `010${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`;
const u = () => crypto.randomUUID().slice(0, 6);

async function draftWithPhoto() {
  const cust = await login(`cr-c-${u()}@example.com`);
  const { project } = await (await json('/api/estimate/project', {}, cust)).json<{ project: { id: string } }>();
  const bytes = new Uint8Array(300); bytes.set([137, 80, 78, 71, ...crypto.getRandomValues(new Uint8Array(8))]);
  const asset = await sha(bytes);
  expect((await api(`/api/assets/${asset}?project=${project.id}&session=${cust}`, { method: 'PUT', body: bytes, headers: { 'content-type': 'image/png' } })).status).toBe(201);
  const doc = new Y.Doc();
  const ph = new Y.Map<unknown>(); for (const [k, v] of Object.entries({ id: 'p1', name: '가게', assetId: asset, w: 1000, h: 800, x: 0, y: 0, width: 1200 })) ph.set(k, v);
  doc.getMap('photos').set('p1', ph);
  const ob = new Y.Map<unknown>(); for (const [k, v] of Object.entries({ id: 'o1', photoId: 'p1', name: '전면 간판', shape: 'rect', quad: [[100, 100], [900, 100], [900, 300], [100, 300]], sheetIds: [], widthMm: 4000, heightMm: 1000, createdAt: 1 })) ob.set(k, v);
  doc.getMap('objects').set('o1', ob);
  await env.ROOM.getByName(project.id).seedFrom(Y.encodeStateAsUpdate(doc));
  return { cust, draft: project.id, asset };
}
const send = (cust: string, draft: string, o: Record<string, unknown> = {}) => json('/api/requests', { store: '크레딧 분식', address: '경기도 광주시 경안로 1', phone: randPhone(), general: true, fromProject: draft, floor: '2층', estimateTotal: 2_800_000, ...o }, cust);
/** 결제 카드가 등록된 계정으로 (크레딧 결제 테스트 키 — setTossFetch 없으면 가짜 결제 안 됨 → 위 테스트는 운영자처럼 무료로 두지 않고 카드를 넣는다) */
async function addCard(s: string) {
  const id = (await (await get('/api/me', s)).json<{ account: { id: string } }>()).account.id;
  await env.DB.prepare('INSERT OR REPLACE INTO billing (account_id, customer_key, billing_key_enc, card_label, updated_at) VALUES (?, ?, ?, ?, ?)').bind(id, `gpc_${u()}`, await encryptKey(env as unknown as Env, `bk_${u()}`), '테스트 1234', Date.now()).run();
  return id;
}
const okToss = () => setTossFetch(async () => new Response(JSON.stringify({ status: 'DONE', paymentKey: 'pk', approvedAt: '2026-10-24T10:00:00+09:00' }), { headers: { 'content-type': 'application/json' } }));
const shopFor = async () => { const s = await login(`cr-s-${u()}@example.com`); await json('/api/me/request-settings', { receive: true, regions: ['경기 광주시'] }, s, 'PUT'); return s; };
type Pub = { id: string; floor: string; fee: number; estimateTotal: number | null; photosOpen: boolean; snapshot?: { project: string } };

describe('크레딧 금액', () => {
  it('자동 견적 × 0.3%, 100원 단위 올림, 최저 3,000 · 최고 50,000', () => {
    expect(requestFee(2_800_000)).toBe(8_400);
    expect(requestFee(1_234_567)).toBe(3_800); // 3,703.7 → 3,800
    expect(requestFee(500_000)).toBe(3_000);
    expect(requestFee(0)).toBe(3_000);
    expect(requestFee(null)).toBe(3_000);
    expect(requestFee(16_666_667)).toBe(50_000);
    expect(requestFee(300_000_000)).toBe(50_000);
  });
});

describe('요청: 층·자동 견적·크레딧, 사진은 제안을 보낸 뒤', () => {
  it('보낸 층·자동 견적이 저장되고 간판집 목록에 층·크레딧이 보인다 (사진은 아직 닫힘)', async () => {
    const { cust, draft } = await draftWithPhoto();
    const { id } = await (await send(cust, draft)).json<{ id: string }>();
    const shop = await shopFor();
    const list = (await (await get('/api/requests', shop)).json<{ requests: Pub[] }>()).requests;
    const r = list.find((x) => x.id === id)!;
    expect(r).toMatchObject({ floor: '2층', fee: 8_400, estimateTotal: 2_800_000, photosOpen: false });
    // 제안 전에는 지역·층·사인물만 — 가게 이름·주소·내용·사업자 정보는 가린다 ("층 그리고 지역 만")
    expect(r).toMatchObject({ store: '', address: '', text: '', bizNo: null, region: '경기 광주시', locked: true });
  });

  it('자동 견적이 이상하면 무시(최저 크레딧). 층은 앱이 필수로 받고 서버는 비어도 받는다(예전 앱)', async () => {
    const { cust, draft } = await draftWithPhoto();
    expect((await send(cust, draft, { floor: undefined })).status).toBe(201);
    const ok = await send(cust, draft, { estimateTotal: -5 });
    expect(ok.status).toBe(201);
    const row = await env.DB.prepare('SELECT fee, estimate_total FROM requests WHERE id = ?').bind((await ok.json<{ id: string }>()).id).first<{ fee: number; estimate_total: number | null }>();
    expect(row).toEqual({ fee: 3_000, estimate_total: null });
  });

  it('요청 보드의 사진: 가게 사장은 받고, 간판집은 제안 전 403 — 가져온 내 프로젝트도 사진 파일은 없음(자리는 있음), 접근 정보 photosLocked. 제안 링크를 만들면 둘 다 열린다', async () => {
    const { cust, draft, asset } = await draftWithPhoto();
    const { id, snapshotProject } = await (await send(cust, draft)).json<{ id: string; snapshotProject: string }>();
    const shop = await shopFor();
    expect((await api(`/api/assets/${asset}?project=${snapshotProject}&session=${cust}`)).status).toBe(200);
    expect((await api(`/api/assets/${asset}?project=${snapshotProject}&session=${shop}`)).status).toBe(403);
    const acc = await (await get(`/api/projects/${snapshotProject}/access`, shop)).json<{ photosLocked?: boolean; project: { name: string } }>();
    expect(acc.photosLocked).toBe(true);
    expect(acc.project.name).toBe('견적 요청서'); // 가게 이름 가림
    const { project } = await (await json(`/api/requests/${id}/respond`, { mode: 'copy' }, shop)).json<{ project: { id: string } }>();
    expect((await api(`/api/assets/${asset}?project=${project.id}&session=${shop}`)).status).toBe(404);
    expect((await (await get(`/api/projects/${project.id}/access`, shop)).json<{ photosLocked?: boolean }>()).photosLocked).toBe(true);
    // 제안 링크 = 연락처·사진이 열리는 순간 (크레딧 결제)
    await addCard(shop); okToss();
    expect((await json(`/api/projects/${project.id}/invites`, { role: 'viewer', kind: 'proposal' }, shop)).status).toBe(201);
    expect((await api(`/api/assets/${asset}?project=${project.id}&session=${shop}`)).status).toBe(200);
    expect((await api(`/api/assets/${asset}?project=${snapshotProject}&session=${shop}`)).status).toBe(200);
    expect((await (await get(`/api/projects/${project.id}/access`, shop)).json<{ photosLocked?: boolean }>()).photosLocked).toBeUndefined();
    const r = (await (await get('/api/requests', shop)).json<{ requests: Pub[] }>()).requests.find((x) => x.id === id)!;
    expect(r.photosOpen).toBe(true);
    expect(r).toMatchObject({ store: '크레딧 분식', address: '경기도 광주시 경안로 1' }); // 제안 뒤엔 다 열림
    expect((await (await get(`/api/projects/${snapshotProject}/access`, shop)).json<{ project: { name: string } }>()).project.name).toBe('크레딧 분식 요청서');
  });

  it('운영자는 제안 전에도 사진을 본다 (수동 처리)', async () => {
    const { cust, draft, asset } = await draftWithPhoto();
    const { snapshotProject } = await (await send(cust, draft)).json<{ snapshotProject: string }>();
    const op = await login('op@example.com');
    expect((await api(`/api/assets/${asset}?project=${snapshotProject}&session=${op}`)).status).toBe(200);
  });
});

// 2단계: 제안을 보낼 때 등록 카드로 크레딧 결제 (2026-10-24 "등록 카드로 쓴 만큼", 월 한도 500만원). REQUEST_CREDITS=1 일 때만 (토스 정식 키 전에는 무료)
describe('크레딧 결제 = 제안 링크를 만들 때', () => {
  let charges: { amount: number; orderName: string }[] = [];
  let reject = false;
  afterEach(() => { (env as unknown as { REQUEST_CREDITS: string }).REQUEST_CREDITS = ''; });
  beforeEach(() => {
    (env as unknown as { REQUEST_CREDITS: string }).REQUEST_CREDITS = '1';
    charges = []; reject = false;
    setTossFetch(async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      const res = (status: number, b: unknown) => new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } });
      if (url.includes('/v1/billing/bk_')) { if (reject) return res(400, { code: 'REJECT_CARD_COMPANY', message: '카드사 거절' }); charges.push({ amount: body.amount, orderName: body.orderName }); return res(200, { status: 'DONE', paymentKey: `pk_${body.orderId}`, approvedAt: '2026-10-24T10:00:00+09:00' }); }
      return res(404, {});
    });
  });
  const shopWithCard = async (card = true) => {
    const s = await shopFor();
    const id = (await (await get('/api/me', s)).json<{ account: { id: string } }>()).account.id;
    if (card) await env.DB.prepare('INSERT INTO billing (account_id, customer_key, billing_key_enc, card_label, updated_at) VALUES (?, ?, ?, ?, ?)').bind(id, `gpc_${u()}`, await encryptKey(env as unknown as Env, `bk_${u()}`), '테스트 1234', Date.now()).run();
    return { s, id };
  };
  const requestAndImport = async (s: string, total = 2_800_000) => {
    const { cust, draft } = await draftWithPhoto();
    const { id } = await (await send(cust, draft, { estimateTotal: total })).json<{ id: string }>();
    const { project } = await (await json(`/api/requests/${id}/respond`, { mode: 'copy' }, s)).json<{ project: { id: string } }>();
    return { id, project: project.id };
  };
  const propose = (s: string, project: string) => json(`/api/projects/${project}/invites`, { role: 'viewer', kind: 'proposal' }, s);

  it('카드가 있으면 크레딧을 결제하고 제안 링크를 만든다(사진 열림) — 같은 요청에 다시 제안해도 또 결제하지 않는다. 접근 정보에 크레딧', async () => {
    const { s } = await shopWithCard();
    const { project } = await requestAndImport(s);
    expect((await (await get(`/api/projects/${project}/access`, s)).json<{ credit?: { fee: number; paid: boolean; on: boolean } }>()).credit).toEqual({ fee: 8_400, paid: false, on: true });
    expect((await propose(s, project)).status).toBe(201);
    expect(charges).toEqual([{ amount: 8_400, orderName: expect.stringContaining('견적 요청 크레딧') }]);
    expect((await propose(s, project)).status).toBe(201);
    expect(charges.length).toBe(1);
    expect((await (await get(`/api/projects/${project}/access`, s)).json<{ credit?: { paid: boolean } }>()).credit?.paid).toBe(true);
    const pay = (await (await get('/api/me/billing', s)).json<{ payments: { kind: string; amount: number; status: string }[] }>()).payments;
    expect(pay[0]).toMatchObject({ kind: 'credit', amount: 8_400, status: 'DONE' });
  });

  it('카드가 없으면 402 card_required(금액), 카드 거절이면 402 charge_failed — 제안·사진은 안 열린다', async () => {
    const { s } = await shopWithCard(false);
    const { project } = await requestAndImport(s);
    const r = await propose(s, project);
    expect(r.status).toBe(402);
    expect(await r.json()).toMatchObject({ error: 'card_required', fee: 8_400 });
    const c = await shopWithCard();
    const b = await requestAndImport(c.s);
    reject = true;
    const f = await propose(c.s, b.project);
    expect([f.status, (await f.json<{ error: string }>()).error]).toEqual([402, 'charge_failed']);
    expect((await (await get(`/api/projects/${b.project}/access`, c.s)).json<{ photosLocked?: boolean }>()).photosLocked).toBe(true);
  });

  it('이번 달(한국 시각) 크레딧 합계가 500만원을 넘으면 402 credit_limit', async () => {
    expect(CREDIT_MONTH_LIMIT).toBe(5_000_000);
    const { s, id } = await shopWithCard();
    await env.DB.prepare("INSERT INTO payments (order_id, account_id, plan, amount, kind, status, created_at) VALUES (?, ?, 'credit', ?, 'credit', 'DONE', ?)").bind(`gp-${u()}`, id, 4_995_000, Date.now()).run();
    const { project } = await requestAndImport(s);
    const r = await propose(s, project);
    expect(r.status).toBe(402);
    expect(await r.json()).toMatchObject({ error: 'credit_limit', limit: 5_000_000, used: 4_995_000, fee: 8_400 });
  });

  it('요청 제안은 요금제의 월 제안 건수에 세지 않는다(크레딧으로 낸다), 운영자는 결제 없이', async () => {
    const { s, id } = await shopWithCard();
    for (let i = 0; i < 3; i++) { const p = await (await json('/api/projects', { name: `일반${i}` }, s)).json<{ project: { id: string } }>(); expect((await propose(s, p.project.id)).status).toBe(201); } // 무료 월 3건 다 씀
    const { project } = await requestAndImport(s);
    expect((await propose(s, project)).status).toBe(201);
    expect(charges.length).toBe(1);
    const op = await login('op@example.com');
    const o = await requestAndImport(op);
    expect((await propose(op, o.project)).status).toBe(201);
    expect(charges.length).toBe(1);
    void id;
  });

  it('REQUEST_CREDITS 가 꺼져 있으면 결제 없이 제안(금액만 보인다, on: false)', async () => {
    const { handleProjects } = await import('../src/projects');
    const { s } = await shopWithCard(false);
    const { project } = await requestAndImport(s);
    const e = { ...env, REQUEST_CREDITS: '' } as unknown as Env;
    const a = await handleProjects(new Request(`http://sync/api/projects/${project}/access`, { headers: { authorization: `Bearer ${s}` } }), e, `/api/projects/${project}/access`, new URL(`http://sync/api/projects/${project}/access`));
    expect((await a.json<{ credit?: { on: boolean } }>()).credit?.on).toBe(false);
    const r = await handleProjects(new Request(`http://sync/api/projects/${project}/invites`, { method: 'POST', body: JSON.stringify({ role: 'viewer', kind: 'proposal' }), headers: { 'content-type': 'application/json', authorization: `Bearer ${s}` } }), e, `/api/projects/${project}/invites`, new URL(`http://sync/api/projects/${project}/invites`));
    expect(r.status).toBe(201);
    expect(charges.length).toBe(0);
  });
});
