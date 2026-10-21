// 계정 종류·전환·삭제 (2026-10-22 사용자: "사업자는 소비자 등록이 안된다. 소비자는 사업자로 변경하고 기존 데이터는 사업자로 이관된다, 계정삭제도 필요하다.")
import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:test';
import { api, get, json, login } from './helpers';

const u = () => crypto.randomUUID().slice(0, 6);
const kindOf = async (s: string) => (await (await get('/api/me', s)).json<{ account: { kind: string | null } }>()).account.kind;
const randPhone = () => `010${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`;

describe('계정 종류', () => {
  it('처음 프로젝트를 만들면 간판집(shop), 그 뒤로 견적 초안 방(가게 사장)은 403 shop_account', async () => {
    const s = await login(`k-s-${u()}@example.com`);
    expect(await kindOf(s)).toBeNull();
    expect((await json('/api/projects', { name: 'p' }, s)).status).toBe(201);
    expect(await kindOf(s)).toBe('shop');
    const r = await json('/api/estimate/project', {}, s);
    expect(r.status).toBe(403);
    expect(await r.json()).toEqual({ error: 'shop_account' });
  });
  it('처음 견적 초안 방을 열면 가게 사장(consumer), 그 뒤로 프로젝트 만들기는 403 consumer_account', async () => {
    const s = await login(`k-c-${u()}@example.com`);
    expect((await json('/api/estimate/project', {}, s)).status).toBe(201);
    expect(await kindOf(s)).toBe('consumer');
    const r = await json('/api/projects', { name: 'p' }, s);
    expect(r.status).toBe(403);
    expect(await r.json()).toEqual({ error: 'consumer_account' });
  });
  it('종류가 없던 옛 계정이라도 보통 프로젝트가 있으면 간판집으로 보고 견적 초안 방은 막는다', async () => {
    const s = await login(`k-o-${u()}@example.com`);
    await json('/api/projects', { name: 'p' }, s);
    const me = await (await get('/api/me', s)).json<{ account: { id: string } }>();
    await env.DB.prepare('UPDATE accounts SET kind = NULL WHERE id = ?').bind(me.account.id).run();
    expect((await json('/api/estimate/project', {}, s)).status).toBe(403);
    expect(await kindOf(s)).toBe('shop');
  });
});

describe('가게 사장 → 간판집 전환 (데이터 이관)', () => {
  it('견적 초안 방은 보통 프로젝트가 되어 목록에 나오고, 보낸 요청은 그대로; 간판집 → 가게 사장은 안 된다', async () => {
    const s = await login(`k-t-${u()}@example.com`);
    const { project } = await (await json('/api/estimate/project', {}, s)).json<{ project: { id: string } }>();
    const { id: reqId } = await (await json('/api/requests', { store: '가게', address: '경기도 광주시 경안로 1', phone: randPhone(), general: true }, s)).json<{ id: string }>();
    expect((await (await get('/api/projects', s)).json<{ projects: { id: string }[] }>()).projects.map((p) => p.id)).not.toContain(project.id);
    const r = await json('/api/me/kind', { kind: 'shop' }, s);
    expect(r.status).toBe(200);
    expect(await kindOf(s)).toBe('shop');
    expect((await (await get('/api/projects', s)).json<{ projects: { id: string }[] }>()).projects.map((p) => p.id)).toContain(project.id);
    expect((await (await get('/api/requests/mine', s)).json<{ requests: { id: string }[] }>()).requests.map((x) => x.id)).toContain(reqId);
    expect((await json('/api/projects', { name: '새 프로젝트' }, s)).status).toBe(201);
    expect((await json('/api/me/kind', { kind: 'consumer' }, s)).status).toBe(400);
  });
});

describe('계정 삭제', () => {
  it('확인 글자 "삭제" 가 있어야 하고, 지우면 세션·프로젝트·사업자가 사라지고 요청은 닫히며 연락처가 지워진다', async () => {
    const email = `k-d-${u()}@example.com`;
    const s = await login(email);
    const project = (await (await json('/api/projects', { name: '지울 프로젝트' }, s)).json<{ project: { id: string } }>()).project.id;
    await json('/api/me/request-settings', { receive: true, regions: ['경기 광주시'] }, s, 'PUT');
    const me = await (await get('/api/me', s)).json<{ account: { id: string } }>();
    // 이 계정이 보낸 요청 (외주)
    await json(`/api/projects/${project}`, { outsource: true }, s, 'PATCH');
    const { id: reqId } = await (await json('/api/requests', { store: '가게', address: '경기도 광주시 경안로 1', phone: randPhone(), general: true }, s)).json<{ id: string }>();
    // 다른 계정의 팀에 들어가 있음
    const boss = await login(`k-b-${u()}@example.com`);
    const bossId = (await (await get('/api/me', boss)).json<{ account: { id: string } }>()).account.id;
    await env.DB.prepare('INSERT INTO team_members (owner_id, account_id, can_billing, created_at) VALUES (?, ?, 0, ?)').bind(bossId, me.account.id, Date.now()).run();
    const del = (body: unknown) => api('/api/me', { method: 'DELETE', body: JSON.stringify(body), headers: { 'content-type': 'application/json', authorization: `Bearer ${s}` } });
    expect((await del({})).status).toBe(400);
    expect((await del({ confirm: '삭제' })).status).toBe(200);
    expect((await get('/api/me', s)).status).toBe(401); // 세션 없음
    expect(await env.DB.prepare('SELECT id FROM accounts WHERE id = ?').bind(me.account.id).first()).toBeNull();
    expect(await env.DB.prepare('SELECT id FROM projects WHERE id = ?').bind(project).first()).toBeNull();
    const rq = await env.DB.prepare('SELECT status, phone, email, account_id FROM requests WHERE id = ?').bind(reqId).first();
    expect(rq).toMatchObject({ status: 'cancelled', phone: '', email: null, account_id: null });
    expect(await env.DB.prepare('SELECT 1 FROM team_members WHERE account_id = ?').bind(me.account.id).first()).toBeNull();
    // 같은 이메일로 다시 가입하면 새 계정
    const again = await login(email);
    expect(await kindOf(again)).toBeNull();
  });
});
