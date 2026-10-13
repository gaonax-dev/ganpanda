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

describe('위치 코멘트(핀) API — viewer 가 사진 위에 핀을 꽂는다', () => {
  it('핀이 문서의 pins 에 추가되어 모두에게 전달된다', async () => {
    const inv = await createInvite(owner, project.id, 'viewer');
    const o = await TestClient.connect(project.id, undefined, { session: owner });
    const r = await json(`/api/rooms/${project.id}/pins?invite=${inv.token}`, { photoId: 'photo-1', x: 120.4, y: 340, author: '고객' });
    expect(r.status).toBe(201);
    const { pin } = await r.json<{ pin: { id: string } }>();
    await until(() => o.doc.getMap('pins').has(pin.id));
    const m = (o.doc.getMap('pins').get(pin.id) as { toJSON(): Record<string, unknown> }).toJSON();
    expect(m).toMatchObject({ photoId: 'photo-1', x: 120.4, y: 340, author: '고객', resolved: false });
    expect(typeof m.createdAt).toBe('number');
    o.close();
  });

  it('자격 없으면 401, 좌표·사진이 없으면 400', async () => {
    const inv = await createInvite(owner, project.id, 'viewer');
    expect((await json(`/api/rooms/${project.id}/pins`, { photoId: 'p', x: 1, y: 2, author: 'a' })).status).toBe(401);
    expect((await json(`/api/rooms/${project.id}/pins?invite=${inv.token}`, { photoId: '', x: 1, y: 2, author: 'a' })).status).toBe(400);
    expect((await json(`/api/rooms/${project.id}/pins?invite=${inv.token}`, { photoId: 'p', x: 'no', y: 2, author: 'a' })).status).toBe(400);
  });
});

describe('메시지 첨부 (viewer 대화 API)', () => {
  const att = { assetId: 'a'.repeat(32), name: '현장.jpg', type: 'image/jpeg', size: 1234 };
  it('첨부가 함께 기록되고, 첨부만 있는 메시지(글 없음)도 허용', async () => {
    const inv = await createInvite(owner, project.id, 'viewer');
    const o = await TestClient.connect(project.id, undefined, { session: owner });
    const r = await json(`/api/rooms/${project.id}/messages?invite=${inv.token}`, { objectId: 'obj-1', author: '고객', text: '', kind: 'chat', attachments: [att] });
    expect(r.status).toBe(201);
    await until(() => o.doc.getArray('messages').length === 1);
    expect(o.doc.getArray('messages').get(0)).toMatchObject({ text: '', attachments: [att] });
    o.close();
  });

  it('첨부 형식이 틀리거나 5개를 넘으면 400', async () => {
    const inv = await createInvite(owner, project.id, 'viewer');
    const q = `/api/rooms/${project.id}/messages?invite=${inv.token}`;
    expect((await json(q, { objectId: 'x', author: 'a', text: 'hi', kind: 'chat', attachments: [{ assetId: 'short', name: 'n', type: 'image/png', size: 1 }] })).status).toBe(400);
    expect((await json(q, { objectId: 'x', author: 'a', text: 'hi', kind: 'chat', attachments: Array(6).fill(att) })).status).toBe(400);
    expect((await json(q, { objectId: 'x', author: 'a', text: 'hi', kind: 'chat', attachments: [{ ...att, type: 'text/html' }] })).status).toBe(400);
  });
});
