import { beforeEach, describe, expect, it } from 'vitest';
import { env } from 'cloudflare:test';
import { exports } from 'cloudflare:workers';
import { PLANS, planOf } from '../src/plans';
import { TestClient } from './client';
import { api, createInvite, createProject, get, login } from './helpers';

const MB = 1024 * 1024;
async function idOf(bytes: Uint8Array) {
  const d = await crypto.subtle.digest('SHA-256', bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
  return [...new Uint8Array(d)].slice(0, 16).map((b) => b.toString(16).padStart(2, '0')).join('');
}
const png = (seed: number, size = 64) => { const b = new Uint8Array(size); b.set([137, 80, 78, 71, seed & 255, seed >> 8]); return b; };
const put = (id: string, body: Uint8Array, q: string) =>
  api(`/api/assets/${id}?${q}`, { method: 'PUT', body, headers: { 'content-type': 'image/png' } });

let owner = '';
let ownerId = '';
let project = { id: '', name: '' };
beforeEach(async () => {
  owner = await login(`lim-${crypto.randomUUID().slice(0, 8)}@example.com`);
  ownerId = (await (await get('/api/me', owner)).json<{ account: { id: string } }>()).account.id;
  project = await createProject(owner);
  TestClient.defaultAuth = {};
});

describe('요금제 표 (2026-10-17 → 2026-10-21 "무료사용 100mb로 … 동시접속은 2인으로 … 다른 요금제도 1.5배로 … 맴버가입수이다")', () => {
  it('무료 100MB·멤버 2명·제안 월 3건·브랜딩, 베이직 5GB·멤버 5명·3만원, 프로 20GB·멤버 10명·6만원 (2026-10-21 "베이직 5명 프로 10명"). 옛 starter 는 베이직으로', () => {
    expect(PLANS.free).toMatchObject({ storageBytes: 100 * MB, members: 2, proposalsPerMonth: 3, branding: true, priceKrw: 0 });
    expect(PLANS.basic).toMatchObject({ storageBytes: 5 * 1024 * MB, members: 5, proposalsPerMonth: null, branding: false, priceKrw: 30000 });
    expect(PLANS.pro).toMatchObject({ storageBytes: 20 * 1024 * MB, members: 10, proposalsPerMonth: null, branding: false, priceKrw: 60000 });
    expect(planOf('starter')).toBe(PLANS.basic);
    expect(planOf('없는요금제')).toBe(PLANS.free);
  });
});

describe('저장 용량', () => {
  it('업로드는 프로젝트와 자격이 필요하고, 사용량은 소유 계정에 쌓인다 (같은 파일은 한 번만)', async () => {
    const a = png(1, 1000);
    const id = await idOf(a);
    expect((await put(id, a, '')).status).toBe(401);
    expect((await put(id, a, `project=${project.id}&session=${owner}`)).status).toBe(201);
    expect((await put(id, a, `project=${project.id}&session=${owner}`)).status).toBe(201); // 중복
    const me = await (await get('/api/me', owner)).json<{ usage: { storageBytes: number }; limits: { storageBytes: number } }>();
    expect(me.usage.storageBytes).toBe(1000);
    expect(me.limits.storageBytes).toBe(100 * MB);
  });

  it('editor·viewer 초대로도 올릴 수 있고(첨부 용), 소유자 계정 용량에 쌓인다', async () => {
    const ed = await createInvite(owner, project.id, 'editor');
    const vw = await createInvite(owner, project.id, 'viewer');
    const a = png(2, 500);
    expect((await put(await idOf(a), a, `project=${project.id}&invite=${ed.token}`)).status).toBe(201);
    const b = png(3, 500);
    expect((await put(await idOf(b), b, `project=${project.id}&invite=${vw.token}`)).status).toBe(201);
    const me = await (await get('/api/me', owner)).json<{ usage: { storageBytes: number } }>();
    expect(me.usage.storageBytes).toBe(1000);
  });

  it('한도를 넘으면 413 과 함께 한도·사용량을 알려 준다', async () => {
    await env.DB.prepare('INSERT INTO account_assets (account_id, asset_id, size, created_at) VALUES (?, ?, ?, ?)')
      .bind(ownerId, 'f'.repeat(32), 100 * MB - 100, Date.now()).run();
    const a = png(4, 200);
    const r = await put(await idOf(a), a, `project=${project.id}&session=${owner}`);
    expect(r.status).toBe(413);
    expect(await r.json()).toMatchObject({ error: 'storage_limit', limitBytes: 100 * MB, usedBytes: 100 * MB - 100 });
  });

  it('다운로드도 프로젝트 자격이 필요하다 (viewer 가능)', async () => {
    const a = png(5, 300);
    const id = await idOf(a);
    await put(id, a, `project=${project.id}&session=${owner}`);
    const vw = await createInvite(owner, project.id, 'viewer');
    expect((await api(`/api/assets/${id}`)).status).toBe(401);
    expect((await api(`/api/assets/${id}?project=${project.id}&invite=${vw.token}`)).status).toBe(200);
    const other = await createProject(await login(`oth-${crypto.randomUUID().slice(0, 6)}@example.com`));
    expect((await api(`/api/assets/${id}?project=${other.id}&session=${owner}`)).status).toBe(403);
  });
});

describe('동시 접속은 막지 않는다 — 한도는 멤버 수 (2026-10-21 "동시접속이라고 했는데 맴버가입수이다")', () => {
  const ws = (room: string, q: string) => exports.default.fetch(`http://sync/api/rooms/${room}?${q}`, { headers: { Upgrade: 'websocket' } });
  it('무료여도 소유자와 editor 초대 여러 명이 함께 접속한다', async () => {
    const inv = await createInvite(owner, project.id, 'editor');
    const o = await ws(project.id, `session=${owner}`);
    expect(o.status).toBe(101); o.webSocket!.accept();
    const eds = [];
    for (let i = 0; i < 3; i++) { const e = await ws(project.id, `invite=${inv.token}&guest=e${i}`); expect(e.status).toBe(101); e.webSocket!.accept(); eds.push(e); }
    [o, ...eds].forEach((r) => r.webSocket!.close());
  });
});

describe('멤버 한도 (설정의 팀 멤버, 소유자 제외 — 무료 2명)', () => {
  const add = (email: string) => api('/api/me/team', { method: 'POST', body: JSON.stringify({ email }), headers: { 'content-type': 'application/json', authorization: `Bearer ${owner}` } });
  const member = async () => { const e = `mem-${crypto.randomUUID().slice(0, 8)}@example.com`; await login(e); return e; };
  it('무료는 2명까지, 3번째는 403 member_limit — 이미 있는 멤버를 다시 보내면(설정 바꾸기) 괜찮다. 베이직은 5명', async () => {
    const [a, b, c] = [await member(), await member(), await member()];
    expect((await add(a)).status).toBe(201);
    expect((await add(b)).status).toBe(201);
    const r = await add(c);
    expect(r.status).toBe(403);
    expect(await r.json()).toMatchObject({ error: 'member_limit', limit: 2, used: 2 });
    expect((await add(a)).status).toBe(201);
    const me = await (await get('/api/me', owner)).json<{ usage: { members: number }; limits: { members: number } }>();
    expect(me.usage.members).toBe(2);
    expect(me.limits.members).toBe(2);
    await env.DB.prepare('UPDATE accounts SET plan = ? WHERE id = ?').bind('basic', ownerId).run();
    expect((await add(c)).status).toBe(201);
    expect((await add(await member())).status).toBe(201);
    expect((await add(await member())).status).toBe(201);
    expect((await add(await member())).status).toBe(403);
  });
});

describe('같은 아이디 동시 사용 (2026-10-21 "동시에 같은 아이디로 작동시 로그아웃 선택하도록 동시에 사용하지 않으면 로그인 유지")', () => {
  const beat = (session: string, device: string) => api('/api/me/presence', { method: 'POST', body: JSON.stringify({ device }), headers: { 'content-type': 'application/json', authorization: `Bearer ${session}` } });
  it('기기 2대까지는 함께 써도 된다(allowed 2) — 3번째 기기가 쓰면 others 2 로 알리고, [다른 곳 로그아웃]하면 다른 기기 세션이 끊긴다. 같은 기기의 탭은 하나 (2026-10-21 "아이디 같이 사용되는거 2개까지는 허용")', async () => {
    const email = `same-${crypto.randomUUID().slice(0, 8)}@example.com`;
    const s1 = await login(email), s2 = await login(email), s3 = await login(email);
    expect(await (await beat(s1, 'phone')).json()).toEqual({ others: 0, allowed: 2 });
    expect(await (await beat(s1, 'phone')).json()).toEqual({ others: 0, allowed: 2 }); // 같은 기기 다른 탭
    expect(await (await beat(s2, 'laptop')).json()).toEqual({ others: 1, allowed: 2 }); // 2대 — 허용
    expect(await (await beat(s3, 'tablet')).json()).toEqual({ others: 2, allowed: 2 }); // 3대째
    const r = await api('/api/me/logout-others', { method: 'POST', body: JSON.stringify({ device: 'tablet' }), headers: { 'content-type': 'application/json', authorization: `Bearer ${s3}` } });
    expect(r.status).toBe(200);
    expect((await get('/api/me', s1)).status).toBe(401);
    expect((await beat(s2, 'laptop')).status).toBe(401);
    expect(await (await beat(s3, 'tablet')).json()).toEqual({ others: 0, allowed: 2 });
  });
});

describe('제안 링크 월 한도 (무료 3건)', () => {
  const proposal = (session: string, projectId: string) => api(`/api/projects/${projectId}/invites`, { method: 'POST', body: JSON.stringify({ role: 'viewer', kind: 'proposal' }), headers: { 'content-type': 'application/json', authorization: `Bearer ${session}` } });

  it('무료는 이번 달 4번째 제안 링크에 402 — 보통 viewer 초대는 세지 않는다. 베이직은 무제한', async () => {
    await createInvite(owner, project.id, 'viewer');
    for (let i = 0; i < 3; i++) expect((await proposal(owner, project.id)).status).toBe(201);
    const r = await proposal(owner, project.id);
    expect(r.status).toBe(402);
    expect(await r.json()).toMatchObject({ error: 'proposal_limit', limit: 3, used: 3 });
    expect((await createInvite(owner, project.id, 'viewer')).role).toBe('viewer');
    const me = await (await get('/api/me', owner)).json<{ usage: { proposals: number }; limits: { proposalsPerMonth: number | null } }>();
    expect(me.usage.proposals).toBe(3);
    expect(me.limits.proposalsPerMonth).toBe(3);
    await env.DB.prepare('UPDATE accounts SET plan = ? WHERE id = ?').bind('basic', ownerId).run();
    expect((await proposal(owner, project.id)).status).toBe(201);
  });

  it('지난달 제안은 세지 않는다 (계정의 모든 프로젝트 합산)', async () => {
    const p2 = await createProject(owner);
    for (let i = 0; i < 2; i++) expect((await proposal(owner, p2.id)).status).toBe(201);
    await env.DB.prepare('UPDATE invites SET created_at = ? WHERE project_id = ?').bind(Date.now() - 40 * 24 * 3600 * 1000, p2.id).run();
    for (let i = 0; i < 3; i++) expect((await proposal(owner, project.id)).status).toBe(201);
    expect((await proposal(owner, project.id)).status).toBe(402);
  });

  it('프로젝트 접근 응답에 소유자 요금제의 브랜딩 여부가 온다 (제안 페이지 하단 표시용)', async () => {
    const inv = await createInvite(owner, project.id, 'viewer');
    const a = await (await api(`/api/projects/${project.id}/access?invite=${inv.token}`)).json<{ branding: boolean }>();
    expect(a.branding).toBe(true);
    await env.DB.prepare('UPDATE accounts SET plan = ? WHERE id = ?').bind('pro', ownerId).run();
    expect((await (await api(`/api/projects/${project.id}/access?invite=${inv.token}`)).json<{ branding: boolean }>()).branding).toBe(false);
  });
});

describe('개발 모드 요금제 바꾸기 (PUT /api/me/plan)', () => {
  it('AUTH_DEV_LINK=1 에서만 내 요금제를 바꾼다 (E2E 용)', async () => {
    const r = await api('/api/me/plan', { method: 'PUT', body: JSON.stringify({ plan: 'pro' }), headers: { 'content-type': 'application/json', authorization: `Bearer ${owner}` } });
    expect(r.status).toBe(200);
    const me = await (await get('/api/me', owner)).json<{ account: { plan: string }; limits: { members: number } }>();
    expect(me.account.plan).toBe('pro');
    expect(me.limits.members).toBe(10);
    expect((await api('/api/me/plan', { method: 'PUT', body: JSON.stringify({ plan: 'vip' }), headers: { 'content-type': 'application/json', authorization: `Bearer ${owner}` } })).status).toBe(400);
  });
});
