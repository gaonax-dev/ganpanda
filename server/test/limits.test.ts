import { beforeEach, describe, expect, it } from 'vitest';
import { env } from 'cloudflare:test';
import { exports } from 'cloudflare:workers';
import { PLANS } from '../src/plans';
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

describe('요금제 표', () => {
  it('무료 50MB·3명, 스타터 2GB·5명·5만원, 프로 10GB·10명·10만원', () => {
    expect(PLANS.free).toMatchObject({ storageBytes: 50 * MB, seats: 3, priceKrw: 0 });
    expect(PLANS.starter).toMatchObject({ storageBytes: 2 * 1024 * MB, seats: 5, priceKrw: 50000 });
    expect(PLANS.pro).toMatchObject({ storageBytes: 10 * 1024 * MB, seats: 10, priceKrw: 100000 });
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
    expect(me.limits.storageBytes).toBe(50 * MB);
  });

  it('editor 초대로도 올릴 수 있고 소유자 계정 용량에 쌓인다. viewer 는 403', async () => {
    const ed = await createInvite(owner, project.id, 'editor');
    const vw = await createInvite(owner, project.id, 'viewer');
    const a = png(2, 500);
    expect((await put(await idOf(a), a, `project=${project.id}&invite=${ed.token}`)).status).toBe(201);
    const b = png(3, 500);
    expect((await put(await idOf(b), b, `project=${project.id}&invite=${vw.token}`)).status).toBe(403);
    const me = await (await get('/api/me', owner)).json<{ usage: { storageBytes: number } }>();
    expect(me.usage.storageBytes).toBe(500);
  });

  it('한도를 넘으면 413 과 함께 한도·사용량을 알려 준다', async () => {
    await env.DB.prepare('INSERT INTO account_assets (account_id, asset_id, size, created_at) VALUES (?, ?, ?, ?)')
      .bind(ownerId, 'f'.repeat(32), 50 * MB - 100, Date.now()).run();
    const a = png(4, 200);
    const r = await put(await idOf(a), a, `project=${project.id}&session=${owner}`);
    expect(r.status).toBe(413);
    expect(await r.json()).toMatchObject({ error: 'storage_limit', limitBytes: 50 * MB, usedBytes: 50 * MB - 100 });
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

describe('동시접속 좌석 (계정 합계)', () => {
  const ws = (room: string, q: string) => exports.default.fetch(`http://sync/api/rooms/${room}?${q}`, { headers: { Upgrade: 'websocket' } });

  it('무료 3명: 소유자 + 손님 2명까지, 4번째는 429. 한 명이 나가면 들어올 수 있다', async () => {
    const inv = await createInvite(owner, project.id, 'viewer');
    const o = await ws(project.id, `session=${owner}`);
    expect(o.status).toBe(101); o.webSocket!.accept();
    const g1 = await ws(project.id, `invite=${inv.token}&guest=g1`);
    const g2 = await ws(project.id, `invite=${inv.token}&guest=g2`);
    expect([g1.status, g2.status]).toEqual([101, 101]); g1.webSocket!.accept(); g2.webSocket!.accept();
    const g3 = await ws(project.id, `invite=${inv.token}&guest=g3`);
    expect(g3.status).toBe(429);
    expect(await g3.json()).toMatchObject({ error: 'seat_limit', limit: 3 });
    g1.webSocket!.close(1000, 'bye');
    await new Promise((r) => setTimeout(r, 100));
    const g3b = await ws(project.id, `invite=${inv.token}&guest=g3`);
    expect(g3b.status).toBe(101); g3b.webSocket!.accept();
    [o, g2, g3b].forEach((r) => r.webSocket!.close());
  });

  it('같은 사람(같은 guest ID / 같은 계정)의 탭 여러 개는 1석', async () => {
    const inv = await createInvite(owner, project.id, 'viewer');
    const tabs = [];
    for (let i = 0; i < 3; i++) { const r = await ws(project.id, `session=${owner}`); expect(r.status).toBe(101); r.webSocket!.accept(); tabs.push(r); }
    for (let i = 0; i < 3; i++) { const r = await ws(project.id, `invite=${inv.token}&guest=same`); expect(r.status).toBe(101); r.webSocket!.accept(); tabs.push(r); }
    const g2 = await ws(project.id, `invite=${inv.token}&guest=other`);
    expect(g2.status).toBe(101); g2.webSocket!.accept();
    const g3 = await ws(project.id, `invite=${inv.token}&guest=third`);
    expect(g3.status).toBe(429);
    [...tabs, g2].forEach((r) => r.webSocket!.close());
  });

  it('좌석은 계정의 모든 프로젝트를 합쳐 센다', async () => {
    const p2 = await createProject(owner);
    const inv1 = await createInvite(owner, project.id, 'viewer');
    const inv2 = await createInvite(owner, p2.id, 'viewer');
    const a = await ws(project.id, `invite=${inv1.token}&guest=a`); a.webSocket!.accept();
    const b = await ws(project.id, `invite=${inv1.token}&guest=b`); b.webSocket!.accept();
    const c = await ws(p2.id, `invite=${inv2.token}&guest=c`); c.webSocket!.accept();
    expect((await ws(p2.id, `invite=${inv2.token}&guest=d`)).status).toBe(429);
    [a, b, c].forEach((r) => r.webSocket!.close());
  });

  it('/api/me 에 좌석 사용량이 나온다', async () => {
    const o = await ws(project.id, `session=${owner}`); o.webSocket!.accept();
    const me = await (await get('/api/me', owner)).json<{ usage: { seats: number }; limits: { seats: number } }>();
    expect(me.usage.seats).toBe(1);
    expect(me.limits.seats).toBe(3);
    o.webSocket!.close();
  });
});
