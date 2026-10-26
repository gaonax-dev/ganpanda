import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:test';
import * as Y from 'yjs';
import { TestClient, until } from './client';
import { createProject, get, json, login } from './helpers';

const idOf = async (s: string) => (await (await get('/api/me', s)).json<{ account: { id: string } }>()).account.id;
async function untilAsync(cond: () => Promise<boolean>, ms = 3000) {
  const t = Date.now();
  while (!(await cond())) { if (Date.now() - t > ms) throw new Error('timeout'); await new Promise((r) => setTimeout(r, 30)); }
}
const mail = (p: string) => `${p}-${crypto.randomUUID().slice(0, 8)}@example.com`;

// 2026-10-22 사용자: "메인화면에서 모든 톡방을 열어서 확인하고 링크를 누르면 해당 프로젝트의 링크로 이동", "닉은 사용하는데 아이디로 연결하라는 거지"
describe('톡 색인 · 메인 화면 톡', () => {
  it('방 멤버(계정 아이디)는 메인에서 방을 보고 읽고 보내며, 초대 링크 없이 프로젝트에 들어간다 — 멤버가 아니면 못 본다', async () => {
    const owner = await login(mail('own')), customer = await login(mail('cus')), stranger = await login(mail('str'));
    const [ownerId, customerId] = [await idOf(owner), await idOf(customer)];
    const project = await createProject(owner, '카페 간판');
    const o = await TestClient.connect(project.id, undefined, { session: owner });
    o.doc.transact(() => {
      const t = new Y.Map<unknown>();
      for (const [k, v] of Object.entries({ id: 'r1', name: '고객 상담', memberIds: [customerId], memberNames: { [customerId]: '김고객' }, createdById: ownerId, createdBy: '사장', createdAt: 1 })) t.set(k, v);
      o.doc.getMap('talks').set('r1', t);
    });
    await untilAsync(async () => (await json(`/api/rooms/${project.id}/talk-sync`, {}, owner)).status === 200 && ((await (await get('/api/me/talks', customer)).json<{ talks: unknown[] }>()).talks.length === 1));

    const list = await (await get('/api/me/talks', customer)).json<{ talks: { projectId: string; projectName: string; roomId: string; roomName: string }[] }>();
    expect(list.talks[0]).toMatchObject({ projectId: project.id, projectName: '카페 간판', roomId: 'r1', roomName: '고객 상담' });
    expect((await (await get('/api/me/talks', stranger)).json<{ talks: unknown[] }>()).talks).toEqual([]);

    // 메인에서 보내기 → 문서에 아이디와 함께, 색인의 마지막 메시지 갱신
    expect((await json(`/api/me/talks/${project.id}/r1`, { text: '시안 봤어요' }, customer)).status).toBe(201);
    await until(() => o.doc.getArray('messages').length === 1);
    expect(o.doc.getArray('messages').get(0)).toMatchObject({ objectId: 'talk:r1', text: '시안 봤어요', authorId: customerId });
    const read = await (await get(`/api/me/talks/${project.id}/r1`, customer)).json<{ messages: { text: string }[] }>();
    expect(read.messages.map((m) => m.text)).toEqual(['시안 봤어요']);
    const after = await (await get('/api/me/talks', owner)).json<{ talks: { last: { text: string } | null }[] }>();
    expect(after.talks[0].last?.text).toBe('시안 봤어요');
    expect((await get(`/api/me/talks/${project.id}/r1`, stranger)).status).toBe(403);
    expect((await json(`/api/me/talks/${project.id}/r1`, { text: 'x' }, stranger)).status).toBe(403);

    // 방 멤버는 초대 없이 접근 (고객 = viewer), 남은 403
    const acc = await get(`/api/projects/${project.id}/access`, customer);
    expect(acc.status).toBe(200);
    expect((await acc.json<{ role: string }>()).role).toBe('viewer');
    expect((await get(`/api/projects/${project.id}/access`, stranger)).status).toBe(403);
    o.close();
  });

  it('회사 멤버 방: 대화가 생기면 소유자와 팀 멤버에게 색인되고, 팀 멤버는 editor 로 들어온다', async () => {
    const owner = await login(mail('own')), staff = await login(mail('stf'));
    const staffMail = (await (await get('/api/me', staff)).json<{ account: { email: string } }>()).account.email;
    expect((await json('/api/me/team', { email: staffMail }, owner)).status).toBeLessThan(300);
    const project = await createProject(owner);
    const o = await TestClient.connect(project.id, undefined, { session: owner });
    o.doc.getArray('messages').push([{ id: 'm1', objectId: 'talk:team', author: '사장', text: '내일 시공', kind: 'chat', ts: Date.now() }]);
    await untilAsync(async () => (await json(`/api/rooms/${project.id}/talk-sync`, {}, owner)).status === 200 && ((await (await get('/api/me/talks', staff)).json<{ talks: unknown[] }>()).talks.length === 1));
    const t = await (await get('/api/me/talks', staff)).json<{ talks: { roomId: string; roomName: string }[] }>();
    expect(t.talks[0]).toMatchObject({ roomId: 'team', roomName: '회사 멤버' });
    expect((await (await get(`/api/projects/${project.id}/access`, staff)).json<{ role: string }>()).role).toBe('editor');
    o.close();
  });
});

// 2026-10-26 사용자: "톡 하단에 사용자, 톡으로 탭바, 사용자에 맴버, 요청, 고객 배지, 톡방에는 프로젝트 배지와 고객 배지(고객이 대화방에 있는곳)"
describe('메인 톡: 사용자 목록(멤버·요청·고객) · 방의 고객 표시', () => {
  it('방마다 고객이 있는지(customer)와 방 멤버 아이디, 사용자 목록은 회사 멤버·톡방 고객·견적 요청 고객을 배지로', async () => {
    const owner = await login(mail('own')), staff = await login(mail('stf')), customer = await login(mail('cus')), asker = await login(mail('ask'));
    const [ownerId, staffId, customerId, askerId] = [await idOf(owner), await idOf(staff), await idOf(customer), await idOf(asker)];
    const staffMail = (await (await get('/api/me', staff)).json<{ account: { email: string } }>()).account.email;
    expect((await json('/api/me/team', { email: staffMail }, owner)).status).toBeLessThan(300);
    await env.DB.prepare("UPDATE accounts SET name = '김고객' WHERE id = ?").bind(customerId).run();
    const project = await createProject(owner, '카페 간판');
    const o = await TestClient.connect(project.id, undefined, { session: owner });
    o.doc.transact(() => {
      const t = new Y.Map<unknown>();
      for (const [k, v] of Object.entries({ id: 'r1', name: '고객 상담', memberIds: [customerId], createdById: ownerId, createdBy: '사장', createdAt: 1 })) t.set(k, v);
      o.doc.getMap('talks').set('r1', t);
      const g = new Y.Map<unknown>();
      for (const [k, v] of Object.entries({ id: 'r2', name: '손님 방', memberIds: ['g:guest1'], createdById: ownerId, createdBy: '사장', createdAt: 2 })) g.set(k, v);
      o.doc.getMap('talks').set('r2', g);
      o.doc.getArray('messages').push([{ id: 'm1', objectId: 'talk:team', author: '사장', text: '내일 시공', kind: 'chat', ts: Date.now() }]);
    });
    await untilAsync(async () => (await json(`/api/rooms/${project.id}/talk-sync`, {}, owner)).status === 200 && ((await (await get('/api/me/talks', owner)).json<{ talks: unknown[] }>()).talks.length === 3));
    const talks = (await (await get('/api/me/talks', owner)).json<{ talks: { roomId: string; customer: boolean; memberIds: string[] }[] }>()).talks;
    const room = (id: string) => talks.find((t) => t.roomId === id)!;
    expect(room('r1').customer).toBe(true);
    expect(room('r2').customer).toBe(true); // 계정 없는 손님도 고객
    expect(room('team').customer).toBe(false);
    expect(room('r1').memberIds).toEqual(expect.arrayContaining([ownerId, customerId]));
    // 견적 요청 고객: 내가 제안해 연락처가 열린(결제된) 요청을 보낸 계정
    const rid = `rq${crypto.randomUUID().replace(/-/g, '').slice(0, 14)}`;
    await env.DB.prepare("INSERT INTO requests (id, key_hash, store, region, phone, created_at, account_id) VALUES (?, 'k', '분식집', '경기 광주시', '01000000000', ?, ?)").bind(rid, Date.now(), askerId).run();
    await env.DB.prepare("INSERT INTO request_responses (request_id, account_id, project_id, proposal_url, created_at, paid_at) VALUES (?, ?, ?, '/p/x/y', ?, ?)").bind(rid, ownerId, project.id, Date.now(), Date.now()).run();
    const people = (await (await get('/api/me/people', owner)).json<{ people: { id: string; name: string; badges: string[] }[] }>()).people;
    const who = (id: string) => people.find((x) => x.id === id);
    expect(who(staffId)?.badges).toEqual(['member']);
    expect(who(customerId)).toMatchObject({ name: '김고객', badges: ['customer'] });
    expect(who(askerId)?.badges).toEqual(['request']);
    expect(who(ownerId)).toBeUndefined(); // 나는 빼고
    // 팀 멤버에게는 소유자가 멤버
    const fromStaff = (await (await get('/api/me/people', staff)).json<{ people: { id: string; badges: string[] }[] }>()).people;
    expect(fromStaff.find((x) => x.id === ownerId)?.badges).toEqual(['member']);
    expect((await get('/api/me/people')).status).toBe(401);
    o.close();
  });
});
