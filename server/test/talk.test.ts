import { describe, expect, it } from 'vitest';
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
