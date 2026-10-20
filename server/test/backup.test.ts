// 백업 (2026-10-21 사용자: "우리는 백업이 되고 있는가?" → "클라우드플레어에 백업하는게 좋을 것 같아" → "그 순서대로 진행해줘")
// 1단계: 백업 버킷(BACKUP)에 매시간 — D1 하루 한 번, 바뀐 프로젝트 문서는 그날 날짜로, 사진은 올라올 때 + 예전 것 채우기, 30일 지난 자동 백업 정리
import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:test';
import * as Y from 'yjs';
import { runBackup, dayKey } from '../src/backup';
import { api, createProject, login } from './helpers';

const gunzip = async (b: ArrayBuffer) => new Response(new Blob([b]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
async function sha(bytes: Uint8Array) {
  const d = await crypto.subtle.digest('SHA-256', bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
  return [...new Uint8Array(d)].slice(0, 16).map((b) => b.toString(16).padStart(2, '0')).join('');
}

describe('매시간 백업', () => {
  it('D1 은 하루 한 번(로그인 세션은 빼고), 프로젝트 문서는 바뀐 것만 그날 날짜로 — 안 바뀌면 다시 쓰지 않는다', async () => {
    const s = await login(`bk-${crypto.randomUUID().slice(0, 8)}@example.com`);
    const p = await createProject(s, '백업 매장');
    await env.ROOM.getByName(p.id).addPin('photo-1', 10, 20, '나');
    const now = Date.now();
    await runBackup(env, now);
    const day = dayKey(now);
    const d1 = await env.BACKUP.get(`d1/${day}.json.gz`);
    expect(d1).not.toBeNull();
    const dump = JSON.parse(await gunzip(await d1!.arrayBuffer()));
    expect(dump.tables.projects.some((r: { id: string; name: string }) => r.id === p.id && r.name === '백업 매장')).toBe(true);
    expect(dump.tables.sessions).toBeUndefined();
    const room = await env.BACKUP.get(`rooms/${p.id}/${day}.bin`);
    expect(room).not.toBeNull();
    const doc = new Y.Doc();
    Y.applyUpdate(doc, new Uint8Array(await room!.arrayBuffer()));
    expect([...doc.getMap<Y.Map<unknown>>('pins').values()].map((m) => m.get('photoId'))).toEqual(['photo-1']);
    const first = (await env.BACKUP.head(`rooms/${p.id}/${day}.bin`))!.uploaded.getTime();
    await new Promise((r) => setTimeout(r, 20));
    await runBackup(env, now + 1000);
    expect((await env.BACKUP.head(`rooms/${p.id}/${day}.bin`))!.uploaded.getTime()).toBe(first); // 안 바뀜 → 그대로
    await env.ROOM.getByName(p.id).addPin('photo-2', 1, 1, '나');
    await runBackup(env, now + 2000);
    const again = new Y.Doc();
    Y.applyUpdate(again, new Uint8Array(await (await env.BACKUP.get(`rooms/${p.id}/${day}.bin`))!.arrayBuffer()));
    expect(again.getMap('pins').size).toBe(2);
  });

  it('사진은 올라올 때 백업 버킷에도, 예전에 올라온 사진은 백업이 채운다', async () => {
    const s = await login(`bk2-${crypto.randomUUID().slice(0, 8)}@example.com`);
    const p = await createProject(s);
    const bytes = new Uint8Array(300); bytes.set([137, 80, 78, 71, 7, 7]);
    const id = await sha(bytes);
    expect((await api(`/api/assets/${id}?project=${p.id}&session=${s}`, { method: 'PUT', body: bytes, headers: { 'content-type': 'image/png' } })).status).toBe(201);
    expect(await env.BACKUP.head(id)).not.toBeNull();
    // 백업 전에 올라온 사진
    const old = 'a'.repeat(32);
    await env.ASSETS.put(old, new Uint8Array([1, 2, 3]), { httpMetadata: { contentType: 'image/png' } });
    await runBackup(env, Date.now());
    const copied = await env.BACKUP.get(old);
    expect(copied && new Uint8Array(await copied.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
    expect(copied!.httpMetadata?.contentType).toBe('image/png');
  });

  it('30일 지난 자동 백업(D1·프로젝트 날짜 파일)은 지우고, 직접 저장한 버전은 남긴다', async () => {
    await env.BACKUP.put('d1/2000-01-01.json.gz', 'x');
    await env.BACKUP.put('rooms/old-project/2000-01-01.bin', 'x');
    await env.BACKUP.put('rooms/old-project/m-946684800000.bin', 'x', { customMetadata: { kind: 'manual' } });
    await runBackup(env, Date.now() + 2 * 86400000); // 정리는 하루 한 번 — 앞 테스트가 오늘 정리했으므로 이틀 뒤로
    expect(await env.BACKUP.head('d1/2000-01-01.json.gz')).toBeNull();
    expect(await env.BACKUP.head('rooms/old-project/2000-01-01.bin')).toBeNull();
    expect(await env.BACKUP.head('rooms/old-project/m-946684800000.bin')).not.toBeNull();
  });
});
