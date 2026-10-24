// 간판집의 외주 요청 (B2B) — 2026-10-22 사용자: "사업자도 요청을 올릴수 있다. 해당 내역도 헤더에 표시. 프로젝트 카드 선택에 다른업체에 외주요청 버튼을 누르면 외주폴더로 이동한다.
// 이제 외주 리스트에서 프로젝트를 열면 기본컬러 핫핑크로 하고 요청 버튼이 생긴다. 해당 건은 b2b로 표시 보여준다"
import { beforeEach, describe, expect, it } from 'vitest';
import { env } from 'cloudflare:test';
import { createInvite, get, json, login } from './helpers';
import { setNtsFetch } from '../src/business';

beforeEach(() => setNtsFetch(async () => Response.json({ data: [{ valid: '01', status: { b_stt_cd: '01' } }] })));
const u = () => crypto.randomUUID().slice(0, 6);
const randPhone = () => `010${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`;
const bno = (nine: string) => { const w = [1, 3, 7, 1, 3, 7, 1, 3, 5]; let s = 0; for (let i = 0; i < 9; i++) s += Number(nine[i]) * w[i]; s += Math.floor((Number(nine[8]) * 5) / 10); return nine + String((10 - (s % 10)) % 10); };

async function outsourced() {
  const shop = await login(`os-${u()}@example.com`);
  const { project } = await (await json('/api/projects', { name: '외주 줄 프로젝트' }, shop)).json<{ project: { id: string } }>();
  return { shop, project: project.id };
}
const send = (s: string, project: string, o: Record<string, unknown> = {}) => json('/api/requests', { store: '가오낙스', address: '경기도 광주시 경안로 1', phone: randPhone(), general: true, fromProject: project, ...o }, s);

describe('외주 표시', () => {
  it('PATCH outsource 로 외주 폴더에 넣고 빼며, 목록·access 에 outsource', async () => {
    const { shop, project } = await outsourced();
    expect((await json(`/api/projects/${project}`, { outsource: true }, shop, 'PATCH')).status).toBe(200);
    const list = await (await get('/api/projects', shop)).json<{ projects: { id: string; outsource: boolean }[] }>();
    expect(list.projects.find((p) => p.id === project)!.outsource).toBe(true);
    expect((await (await get(`/api/projects/${project}/access`, shop)).json<{ outsource: boolean }>()).outsource).toBe(true);
    await json(`/api/projects/${project}`, { outsource: false }, shop, 'PATCH');
    expect((await (await get(`/api/projects/${project}/access`, shop)).json<{ outsource?: boolean }>()).outsource).toBeFalsy();
  });
});

describe('만들기에서 외주 체크 (2026-10-22 "만들기에서 외주체크하면 바로 생성할 수 있다")', () => {
  it('고객(보기 초대·제안 링크)에게는 외주 표시가 없다 — 편집 초대(팀)에는 있다 (2026-10-24 "외주표시가 고객에게도 있다")', async () => {
    const { shop, project } = await outsourced();
    await json(`/api/projects/${project}`, { outsource: true }, shop, 'PATCH');
    const viewer = await createInvite(shop, project, 'viewer');
    expect((await (await get(`/api/projects/${project}/access?invite=${viewer.token}`)).json<{ role: string; outsource?: boolean }>())).toMatchObject({ role: 'viewer' });
    expect((await (await get(`/api/projects/${project}/access?invite=${viewer.token}`)).json<{ outsource?: boolean }>()).outsource).toBeFalsy();
    const editor = await createInvite(shop, project, 'editor');
    expect((await (await get(`/api/projects/${project}/access?invite=${editor.token}`)).json<{ outsource?: boolean }>()).outsource).toBe(true);
  });

  it('POST /api/projects {outsource: true} 면 처음부터 외주 폴더', async () => {
    const shop = await login(`osn-${u()}@example.com`);
    const r = await json('/api/projects', { name: '바로 외주', outsource: true }, shop);
    expect(r.status).toBe(201);
    const { project } = await r.json<{ project: { id: string; outsource: boolean } }>();
    expect(project.outsource).toBe(true);
    expect((await (await get(`/api/projects/${project.id}/access`, shop)).json<{ outsource: boolean }>()).outsource).toBe(true);
    const plain = await (await json('/api/projects', { name: '보통' }, shop)).json<{ project: { outsource: boolean } }>();
    expect(plain.project.outsource).toBe(false);
  });
});

describe('외주 요청 (B2B)', () => {
  it('외주 프로젝트로 보내면 b2b 요청(보드 복제), 외주가 아닌 보통 프로젝트로는 400', async () => {
    const { shop, project } = await outsourced();
    expect((await send(shop, project)).status).toBe(400); // 외주 표시 전
    await json(`/api/projects/${project}`, { outsource: true }, shop, 'PATCH');
    const r = await send(shop, project);
    expect(r.status).toBe(201);
    const { id, snapshotProject } = await r.json<{ id: string; snapshotProject: string }>();
    expect(snapshotProject).toBeTruthy();
    const v = await (await get(`/api/requests/${id}`, shop)).json<{ request: { b2b: boolean } }>();
    expect(v.request.b2b).toBe(true);
    // 보낸 요청은 /mine 에, 받은 목록에는 내 요청이 안 나온다
    await json('/api/me/request-settings', { receive: true, regions: ['경기 광주시'] }, shop, 'PUT');
    expect((await (await get('/api/requests/mine', shop)).json<{ requests: { id: string; b2b: boolean }[] }>()).requests.find((x) => x.id === id)).toMatchObject({ b2b: true });
    expect((await (await get('/api/requests', shop)).json<{ requests: { id: string }[] }>()).requests.map((x) => x.id)).not.toContain(id);
    // 다른 간판집은 B2B 로 받는다
    const other = await login(`os2-${u()}@example.com`);
    await json('/api/me/request-settings', { receive: true, regions: ['경기 광주시'] }, other, 'PUT');
    expect((await (await get('/api/requests', other)).json<{ requests: { id: string; b2b: boolean }[] }>()).requests.find((x) => x.id === id)).toMatchObject({ b2b: true });
  });
  it('간판집은 설정에서 확인한 자기 사업자(accountBusiness)로 보낼 수 있다 → 사업자 확인', async () => {
    const { shop, project } = await outsourced();
    await json(`/api/projects/${project}`, { outsource: true }, shop, 'PATCH');
    expect((await send(shop, project, { general: undefined, accountBusiness: true })).status).toBe(400); // 사업자 확인 전
    const no = bno(String(100000000 + Math.floor(Math.random() * 8e8)));
    expect((await json('/api/me/business', { no, ownerName: '홍길동', startDate: '2020-01-05', name: '가오낙스' }, shop, 'PUT')).status).toBe(200);
    const r = await send(shop, project, { general: undefined, accountBusiness: true });
    expect(r.status).toBe(201);
    const { id } = await r.json<{ id: string }>();
    const row = await env.DB.prepare('SELECT biz_no, biz_verified, b2b FROM requests WHERE id = ?').bind(id).first();
    expect(row).toEqual({ biz_no: no, biz_verified: 1, b2b: 1 });
  });
});
