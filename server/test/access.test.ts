import { beforeEach, describe, expect, it } from 'vitest';
import { exports } from 'cloudflare:workers';
import { TestClient, until } from './client';
import { createInvite, createProject, json, login } from './helpers';

let owner = '';
let project = { id: '', name: '' };
beforeEach(async () => {
  owner = await login(`own-${crypto.randomUUID().slice(0, 8)}@example.com`);
  project = await createProject(owner);
  TestClient.defaultAuth = {};
});
const ws = (room: string, q = '') => exports.default.fetch(`http://sync/api/rooms/${room}${q}`, { headers: { Upgrade: 'websocket' } });

describe('방 접속 권한 (WebSocket)', () => {
  it('등록 안 된 방 404, 자격 없음 401, 다른 프로젝트 초대 403, 소유자 세션 101', async () => {
    expect((await ws('not-registered-room', `?session=${owner}`)).status).toBe(404);
    expect((await ws(project.id)).status).toBe(401);
    const other = await createProject(owner);
    const inv = await createInvite(owner, other.id, 'editor');
    expect((await ws(project.id, `?invite=${inv.token}`)).status).toBe(403);
    const r = await ws(project.id, `?session=${owner}`);
    expect(r.status).toBe(101);
    r.webSocket!.accept(); r.webSocket!.close();
  });

  it('editor 초대로 접속한 사람의 편집은 소유자에게 전달되고 저장된다', async () => {
    const inv = await createInvite(owner, project.id, 'editor');
    const o = await TestClient.connect(project.id, undefined, { session: owner });
    const e = await TestClient.connect(project.id, undefined, { invite: inv.token });
    e.doc.getMap('objects').set('o1', 'editor 가 만든 간판');
    await until(() => o.doc.getMap('objects').get('o1') === 'editor 가 만든 간판');
    o.close(); e.close();
    const later = await TestClient.connect(project.id, undefined, { session: owner });
    await until(() => later.doc.getMap('objects').get('o1') === 'editor 가 만든 간판');
    later.close();
  });

  it('viewer 는 문서를 받지만, viewer 의 편집은 버려진다', async () => {
    const inv = await createInvite(owner, project.id, 'viewer');
    const o = await TestClient.connect(project.id, undefined, { session: owner });
    o.doc.getMap('objects').set('o1', '소유자 간판');
    const v = await TestClient.connect(project.id, undefined, { invite: inv.token });
    await until(() => v.doc.getMap('objects').get('o1') === '소유자 간판');
    v.doc.getMap('objects').set('o1', 'viewer 가 바꿈');
    v.doc.getMap('objects').set('o2', 'viewer 가 추가');
    await new Promise((r) => setTimeout(r, 200));
    expect(o.doc.getMap('objects').get('o1')).toBe('소유자 간판');
    expect(o.doc.getMap('objects').has('o2')).toBe(false);
    o.close(); v.close();
  });

  it('viewer 의 대화는 메시지 API 로 보내고 모두에게 전달된다', async () => {
    const inv = await createInvite(owner, project.id, 'viewer');
    const o = await TestClient.connect(project.id, undefined, { session: owner });
    const r = await json(`/api/rooms/${project.id}/messages?invite=${inv.token}`, { objectId: 'obj-1', author: '고객', text: '사이즈 확인 부탁드려요', kind: 'chat' });
    expect(r.status).toBe(201);
    await until(() => o.doc.getArray('messages').length === 1);
    const m = o.doc.getArray('messages').get(0) as Record<string, unknown>;
    expect(m).toMatchObject({ objectId: 'obj-1', author: '고객', text: '사이즈 확인 부탁드려요', kind: 'chat' });
    expect(typeof m.id).toBe('string');
    expect(typeof m.ts).toBe('number');
    o.close();
  });

  it('메시지 API: 자격 없으면 401, 빈 글은 400, 잘못된 종류는 400', async () => {
    const inv = await createInvite(owner, project.id, 'viewer');
    expect((await json(`/api/rooms/${project.id}/messages`, { objectId: 'x', author: 'a', text: 'hi', kind: 'chat' })).status).toBe(401);
    expect((await json(`/api/rooms/${project.id}/messages?invite=${inv.token}`, { objectId: 'x', author: 'a', text: '   ', kind: 'chat' })).status).toBe(400);
    expect((await json(`/api/rooms/${project.id}/messages?invite=${inv.token}`, { objectId: 'x', author: 'a', text: 'hi', kind: 'note' })).status).toBe(400);
  });
});
