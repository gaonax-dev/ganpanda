// 사용자 버전 기록·되돌리기 (2026-10-21 백업 3단계, 유료 — 사용자: "사용자가 직접 이전 상태로 돌리는 것도 유료에 도입하면 어떨까?" → "그 순서대로 진행해줘").
// 버전 = 백업 버킷의 rooms/<프로젝트>/ 파일: <날짜>.bin = 매시간 자동(그날 마지막), m-<시각>.bin = 직접 저장, r-<시각>.bin = 되돌리기 직전 저장.
// 보이는 기간: 무료 없음(402), 베이직 7일, 프로 30일 + 직접 저장은 계속 (plans.ts versionDays·manualForever). 보기 초대(고객)는 403.
import { json, readJson, text } from './http';
import { planOf } from './plans';
import { newRoomId, resolveAccess } from './projects';

const DAY = 24 * 3600 * 1000;
export interface Version { key: string; kind: 'auto' | 'manual' | 'before'; at: number; label?: string; by?: string }

function versionOf(key: string, meta: Record<string, string> | undefined, uploaded: Date): Version | null {
  const name = key.split('/').pop()!;
  const m = name.match(/^(m|r)-(\d+)\.bin$/);
  if (m) return { key, kind: m[1] === 'm' ? 'manual' : 'before', at: Number(meta?.at ?? m[2]), ...(meta?.label ? { label: meta.label } : {}), ...(meta?.by ? { by: meta.by } : {}) };
  if (/^\d{4}-\d{2}-\d{2}\.bin$/.test(name)) return { key, kind: 'auto', at: Number(meta?.at ?? uploaded.getTime()) };
  return null;
}

async function listVersions(env: Env, projectId: string): Promise<Version[]> {
  const out: Version[] = [];
  let cursor: string | undefined;
  do {
    const list = await env.BACKUP.list({ prefix: `rooms/${projectId}/`, cursor, include: ['customMetadata'] });
    for (const o of list.objects) { const v = versionOf(o.key, o.customMetadata, o.uploaded); if (v) out.push(v); }
    cursor = list.truncated ? list.cursor : undefined;
  } while (cursor);
  return out.sort((a, b) => b.at - a.at);
}

/** 되돌린 버전이 쓰는 사진이 사진 버킷에 없으면 백업에서 되살린다 (에셋 ID = 32자리 16진수) */
async function restoreAssetsOf(env: Env, data: Uint8Array) {
  const ids = new Set(new TextDecoder('latin1').decode(data).match(/[0-9a-f]{32}/g) ?? []);
  for (const id of ids) {
    if (await env.ASSETS.head(id)) continue;
    const src = await env.BACKUP.get(id);
    if (src) await env.ASSETS.put(id, src.body, { httpMetadata: src.httpMetadata });
  }
}

export async function handleVersions(req: Request, env: Env, pathname: string, url: URL): Promise<Response> {
  const m = pathname.match(/^\/api\/projects\/([^/]+)\/versions(?:\/(restore|copy))?$/);
  if (!m) return text('not found', 404);
  const [, projectId, action] = m;
  const access = await resolveAccess(req, env, projectId, url.searchParams.get('invite'));
  if (typeof access === 'number') return text('no access', access);
  if (access.role === 'viewer') return text('forbidden', 403);
  const owner = await env.DB.prepare('SELECT plan FROM accounts WHERE id = ?').bind(access.project.owner_id).first<{ plan: string }>();
  const plan = planOf(owner?.plan ?? 'free');
  if (!plan.versionDays) return json({ error: 'plan_required' }, 402);
  const now = Date.now();
  const visible = (v: Version) => v.at >= now - plan.versionDays * DAY || (v.kind === 'manual' && plan.manualForever);
  const by = access.account?.name || access.account?.email || '멤버';
  const room = env.ROOM.getByName(projectId);

  if (!action && req.method === 'GET') return json({ versions: (await listVersions(env, projectId)).filter(visible) });
  if (!action && req.method === 'POST') {
    const body = await readJson<{ label?: string }>(req).catch(() => null);
    const label = typeof body?.label === 'string' ? body.label.trim().slice(0, 60) : '';
    const key = `rooms/${projectId}/m-${now}.bin`;
    await env.BACKUP.put(key, await room.exportState(), { customMetadata: { kind: 'manual', at: String(now), by, ...(label ? { label } : {}) } });
    return json({ version: { key, kind: 'manual', at: now, by, ...(label ? { label } : {}) } satisfies Version }, 201);
  }
  if (req.method !== 'POST') return text('method', 405);
  const body = await readJson<{ key?: string }>(req);
  const key = typeof body?.key === 'string' ? body.key : '';
  if (!key.startsWith(`rooms/${projectId}/`)) return text('bad key', 400);
  const obj = await env.BACKUP.get(key);
  const v = obj && versionOf(key, obj.customMetadata, obj.uploaded);
  if (!obj || !v) return text('version not found', 404);
  if (!visible(v)) return text('outside plan period', 403);
  const data = new Uint8Array(await obj.arrayBuffer());

  if (action === 'restore') {
    // 되돌리기 직전 상태를 먼저 남긴다 → 되돌린 것도 다시 되돌릴 수 있다
    await env.BACKUP.put(`rooms/${projectId}/r-${now}.bin`, await room.exportState(), { customMetadata: { kind: 'before', at: String(now), by, label: `되돌리기 전` } });
    await restoreAssetsOf(env, data);
    await room.revertTo(data, by, key);
    return json({ ok: true });
  }
  // 새 프로젝트로 꺼내기 — 소유자만 (새 프로젝트도 소유자 것)
  if (access.role !== 'owner') return text('owner only', 403);
  const d = new Date(v.at + 9 * 3600 * 1000).toISOString().slice(0, 16).replace('T', ' ');
  const p = { id: newRoomId(), owner_id: access.project.owner_id, name: `${access.project.name} (${d} 버전)`.slice(0, 80), created_at: now };
  await env.DB.prepare('INSERT INTO projects (id, owner_id, name, created_at) VALUES (?, ?, ?, ?)').bind(p.id, p.owner_id, p.name, p.created_at).run();
  await restoreAssetsOf(env, data);
  await env.ROOM.getByName(p.id).seedFrom(data);
  return json({ project: { id: p.id, name: p.name } }, 201);
}
