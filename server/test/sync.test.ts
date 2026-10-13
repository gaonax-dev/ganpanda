import { beforeEach, describe, expect, it } from 'vitest';
import { env, runInDurableObject } from 'cloudflare:test';
import { exports } from 'cloudflare:workers';
import * as Y from 'yjs';
import { TestClient, until } from './client';
import type { Room } from '../src/room';
import { createProject, login } from './helpers';

// 방 = 프로젝트. 각 테스트는 소유자 세션으로 접속한다
let session = '';
beforeEach(async () => {
  session = await login(`owner-${crypto.randomUUID().slice(0, 8)}@example.com`);
  TestClient.defaultAuth = { session };
});
const room = async () => (await createProject(session)).id;

describe('라우팅', () => {
  it('health', async () => {
    const r = await exports.default.fetch('http://sync/api/health');
    expect(await r.json()).toEqual({ ok: true });
  });

  it('잘못된 방 이름은 400', async () => {
    const r = await exports.default.fetch('http://sync/api/rooms/bad%20name!/ws', { headers: { Upgrade: 'websocket' } });
    expect(r.status).toBe(400);
  });

  it('WebSocket 업그레이드가 아니면 426', async () => {
    const r = await exports.default.fetch(`http://sync/api/rooms/${await room()}/ws?session=${session}`);
    expect(r.status).toBe(426);
  });

  it('CORS preflight 허용', async () => {
    const r = await exports.default.fetch('http://sync/api/assets/abc', { method: 'OPTIONS', headers: { Origin: 'http://localhost:5173' } });
    expect(r.status).toBe(204);
    expect(r.headers.get('access-control-allow-methods')).toContain('PUT');
  });
});

describe('실시간 동기화 (Yjs)', () => {
  it('먼저 들어온 사람의 편집을 나중에 들어온 사람이 받는다', async () => {
    const id = await room();
    const a = await TestClient.connect(id);
    a.doc.getMap('objects').set('o1', 'A가 만든 간판');
    await new Promise((r) => setTimeout(r, 50));
    const b = await TestClient.connect(id);
    await until(() => b.doc.getMap('objects').get('o1') === 'A가 만든 간판');
    a.close(); b.close();
  });

  it('동시에 접속한 사람끼리 실시간으로 주고받는다', async () => {
    const id = await room();
    const a = await TestClient.connect(id);
    const b = await TestClient.connect(id);
    a.doc.getArray('messages').push(['A: 안녕하세요']);
    b.doc.getArray('messages').push(['B: 네']);
    await until(() => a.doc.getArray('messages').length === 2 && b.doc.getArray('messages').length === 2);
    expect(a.doc.getArray('messages').toJSON()).toEqual(b.doc.getArray('messages').toJSON());
    a.close(); b.close();
  });

  it('다른 방과는 섞이지 않는다', async () => {
    const a = await TestClient.connect(await room());
    const b = await TestClient.connect(await room());
    a.doc.getMap('m').set('k', 1);
    await new Promise((r) => setTimeout(r, 100));
    expect(b.doc.getMap('m').get('k')).toBeUndefined();
    a.close(); b.close();
  });

  it('오프라인에서 한 편집을 접속하면서 올린다', async () => {
    const id = await room();
    const offline = new Y.Doc();
    offline.getMap('photos').set('p1', '오프라인 사진');
    const a = await TestClient.connect(id, offline);
    const b = await TestClient.connect(id);
    await until(() => b.doc.getMap('photos').get('p1') === '오프라인 사진');
    a.close(); b.close();
  });
});

describe('저장 (SQLite)', () => {
  it('업데이트가 쌓이면 하나로 압축하고, 저장된 내용으로 같은 문서를 복원한다', async () => {
    const id = await room();
    const a = await TestClient.connect(id);
    for (let i = 0; i < 260; i++) a.doc.getMap('m').set('k' + i, i);
    await new Promise((r) => setTimeout(r, 300));
    const stub = env.ROOM.getByName(id);
    await runInDurableObject(stub, async (_instance: Room, state) => {
      const rows = state.storage.sql.exec<{ data: ArrayBuffer }>('SELECT data FROM updates ORDER BY id').toArray();
      expect(rows.length).toBeLessThan(100);
      const restored = new Y.Doc();
      for (const r of rows) Y.applyUpdate(restored, new Uint8Array(r.data));
      expect(restored.getMap('m').size).toBe(260);
    });
    a.close();
  });
});

describe('접속자 표시 (awareness)', () => {
  it('접속자 상태를 다른 사람에게 전달하고, 나중에 온 사람도 받는다', async () => {
    const id = await room();
    const a = await TestClient.connect(id);
    a.setPresence({ name: '제작자' });
    const b = await TestClient.connect(id);
    await until(() => [...b.awareness.getStates().values()].some((s) => s.name === '제작자'));
    a.close(); b.close();
  });

  it('나가면 다른 사람 화면에서 사라진다', async () => {
    const id = await room();
    const a = await TestClient.connect(id);
    const b = await TestClient.connect(id);
    a.setPresence({ name: '고객' });
    await until(() => b.awareness.getStates().has(a.doc.clientID));
    a.close();
    await until(() => !b.awareness.getStates().has(a.doc.clientID));
    b.close();
  });
});

describe('y-websocket 클라이언트 호환 경로', () => {
  it('/api/rooms/:room (끝에 /ws 없이) 로도 접속된다', async () => {
    const r = await exports.default.fetch(`http://sync/api/rooms/${await room()}?session=${session}`, { headers: { Upgrade: 'websocket' } });
    expect(r.status).toBe(101);
    r.webSocket!.accept(); r.webSocket!.close();
  });
});

describe('접속자 상태의 주인 추적 (y-websocket 은 남의 상태를 되돌려 보낸다)', () => {
  const names = (c: TestClient) => [...c.awareness.getStates().values()].map((s) => s.name).filter(Boolean).sort();

  it('되돌려 보낸(echo) 사람이 나가도 원래 주인은 남고, 나간 사람만 사라진다', async () => {
    const id = await room();
    const a = await TestClient.connect(id);
    a.setPresence({ name: 'A' });
    const b = await TestClient.connect(id);
    b.echo = true;
    b.setPresence({ name: 'B' });
    const c = await TestClient.connect(id);
    c.echo = true;
    c.setPresence({ name: 'C' });
    await until(() => names(c).join() === 'A,B,C' && names(a).join() === 'A,B,C');
    b.close();
    await until(() => names(a).join() === 'A,C' && names(c).join() === 'A,C');
    a.close(); c.close();
  });

  it('같은 clientID 로 다시 접속(재연결)한 뒤 나가면 사라진다', async () => {
    const id = await room();
    const a = await TestClient.connect(id);
    a.setPresence({ name: 'A' });
    const watcher = await TestClient.connect(id);
    await until(() => names(watcher).includes('A'));
    // 재연결: 같은 doc(= 같은 clientID) 으로 새 소켓
    const a2 = await TestClient.connect(id, a.doc);
    a2.setPresence({ name: 'A' });
    await new Promise((r) => setTimeout(r, 100));
    a.close(); // 옛 소켓 종료 — A 는 새 소켓으로 살아 있음
    await new Promise((r) => setTimeout(r, 100));
    a2.setPresence({ name: 'A' });
    await until(() => names(watcher).includes('A'));
    a2.close();
    await until(() => !names(watcher).includes('A'));
    watcher.close();
  });

  it('나중에 온 사람은 살아 있는 접속자의 상태만 받는다', async () => {
    const id = await room();
    const a = await TestClient.connect(id);
    a.setPresence({ name: 'A' });
    const b = await TestClient.connect(id);
    b.setPresence({ name: 'B' });
    await new Promise((r) => setTimeout(r, 100));
    b.close();
    await new Promise((r) => setTimeout(r, 100));
    const c = await TestClient.connect(id);
    await until(() => names(c).includes('A'));
    await new Promise((r) => setTimeout(r, 100));
    expect(names(c)).toEqual(['A']);
    a.close(); c.close();
  });
});
