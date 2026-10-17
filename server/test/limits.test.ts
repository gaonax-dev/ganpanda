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

describe('요금제 표 (2026-10-17)', () => {
  it('무료 500MB·1명·제안 월 3건·브랜딩, 베이직 5GB·2명·3만원, 프로 20GB·5명·6만원. 옛 starter 는 베이직으로', () => {
    expect(PLANS.free).toMatchObject({ storageBytes: 500 * MB, seats: 1, proposalsPerMonth: 3, branding: true, priceKrw: 0 });
    expect(PLANS.basic).toMatchObject({ storageBytes: 5 * 1024 * MB, seats: 2, proposalsPerMonth: null, branding: false, priceKrw: 30000 });
    expect(PLANS.pro).toMatchObject({ storageBytes: 20 * 1024 * MB, seats: 5, proposalsPerMonth: null, branding: false, priceKrw: 60000 });
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
    expect(me.limits.storageBytes).toBe(500 * MB);
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
      .bind(ownerId, 'f'.repeat(32), 500 * MB - 100, Date.now()).run();
    const a = png(4, 200);
    const r = await put(await idOf(a), a, `project=${project.id}&session=${owner}`);
    expect(r.status).toBe(413);
    expect(await r.json()).toMatchObject({ error: 'storage_limit', limitBytes: 500 * MB, usedBytes: 500 * MB - 100 });
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

describe('동시접속 좌석 (계정 합계, 직원만 — 고객 열람은 세지 않음 2026-10-17)', () => {
  const ws = (room: string, q: string) => exports.default.fetch(`http://sync/api/rooms/${room}?${q}`, { headers: { Upgrade: 'websocket' } });

  it('viewer(고객) 초대는 몇 명이 열어도 좌석을 쓰지 않는다', async () => {
    const inv = await createInvite(owner, project.id, 'viewer');
    const o = await ws(project.id, `session=${owner}`);
    expect(o.status).toBe(101); o.webSocket!.accept();
    const guests = [];
    for (let i = 0; i < 5; i++) { const g = await ws(project.id, `invite=${inv.token}&guest=g${i}`); expect(g.status).toBe(101); g.webSocket!.accept(); guests.push(g); }
    const me = await (await get('/api/me', owner)).json<{ usage: { seats: number }; limits: { seats: number } }>();
    expect(me.usage.seats).toBe(1);
    expect(me.limits.seats).toBe(1);
    [o, ...guests].forEach((r) => r.webSocket!.close());
  });

  it('무료 1명: 소유자가 앉아 있으면 editor(직원) 초대는 429. 소유자가 나가면 들어올 수 있다', async () => {
    const inv = await createInvite(owner, project.id, 'editor');
    const o = await ws(project.id, `session=${owner}`);
    expect(o.status).toBe(101); o.webSocket!.accept();
    const e1 = await ws(project.id, `invite=${inv.token}&guest=e1`);
    expect(e1.status).toBe(429);
    expect(await e1.json()).toMatchObject({ error: 'seat_limit', limit: 1, used: 1 });
    o.webSocket!.close(1000, 'bye');
    await new Promise((r) => setTimeout(r, 100));
    const e1b = await ws(project.id, `invite=${inv.token}&guest=e1`);
    expect(e1b.status).toBe(101); e1b.webSocket!.accept();
    e1b.webSocket!.close();
  });

  it('같은 사람(같은 guest ID / 같은 계정)의 탭 여러 개는 1석', async () => {
    const tabs = [];
    for (let i = 0; i < 3; i++) { const r = await ws(project.id, `session=${owner}`); expect(r.status).toBe(101); r.webSocket!.accept(); tabs.push(r); }
    const me = await (await get('/api/me', owner)).json<{ usage: { seats: number } }>();
    expect(me.usage.seats).toBe(1);
    tabs.forEach((r) => r.webSocket!.close());
  });

  it('좌석은 계정의 모든 프로젝트를 합쳐 센다 (베이직 2명)', async () => {
    await env.DB.prepare('UPDATE accounts SET plan = ? WHERE id = ?').bind('basic', ownerId).run();
    const p2 = await createProject(owner);
    const inv1 = await createInvite(owner, project.id, 'editor');
    const inv2 = await createInvite(owner, p2.id, 'editor');
    const a = await ws(project.id, `invite=${inv1.token}&guest=a`); expect(a.status).toBe(101); a.webSocket!.accept();
    const b = await ws(p2.id, `invite=${inv2.token}&guest=b`); expect(b.status).toBe(101); b.webSocket!.accept();
    expect((await ws(p2.id, `invite=${inv2.token}&guest=c`)).status).toBe(429);
    [a, b].forEach((r) => r.webSocket!.close());
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
    const a = await (await api(`/api/projects/${project.id}/access?invite=${inv.token}`)).json<{ branding: boolean; seats: { limit: number } }>();
    expect(a.branding).toBe(true);
    expect(a.seats.limit).toBe(1);
    await env.DB.prepare('UPDATE accounts SET plan = ? WHERE id = ?').bind('pro', ownerId).run();
    expect((await (await api(`/api/projects/${project.id}/access?invite=${inv.token}`)).json<{ branding: boolean }>()).branding).toBe(false);
  });
});

describe('개발 모드 요금제 바꾸기 (PUT /api/me/plan)', () => {
  it('AUTH_DEV_LINK=1 에서만 내 요금제를 바꾼다 (E2E 용)', async () => {
    const r = await api('/api/me/plan', { method: 'PUT', body: JSON.stringify({ plan: 'pro' }), headers: { 'content-type': 'application/json', authorization: `Bearer ${owner}` } });
    expect(r.status).toBe(200);
    const me = await (await get('/api/me', owner)).json<{ account: { plan: string }; limits: { seats: number } }>();
    expect(me.account.plan).toBe('pro');
    expect(me.limits.seats).toBe(5);
    expect((await api('/api/me/plan', { method: 'PUT', body: JSON.stringify({ plan: 'vip' }), headers: { 'content-type': 'application/json', authorization: `Bearer ${owner}` } })).status).toBe(400);
  });
});
