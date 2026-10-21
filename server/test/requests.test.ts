// 요청판 (2026-10-17 사용자: "입찰을 올리면 가입한 간판사에 전달", "숨고처럼 견적요청에 돈을 받는것이 좋을거 같아")
import { beforeEach, describe, expect, it } from 'vitest';
import { env } from 'cloudflare:test';
import { api, createProject, get, json, login } from './helpers';
import { setNtsFetch } from '../src/business';
import { parseScan, setDocScanner } from '../src/docScan';

const png = (seed: number, size = 64) => { const b = new Uint8Array(size); b.set([137, 80, 78, 71, seed & 255]); return b; };
/** 전화번호당 열린 요청 3건 한도가 있으므로 기본 번호는 매번 다르게 */
const randPhone = () => `010${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`;
const body = (o: Partial<Record<string, string>> = {}) => ({ store: '바로바로 정육점', region: '경기 광주시', text: '전면 간판 교체', phone: randPhone(), ref: 'promo-kim', ...o });
/** 고객 세션 (2026-10-21 로그인 필수 — 카카오 기본) */
let customer = '';
const create = (o: Partial<Record<string, unknown>> = {}, session = customer) => json('/api/requests', body(o as Partial<Record<string, string>>), session);
const putPhoto = (id: string, key: string, bytes: Uint8Array, type = 'image/png') => api(`/api/requests/${id}/photos?key=${key}`, { method: 'PUT', body: bytes, headers: { 'content-type': type } });
const setSettings = (session: string, receive: boolean, regions: string[]) => json('/api/me/request-settings', { receive, regions }, session, 'PUT');

let shop = '';
beforeEach(async () => {
  shop = await login(`shop-${crypto.randomUUID().slice(0, 8)}@example.com`);
  customer = await login(`cust-${crypto.randomUUID().slice(0, 8)}@example.com`);
  await setSettings(shop, true, ['경기 광주시', '성남시 분당구']);
});

describe('요청 올리기 (로그인한 고객)', () => {
  it('로그인 없이는 401 login_required; 요청에 계정이 붙어 키 없이 세션으로도 내 요청을 본다, /mine 에 목록 (2026-10-21)', async () => {
    expect((await create({}, '')).status).toBe(401);
    const { id, key } = await (await create()).json<{ id: string; key: string }>();
    expect((await get(`/api/requests/${id}`, customer)).status).toBe(200); // 키 없이 세션
    expect((await get(`/api/requests/${id}`, shop)).status).toBe(403); // 남의 세션은 안 됨
    expect((await get(`/api/requests/${id}?key=${key}`)).status).toBe(200); // 키는 그대로
    const mine = await (await get('/api/requests/mine', customer)).json<{ requests: { id: string; responses: number }[] }>();
    expect(mine.requests.map((r) => r.id)).toContain(id);
    expect(mine.requests.find((r) => r.id === id)!.responses).toBe(0);
  });
  it('가게·지역·내용·전화로 요청을 만들면 id 와 고객 키·요청 페이지 주소를 준다. 홍보자 코드는 저장', async () => {
    const r = await create({ phone: '010-1234-5678' });
    expect(r.status).toBe(201);
    const j = await r.json<{ id: string; key: string; url: string }>();
    expect(j.id).toMatch(/^[A-Za-z0-9_-]{16}$/);
    expect(j.url).toBe(`http://localhost:5199/r/${j.id}?key=${j.key}`);
    const row = await env.DB.prepare('SELECT * FROM requests WHERE id = ?').bind(j.id).first<{ phone: string; ref: string; key_hash: string; status: string }>();
    expect(row).toMatchObject({ phone: '01012345678', ref: 'promo-kim', status: 'open' });
    expect(row!.key_hash).not.toBe(j.key);
  });
  it('소비자가 그린 사인물(signs)을 함께 실으면 고객 페이지·간판사 목록에 그대로 온다; 틀린 모양은 400 (2026-10-21)', async () => {
    const signs = [{ photo: 0, name: '전면 간판', shape: 'rect', quad: [[100, 100], [900, 100], [900, 300], [100, 300]], widthMm: 4000, heightMm: 1000, productId: 'board-flex', memo: '야간 조명' }];
    const r = await create({ signs });
    expect(r.status).toBe(201);
    const { id, key } = await r.json<{ id: string; key: string }>();
    const view = await (await get(`/api/requests/${id}?key=${encodeURIComponent(key)}`)).json<{ request: { signs: unknown[] } }>();
    expect(view.request.signs).toEqual(signs);
    expect((await create({ signs: [{ photo: 0, name: 'x', shape: 'rect', quad: [] }] })).status).toBe(400);
  });
  it('주소·사업자번호는 선택: 번호는 국세청 상태조회로 확인(active 배지), 폐업은 400 biz_closed, 자릿수 틀리면 bad_biz_no (2026-10-21 "둘다 작성")', async () => {
    const nts = (cd: string) => setNtsFetch(async () => new Response(JSON.stringify({ data: [{ b_no: '2208162517', b_stt_cd: cd }] }), { headers: { 'content-type': 'application/json' } }));
    nts('01');
    const ok = await (await create({ address: '서울 송파구 올림픽로 1', bizNo: '220-81-62517' })).json<{ id: string; key: string }>();
    const v = await (await get(`/api/requests/${ok.id}?key=${ok.key}`)).json<{ request: { address: string; bizNo: string; bizStatus: string } }>();
    expect(v.request).toMatchObject({ address: '서울 송파구 올림픽로 1', bizNo: '2208162517', bizStatus: 'active' });
    nts('03');
    expect(await (await create({ bizNo: '2208162517' })).json()).toEqual({ error: 'biz_closed' });
    expect(await (await create({ bizNo: '2208162518' })).json()).toEqual({ error: 'bad_biz_no' });
    setNtsFetch(null);
  });
  it('사업자등록증 사본: 읽기(doc-scan)는 번호·상호·주소를 돌려주고 못 읽으면 404 scan_failed; 사본 파일은 고객과 제안을 보낸 간판사만 (2026-10-21)', async () => {
    const png = new Uint8Array([137, 80, 78, 71, 1, 2, 3]);
    setDocScanner(async () => ({ bizNo: '2208162517', name: '간판다 카페', address: '서울 송파구' }));
    const scan = await api('/api/requests/doc-scan', { method: 'POST', body: png, headers: { 'content-type': 'image/png', authorization: `Bearer ${customer}` } });
    expect(await scan.json()).toEqual({ fields: { bizNo: '2208162517', name: '간판다 카페', address: '서울 송파구' } });
    setDocScanner(async () => null);
    expect((await api('/api/requests/doc-scan', { method: 'POST', body: png, headers: { 'content-type': 'image/png', authorization: `Bearer ${customer}` } })).status).toBe(404);
    expect((await api('/api/requests/doc-scan', { method: 'POST', body: png, headers: { 'content-type': 'image/png' } })).status).toBe(401);
    setDocScanner(null);
    // 사본 올리기 → 메타, 읽기 권한
    const { id, key } = await (await create()).json<{ id: string; key: string }>();
    expect((await api(`/api/requests/${id}/biz-doc?key=${key}`, { method: 'PUT', body: png, headers: { 'content-type': 'image/png' } })).status).toBe(200);
    const v = await (await get(`/api/requests/${id}`, customer)).json<{ request: { bizDoc: { type: string; size: number } } }>();
    expect(v.request.bizDoc).toEqual({ type: 'image/png', size: 7 });
    expect((await get(`/api/requests/${id}/biz-doc`, customer)).status).toBe(200); // 고객 세션
    expect((await get(`/api/requests/${id}/biz-doc`, shop)).status).toBe(403); // 아직 제안 안 보낸 간판사
    const p = await (await json(`/api/requests/${id}/respond`, {}, shop)).json<{ project: { id: string } }>();
    await json(`/api/projects/${p.project.id}/invites`, { role: 'viewer', kind: 'proposal' }, shop); // 제안 링크 = 응답 기록
    expect((await get(`/api/requests/${id}/biz-doc`, shop)).status).toBe(200);
  });
  it('모델 답에서 JSON 을 뽑고 번호는 검증 자릿수가 맞을 때만', () => {
    expect(parseScan('여기 있습니다: {"bizNo":"220-81-62517","name":" 간판다 ","owner":"홍길동","address":"서울","startDate":"2020.01.05"} 끝')).toEqual({ bizNo: '2208162517', name: '간판다', owner: '홍길동', address: '서울', startDate: '2020-01-05' });
    expect(parseScan('{"bizNo":"220-81-62518","name":""}')).toBeNull();
    expect(parseScan('못 읽음')).toBeNull();
  });
  it('가게·지역·전화가 없거나 전화가 숫자 9~11자리가 아니면 400', async () => {
    expect((await create({ store: '' })).status).toBe(400);
    expect((await create({ region: ' ' })).status).toBe(400);
    expect((await create({ phone: '12' })).status).toBe(400);
    expect((await create({ phone: 'abc' })).status).toBe(400);
  });
  it('같은 전화번호의 열린 요청은 3건까지 (허위 요청 방지)', async () => {
    const phone = `010${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`;
    for (let i = 0; i < 3; i++) expect((await create({ phone })).status).toBe(201);
    const r = await create({ phone });
    expect(r.status).toBe(429);
    expect(await r.json()).toMatchObject({ error: 'request_limit', limit: 3 });
  });
  it('사진은 고객 키로 3장까지, 이미지만, 8MB 까지. 고객 키나 간판사 세션으로 받는다', async () => {
    const { id, key } = await (await create()).json<{ id: string; key: string }>();
    expect((await putPhoto(id, 'wrong', png(1))).status).toBe(403);
    expect((await putPhoto(id, key, png(1), 'text/plain')).status).toBe(415);
    for (let n = 0; n < 3; n++) expect((await putPhoto(id, key, png(n + 1))).status).toBe(201);
    expect((await putPhoto(id, key, png(9))).status).toBe(409);
    const mine = await (await api(`/api/requests/${id}?key=${key}`)).json<{ request: { photos: { n: number; type: string }[] } }>();
    expect(mine.request.photos.map((p) => p.n)).toEqual([0, 1, 2]);
    const asCustomer = await api(`/api/requests/${id}/photos/1?key=${key}`);
    expect(asCustomer.status).toBe(200);
    expect(new Uint8Array(await asCustomer.arrayBuffer())[4]).toBe(2);
    expect((await get(`/api/requests/${id}/photos/1`, shop)).status).toBe(200);
    expect((await api(`/api/requests/${id}/photos/1`)).status).toBe(401);
    const other = await login(`oth-${crypto.randomUUID().slice(0, 6)}@example.com`); // 요청 받기 안 켠 계정
    expect((await get(`/api/requests/${id}/photos/1`, other)).status).toBe(403);
  });
});

describe('간판사: 요청 받기 설정과 받은 요청', () => {
  it('설정은 /api/me 에 보이고, 지역이 맞는 열린 요청만 목록에 온다 (공백 무시). 연락처는 아직 없음', async () => {
    const me = await (await get('/api/me', shop)).json<{ requestSettings: { receive: boolean; regions: string[] } }>();
    expect(me.requestSettings).toEqual({ receive: true, regions: ['경기 광주시', '성남시 분당구'] });
    const a = await (await create({ region: '경기광주시' })).json<{ id: string }>();
    await create({ region: '서울 강남구' });
    const list = await (await get('/api/requests', shop)).json<{ requests: { id: string; store: string; phone?: string; responded: boolean }[] }>();
    const mine = list.requests.find((r) => r.id === a.id)!;
    expect(mine).toMatchObject({ store: '바로바로 정육점', responded: false });
    expect(mine.phone).toBeUndefined();
    expect(list.requests.every((r) => r.id === a.id || r.store !== '서울집')).toBe(true);
  });
  it('요청 받기를 끄면 목록이 비고, 요청 받기 안 켠 계정에도 빈 목록', async () => {
    await create();
    await setSettings(shop, false, ['경기 광주시']);
    expect((await (await get('/api/requests', shop)).json<{ requests: unknown[] }>()).requests).toEqual([]);
  });
});

describe('답하기 → 제안 링크 → 연락처 공개 → 고객 페이지 → 승인', () => {
  it('respond 는 요청 사진이 들어갈 프로젝트를 만들고(request_id), 두 번 부르면 같은 프로젝트', async () => {
    const { id } = await (await create()).json<{ id: string }>();
    const r = await json(`/api/requests/${id}/respond`, {}, shop);
    expect(r.status).toBe(201);
    const { project } = await r.json<{ project: { id: string; name: string; requestId: string } }>();
    expect(project).toMatchObject({ name: '바로바로 정육점 요청', requestId: id });
    const again = await (await json(`/api/requests/${id}/respond`, {}, shop)).json<{ project: { id: string } }>();
    expect(again.project.id).toBe(project.id);
    // 접근 응답에도 requestId (앱이 사진을 가져오는 신호)
    const access = await (await get(`/api/projects/${project.id}/access`, shop)).json<{ requestId?: string }>();
    expect(access.requestId).toBe(id);
    // 지역이 안 맞는 요청에는 답할 수 없다
    const far = await (await create({ region: '부산 해운대구' })).json<{ id: string }>();
    expect((await json(`/api/requests/${far.id}/respond`, {}, shop)).status).toBe(403);
  });
  it('제안 링크를 만들면 응답 기록(요금 근거)이 생기고 연락처가 보이며, 고객 페이지에 제안이 나온다. 승인하면 요청이 승인됨', async () => {
    const { id, key } = await (await create({ phone: '010-9999-0000' })).json<{ id: string; key: string }>();
    const { project } = await (await json(`/api/requests/${id}/respond`, {}, shop)).json<{ project: { id: string } }>();
    const inv = await (await json(`/api/projects/${project.id}/invites`, { role: 'viewer', kind: 'proposal' }, shop)).json<{ token: string }>();
    const rows = await env.DB.prepare('SELECT * FROM request_responses WHERE request_id = ?').bind(id).all<{ project_id: string; proposal_url: string }>();
    expect(rows.results).toHaveLength(1);
    expect(rows.results[0]).toMatchObject({ project_id: project.id, proposal_url: `/p/${project.id}/${inv.token}` }); // 경로만 (로컬 wrangler 는 origin 을 운영 도메인으로 바꿔 보여 준다)
    // 다시 만들면 주소만 갱신
    const inv2 = await (await json(`/api/projects/${project.id}/invites`, { role: 'viewer', kind: 'proposal' }, shop)).json<{ token: string }>();
    const rows2 = await env.DB.prepare('SELECT proposal_url FROM request_responses WHERE request_id = ?').bind(id).all<{ proposal_url: string }>();
    expect(rows2.results).toHaveLength(1);
    expect(rows2.results[0].proposal_url).toContain(inv2.token);
    // 간판사 목록: responded + 연락처
    const list = await (await get('/api/requests', shop)).json<{ requests: { id: string; phone?: string; responded: boolean; projectId?: string }[] }>();
    expect(list.requests.find((r) => r.id === id)).toMatchObject({ responded: true, phone: '01099990000', projectId: project.id });
    // 고객 페이지
    const view = await (await api(`/api/requests/${id}?key=${key}`)).json<{ request: { status: string }; responses: { shop: string; proposalPath: string }[] }>();
    expect(view.request.status).toBe('open');
    expect(view.responses).toHaveLength(1);
    expect(view.responses[0].proposalPath).toBe(`/p/${project.id}/${inv2.token}`);
    expect(view.responses[0].shop).toMatch(/^shop-/);
    expect((await api(`/api/requests/${id}?key=bad`)).status).toBe(403);
    // 승인 → 요청 approved
    const ap = await api(`/api/rooms/${project.id}/approvals?invite=${inv2.token}`, { method: 'POST', body: JSON.stringify({ by: '사장', hash: 'h1', snapshot: { total: 1 } }), headers: { 'content-type': 'application/json' } });
    expect(ap.status).toBe(201);
    const after = await (await api(`/api/requests/${id}?key=${key}`)).json<{ request: { status: string; approvedShop?: string } }>();
    expect(after.request.status).toBe('approved');
    expect(after.request.approvedShop).toMatch(/^shop-/);
  });
  it('보통 프로젝트의 제안 링크는 응답 기록을 만들지 않는다', async () => {
    const p = await createProject(shop);
    await json(`/api/projects/${p.id}/invites`, { role: 'viewer', kind: 'proposal' }, shop);
    const n = await env.DB.prepare('SELECT COUNT(*) AS n FROM request_responses WHERE project_id = ?').bind(p.id).first<{ n: number }>();
    expect(Number(n!.n)).toBe(0);
  });
  it('답한 요청은 지역을 바꾸거나 요청 받기를 꺼도 목록에 남는다', async () => {
    const { id } = await (await create()).json<{ id: string }>();
    await json(`/api/requests/${id}/respond`, {}, shop);
    await setSettings(shop, false, []);
    const list = await (await get('/api/requests', shop)).json<{ requests: { id: string }[] }>();
    expect(list.requests.map((r) => r.id)).toEqual([id]);
  });
});
