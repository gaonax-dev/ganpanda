// 요청 크레딧 1단계 (2026-10-24 사용자: "견적요청을 간판가게가 열면 사진을 모두 제거하고 사이즈와 구성만 텍스트 그리고 리스트만 보이게 해야한다. 그리고 층 그리고 지역 만.
// 사진에 전화번호나 주소가 있어서 해당 내용으로 간판다를 거치지 않고 갈수 있어" → 사진은 "제안을 보낼 때" 열림, 크레딧 = 자동 견적 × 0.3% (최저 3,000 · 최고 50,000))
import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:test';
import * as Y from 'yjs';
import { api, get, json, login } from './helpers';
import { requestFee } from '../src/credit';

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
    // 제안 링크 = 연락처·사진이 열리는 순간
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
