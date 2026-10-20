// 복원 (2026-10-21 백업 2단계 — 운영자 복원 절차와 시험 복원). 절차 문서 → docs/server/backup.md
import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:test';
import * as Y from 'yjs';
import { runBackup, dayKey } from '../src/backup';
import { sqlFromDump } from '../src/restoreSql';
import { api, createProject, login } from './helpers';

const admin = (path: string, body: unknown, token = 'test-admin') => api(path, { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` } });
const docOf = async (project: string) => { const d = new Y.Doc(); Y.applyUpdate(d, await env.ROOM.getByName(project).exportState()); return d; };

describe('운영자 복원 (ADMIN_TOKEN)', () => {
  it('토큰이 없거나 틀리면 거절', async () => {
    expect((await admin('/api/admin/restore', {}, 'wrong')).status).toBe(401);
  });

  it('백업 목록 보기 — prefix 로 (wrangler 에 r2 목록 명령이 없어서, 2026-10-21)', async () => {
    await env.BACKUP.put('d1/2026-01-02.json.gz', 'x');
    const r = await admin('/api/admin/backups', { prefix: 'd1/' });
    expect(r.status).toBe(200);
    const j = await r.json<{ objects: { key: string; size: number; uploaded: string }[]; cursor: string | null }>();
    expect(j.objects.some((o) => o.key === 'd1/2026-01-02.json.gz' && o.size === 1)).toBe(true);
  });

  it('잃어버린 문서: 백업을 빈 방에 그대로 합친다(merge) — 다른 프로젝트 자리로도', async () => {
    const s = await login(`rs-${crypto.randomUUID().slice(0, 8)}@example.com`);
    const p = await createProject(s);
    await env.ROOM.getByName(p.id).addPin('ph', 1, 2, '나');
    await runBackup(env as unknown as Env, Date.now());
    const empty = await createProject(s, '복원 자리');
    const r = await admin('/api/admin/restore', { project: empty.id, key: `rooms/${p.id}/${dayKey(Date.now())}.bin`, mode: 'merge' });
    expect(r.status).toBe(200);
    expect([...(await docOf(empty.id)).getMap<Y.Map<unknown>>('pins').values()].map((m) => m.get('photoId'))).toEqual(['ph']);
  });

  it('되돌리기(revert): 사진·사인물·말풍선·설정을 백업 그대로, 대화는 남긴다 — 되돌린 사람·시각을 설정에 남긴다', async () => {
    const s = await login(`rv-${crypto.randomUUID().slice(0, 8)}@example.com`);
    const p = await createProject(s);
    const room = env.ROOM.getByName(p.id);
    await room.addPin('before', 1, 1, '나');
    await runBackup(env as unknown as Env, Date.now());
    await room.addPin('after', 2, 2, '나');
    await room.addMessage('project', '나', '백업 뒤 대화', 'chat');
    const r = await admin('/api/admin/restore', { project: p.id, key: `rooms/${p.id}/${dayKey(Date.now())}.bin`, mode: 'revert' });
    expect(r.status).toBe(200);
    const d = await docOf(p.id);
    expect([...d.getMap<Y.Map<unknown>>('pins').values()].map((m) => m.get('photoId'))).toEqual(['before']);
    expect(d.getArray<{ text: string }>('messages').toArray().map((m) => m.text)).toContain('백업 뒤 대화');
    expect(d.getMap('settings').get('restored')).toMatchObject({ by: '운영자' });
  });

  it('사진: 백업에만 있는 파일을 사진 버킷으로 되돌린다 (차례로, 다음 커서를 돌려줌)', async () => {
    const id = 'b'.repeat(32);
    await env.BACKUP.put(id, new Uint8Array([9, 9]), { httpMetadata: { contentType: 'image/png' } });
    const r = await admin('/api/admin/restore-assets', {});
    expect(r.status).toBe(200);
    expect((await r.json<{ copied: number }>()).copied).toBeGreaterThanOrEqual(1);
    expect(new Uint8Array(await (await env.ASSETS.get(id))!.arrayBuffer())).toEqual(new Uint8Array([9, 9]));
  });
});

describe('D1 백업 → SQL (scripts/d1-restore.ts 가 씀)', () => {
  it('표마다 INSERT OR REPLACE, 문자열 따옴표·null·숫자', () => {
    const sql = sqlFromDump({ at: 0, tables: { projects: [{ id: 'p1', name: "간'판", paid_amount: 0, group_id: null }] } });
    expect(sql).toBe(`INSERT OR REPLACE INTO "projects" ("id","name","paid_amount","group_id") VALUES ('p1','간''판',0,NULL);\n`);
  });
});
