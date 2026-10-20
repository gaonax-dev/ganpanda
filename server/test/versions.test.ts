// 사용자 버전 기록·되돌리기 (2026-10-21 백업 3단계, 유료): 무료 없음, 베이직 7일, 프로 30일 + 직접 저장한 버전 계속
import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:test';
import * as Y from 'yjs';
import { api, createInvite, createProject, get, login } from './helpers';

const call = (path: string, session: string, body?: unknown) => api(path, { method: body === undefined ? 'GET' : 'POST', ...(body === undefined ? {} : { body: JSON.stringify(body) }), headers: { 'content-type': 'application/json', authorization: `Bearer ${session}` } });
const pinsOf = async (project: string) => { const d = new Y.Doc(); Y.applyUpdate(d, await env.ROOM.getByName(project).exportState()); return [...d.getMap<Y.Map<unknown>>('pins').values()].map((m) => m.get('photoId')); };
async function owner(plan: 'free' | 'basic' | 'pro') {
  const s = await login(`ver-${crypto.randomUUID().slice(0, 8)}@example.com`);
  const id = (await (await get('/api/me', s)).json<{ account: { id: string } }>()).account.id;
  await env.DB.prepare('UPDATE accounts SET plan = ? WHERE id = ?').bind(plan, id).run();
  return s;
}

describe('버전 기록 (유료)', () => {
  it('무료는 402 — 요금제 안내', async () => {
    const s = await owner('free');
    const p = await createProject(s);
    const r = await call(`/api/projects/${p.id}/versions`, s);
    expect(r.status).toBe(402);
    expect(await r.json()).toMatchObject({ error: 'plan_required' });
  });

  it('지금 상태 저장 → 목록 → 바꾼 뒤 되돌리기(되돌리기 직전도 버전으로 남음) → 대화는 그대로', async () => {
    const s = await owner('basic');
    const p = await createProject(s);
    const room = env.ROOM.getByName(p.id);
    await room.addPin('first', 1, 1, '나');
    const saved = await call(`/api/projects/${p.id}/versions`, s, { label: '시안 1' });
    expect(saved.status).toBe(201);
    const v = (await saved.json<{ version: { key: string; kind: string; label: string } }>()).version;
    expect(v).toMatchObject({ kind: 'manual', label: '시안 1' });
    await room.addPin('second', 2, 2, '나');
    await room.addMessage('project', '나', '대화', 'chat');
    expect((await call(`/api/projects/${p.id}/versions/restore`, s, { key: v.key })).status).toBe(200);
    expect(await pinsOf(p.id)).toEqual(['first']);
    const list = (await (await call(`/api/projects/${p.id}/versions`, s)).json<{ versions: { kind: string; label?: string }[] }>()).versions;
    expect(list.map((x) => x.kind).sort()).toEqual(['before', 'manual']);
    // 되돌리기 직전 버전으로 다시 되돌리면 두 번째 핀도 돌아온다
    const before = (await (await call(`/api/projects/${p.id}/versions`, s)).json<{ versions: { key: string; kind: string }[] }>()).versions.find((x) => x.kind === 'before')!;
    await call(`/api/projects/${p.id}/versions/restore`, s, { key: before.key });
    expect((await pinsOf(p.id)).sort()).toEqual(['first', 'second']);
  });

  it('보관 기간: 베이직은 7일 안의 것만 보이고 되돌릴 수 있다, 프로는 30일 + 직접 저장은 계속', async () => {
    const s = await owner('basic');
    const p = await createProject(s);
    const old = Date.now() - 10 * 86400000;
    await env.BACKUP.put(`rooms/${p.id}/m-${old}.bin`, Y.encodeStateAsUpdate(new Y.Doc()), { customMetadata: { kind: 'manual', at: String(old) } });
    await env.BACKUP.put(`rooms/${p.id}/${new Date(old).toISOString().slice(0, 10)}.bin`, Y.encodeStateAsUpdate(new Y.Doc()), { customMetadata: { kind: 'auto', at: String(old) } });
    expect((await (await call(`/api/projects/${p.id}/versions`, s)).json<{ versions: unknown[] }>()).versions).toHaveLength(0);
    expect((await call(`/api/projects/${p.id}/versions/restore`, s, { key: `rooms/${p.id}/m-${old}.bin` })).status).toBe(403);
    await env.DB.prepare("UPDATE accounts SET plan = 'pro' WHERE id = (SELECT owner_id FROM projects WHERE id = ?)").bind(p.id).run();
    expect((await (await call(`/api/projects/${p.id}/versions`, s)).json<{ versions: unknown[] }>()).versions).toHaveLength(2);
  });

  it('새 프로젝트로 꺼내기: 지금 작업은 두고 그 버전으로 새 프로젝트를 만든다 (소유자)', async () => {
    const s = await owner('pro');
    const p = await createProject(s, '본 매장');
    await env.ROOM.getByName(p.id).addPin('kept', 1, 1, '나');
    const v = (await (await call(`/api/projects/${p.id}/versions`, s, {})).json<{ version: { key: string } }>()).version;
    await env.ROOM.getByName(p.id).addPin('later', 1, 1, '나');
    const r = await call(`/api/projects/${p.id}/versions/copy`, s, { key: v.key });
    expect(r.status).toBe(201);
    const np = (await r.json<{ project: { id: string; name: string } }>()).project;
    expect(np.name).toContain('본 매장');
    expect(await pinsOf(np.id)).toEqual(['kept']);
    expect((await pinsOf(p.id)).sort()).toEqual(['kept', 'later']);
  });

  it('보기 초대(고객)는 버전을 볼 수 없다', async () => {
    const s = await owner('pro');
    const p = await createProject(s);
    const vw = await createInvite(s, p.id, 'viewer');
    expect((await api(`/api/projects/${p.id}/versions?invite=${vw.token}`)).status).toBe(403);
  });
});
