// 요청 = 보드 복제 (2026-10-22 사용자: "이미 서버에 이미지가 있는데 이중으로 작동한다. 현재 가게 사장님의 요청 페이지를 현재 사용하는 페이지를 활용해 그 상태를 요청페이지로 복제해 놓는건 어떤가?"
// → "복제해서 자기 프로젝트로 가져오는건 옵션으로 보통 새로 만들경우도 있어서"): 사진을 다시 올리지 않고 견적 초안 방을 읽기 전용 요청 프로젝트로 복제,
// 간판집은 [그대로 가져오기 · 사진만 · 빈 프로젝트] 중에서 고른다
import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:test';
import * as Y from 'yjs';
import { api, get, json, login } from './helpers';
import { shopRequestLink } from '../src/requests';

const sha = async (b: Uint8Array) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', b))].slice(0, 16).map((x) => x.toString(16).padStart(2, '0')).join('');
const randPhone = () => `010${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`;
const u = () => crypto.randomUUID().slice(0, 6);

async function draftWithPhoto() {
  const cust = await login(`snap-c-${u()}@example.com`);
  const { project } = await (await json('/api/estimate/project', {}, cust)).json<{ project: { id: string } }>();
  const bytes = new Uint8Array(200); bytes.set([137, 80, 78, 71, Math.floor(Math.random() * 255), Math.floor(Math.random() * 255)]);
  const asset = await sha(bytes);
  expect((await api(`/api/assets/${asset}?project=${project.id}&session=${cust}`, { method: 'PUT', body: bytes, headers: { 'content-type': 'image/png' } })).status).toBe(201);
  const doc = new Y.Doc();
  const ph = new Y.Map<unknown>(); for (const [k, v] of Object.entries({ id: 'p1', name: '가게', assetId: asset, w: 1000, h: 800, x: 0, y: 0, width: 1200 })) ph.set(k, v);
  doc.getMap('photos').set('p1', ph);
  const ob = new Y.Map<unknown>(); for (const [k, v] of Object.entries({ id: 'o1', photoId: 'p1', name: '전면 간판', shape: 'rect', quad: [[100, 100], [900, 100], [900, 300], [100, 300]], sheetIds: [], widthMm: 4000, heightMm: 1000, createdAt: 1 })) ob.set(k, v);
  doc.getMap('objects').set('o1', ob);
  const st = doc.getMap<unknown>('settings');
  st.set('estimateDraft', { store: 'x' }); st.set('estimateIdentity', 'general'); st.set('quoteMode', 'auto'); st.set('flatScale', 0.2); st.set('prices', { cost: 1 });
  doc.getArray('messages').push([{ id: 'm1', objectId: 'project', author: '나', text: '메모', ts: 1 }]);
  await env.ROOM.getByName(project.id).seedFrom(Y.encodeStateAsUpdate(doc));
  return { cust, draft: project.id, asset };
}
const docOf = async (projectId: string) => { const d = new Y.Doc(); Y.applyUpdate(d, await env.ROOM.getByName(projectId).exportState()); return d; };
const send = (cust: string, draft: string, o: Record<string, unknown> = {}) => json('/api/requests', { store: '스냅 정육점', address: '경기도 광주시 경안로 1', phone: randPhone(), general: true, fromProject: draft, ...o }, cust);

describe('요청 = 견적 초안 방의 읽기 전용 복제', () => {
  it('fromProject 로 보내면 사진을 다시 올리지 않고 요청 프로젝트(kind request)가 생긴다 — 사진·사인물은 그대로, 초안 설정·대화는 빼고', async () => {
    const { cust, draft, asset } = await draftWithPhoto();
    const r = await send(cust, draft);
    expect(r.status).toBe(201);
    const { id, snapshotProject } = await r.json<{ id: string; snapshotProject: string }>();
    expect(snapshotProject).toMatch(/^[A-Za-z0-9_-]+$/);
    const row = await env.DB.prepare('SELECT owner_id, kind FROM projects WHERE id = ?').bind(snapshotProject).first<{ kind: string }>();
    expect(row!.kind).toBe('request');
    const d = await docOf(snapshotProject);
    expect((d.getMap<Y.Map<unknown>>('photos').get('p1')!).get('assetId')).toBe(asset);
    expect(d.getMap('objects').size).toBe(1);
    expect(d.getMap('settings').has('estimateDraft')).toBe(false);
    expect(d.getMap('settings').has('estimateIdentity')).toBe(false);
    expect(d.getMap('settings').has('quoteMode')).toBe(false); // 단가·견적 설정은 안 옮긴다 (외주 요청은 다른 간판집이 읽는다)
    expect(d.getMap('settings').get('flatScale')).toBe(0.2); // 보드 배치는
    expect(d.getArray('messages').length).toBe(0);
    const v = await (await get(`/api/requests/${id}`, cust)).json<{ request: { snapshot: { project: string; photos: string[] } } }>();
    expect(v.request.snapshot).toEqual({ project: snapshotProject, photos: [asset] });
    // 요청 프로젝트는 홈 목록에 안 나온다
    const list = await (await get('/api/projects', cust)).json<{ projects: { id: string }[] }>();
    expect(list.projects.map((p) => p.id)).not.toContain(snapshotProject);
  });
  it('남의 방·견적 초안이 아닌 방으로는 400', async () => {
    const { draft } = await draftWithPhoto();
    const other = await login(`snap-o-${u()}@example.com`);
    expect((await send(other, draft)).status).toBe(400);
    const { project } = await (await json('/api/projects', { name: '보통' }, other)).json<{ project: { id: string } }>();
    expect((await send(other, project.id)).status).toBe(400);
  });
  it('요청 프로젝트는 누구에게나 읽기 전용: 가게 사장도 viewer, 지역 간판집 viewer(사진도 받음), 상관없는 계정 403', async () => {
    const { cust, draft, asset } = await draftWithPhoto();
    const { snapshotProject } = await (await send(cust, draft)).json<{ snapshotProject: string }>();
    const shop = await login(`snap-s-${u()}@example.com`);
    await json('/api/me/request-settings', { receive: true, regions: ['경기 광주시'] }, shop, 'PUT');
    const stranger = await login(`snap-x-${u()}@example.com`);
    const role = async (s: string) => { const r = await get(`/api/projects/${snapshotProject}/access`, s); return r.status === 200 ? (await r.json<{ role: string }>()).role : r.status; };
    expect(await role(cust)).toBe('viewer');
    expect(await role(shop)).toBe('viewer');
    expect(await role(stranger)).toBe(403);
    expect((await api(`/api/assets/${asset}?project=${snapshotProject}&session=${shop}`)).status).toBe(200);
    expect((await api(`/api/assets/${asset}?project=${snapshotProject}&session=${stranger}`)).status).toBe(403);
  });
});

describe('간판집 [제안 만들기] — 그대로 가져오기 · 사진만 · 빈 프로젝트', () => {
  it('copy = 사진·사인물째, photos = 사진만, blank = 빈 프로젝트; 가져온 사진은 그 간판집 계정에 등록(다시 올리지 않음)', async () => {
    const { cust, draft, asset } = await draftWithPhoto();
    const { id } = await (await send(cust, draft)).json<{ id: string }>();
    const shopFor = async () => { const s = await login(`snap-r-${u()}@example.com`); await json('/api/me/request-settings', { receive: true, regions: ['경기 광주시'] }, s, 'PUT'); return s; };
    const respond = async (mode: string) => { const s = await shopFor(); const r = await json(`/api/requests/${id}/respond`, { mode }, s); expect(r.status).toBe(201); const { project } = await r.json<{ project: { id: string } }>(); return { s, project: project.id }; };
    const copy = await respond('copy');
    const dc = await docOf(copy.project);
    expect(dc.getMap('photos').size).toBe(1);
    expect(dc.getMap('objects').size).toBe(1);
    expect(dc.getMap('settings').has('quoteMode')).toBe(false); // 소비자 설정은 안 가져온다
    expect((await api(`/api/assets/${asset}?project=${copy.project}&session=${copy.s}`)).status).toBe(200); // 간판집 계정에 등록됨
    const photos = await respond('photos');
    const dp = await docOf(photos.project);
    expect(dp.getMap('photos').size).toBe(1);
    expect(dp.getMap('objects').size).toBe(0);
    const blank = await respond('blank');
    const db = await docOf(blank.project);
    expect(db.getMap('photos').size).toBe(0);
  });
});

describe('알림 메일 링크 (2026-10-22 "견적요청알림으로 견적요청카드에 해당 뷰를 볼수 없다")', () => {
  it('요청 보드가 있으면 그 보드로 바로, 없으면 받은 요청 페이지', () => {
    const e = { APP_URL: 'https://ganpanda.co.kr' };
    expect(shopRequestLink(e, { id: 'r1', snapshot_project: 'p1' })).toBe('https://ganpanda.co.kr/?room=p1&request=r1');
    expect(shopRequestLink(e, { id: 'r1', snapshot_project: null })).toBe('https://ganpanda.co.kr/requests');
  });
});

describe('옛 요청의 실측 보기 (2026-10-22 "실측보기 눌렀는데 프로젝트 안열린다" → "그냥 프로젝트 열어주면되 소비자의 프로젝트를")', () => {
  it('복제가 없는 요청은 POST /board 가 그 가게 사장의 견적 프로젝트를 복제해 읽기 전용 요청 프로젝트로 — 한 번만 만들고, 볼 수 없는 간판집은 403', async () => {
    const { cust, draft, asset } = await draftWithPhoto();
    const { id } = await (await json('/api/requests', { store: '옛 요청', address: '경기도 광주시 경안로 1', phone: randPhone(), general: true }, cust)).json<{ id: string }>(); // fromProject 없이 = 옛 요청
    const shop = await login(`snap-b-${u()}@example.com`);
    await json('/api/me/request-settings', { receive: true, regions: ['경기 광주시'] }, shop, 'PUT');
    const r = await json(`/api/requests/${id}/board`, {}, shop);
    expect(r.status).toBe(200);
    const { project } = await r.json<{ project: string }>();
    expect(project).not.toBe(draft);
    expect((await (await get(`/api/projects/${project}/access`, shop)).json<{ role: string }>()).role).toBe('viewer');
    expect((await docOf(project)).getMap('objects').size).toBe(1);
    expect((await api(`/api/assets/${asset}?project=${project}&session=${shop}`)).status).toBe(200);
    expect((await (await json(`/api/requests/${id}/board`, {}, shop)).json<{ project: string }>()).project).toBe(project); // 다시 불러도 같은 것
    const stranger = await login(`snap-z-${u()}@example.com`);
    expect((await json(`/api/requests/${id}/board`, {}, stranger)).status).toBe(403);
  });
});
