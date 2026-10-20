// 운영자 복원 API (2026-10-21 백업 2단계). 비밀값 ADMIN_TOKEN 이 설정되어 있을 때만 — `wrangler secret put ADMIN_TOKEN`. 절차 → docs/server/backup.md
import { json, readJson, text } from './http';

/** 사진 되돌리기 한 번에 이만큼 (다음 커서를 돌려준다) */
const ASSETS_PER_CALL = 300;

export async function handleAdmin(req: Request, env: Env, pathname: string): Promise<Response> {
  const token = (env as unknown as { ADMIN_TOKEN?: string }).ADMIN_TOKEN;
  if (!token) return text('not found', 404);
  if (req.headers.get('authorization') !== `Bearer ${token}`) return text('unauthorized', 401);
  if (req.method !== 'POST') return text('method', 405);

  // 백업 목록 (2026-10-21 — wrangler 에 r2 목록 명령이 없다): prefix 예 d1/ · rooms/<프로젝트>/, cursor 로 다음
  if (pathname === '/api/admin/backups') {
    const body = await readJson<{ prefix?: string; cursor?: string }>(req).catch(() => null);
    const list = await env.BACKUP.list({ prefix: body?.prefix || undefined, cursor: body?.cursor || undefined, limit: 500, include: ['customMetadata'] });
    return json({ objects: list.objects.map((o) => ({ key: o.key, size: o.size, uploaded: o.uploaded.toISOString(), ...(o.customMetadata?.kind ? { kind: o.customMetadata.kind } : {}) })), cursor: list.truncated ? list.cursor : null });
  }

  // 프로젝트 문서 복원: key = 백업 파일(rooms/<id>/<날짜>.bin 등), mode = merge(잃어버린·빈 방에 그대로 합침) | revert(지금 내용을 백업 내용으로 바꿈, 대화는 남김)
  if (pathname === '/api/admin/restore') {
    const body = await readJson<{ project?: string; key?: string; mode?: string }>(req);
    if (!body?.project || !body.key || (body.mode !== 'merge' && body.mode !== 'revert')) return text('bad body', 400);
    const obj = await env.BACKUP.get(body.key);
    if (!obj) return text('backup not found', 404);
    const data = new Uint8Array(await obj.arrayBuffer());
    const room = env.ROOM.getByName(body.project);
    if (body.mode === 'merge') await room.seedFrom(data);
    else await room.revertTo(data, '운영자', body.key);
    return json({ ok: true });
  }

  // 사진: 백업 버킷에만 있는 파일을 사진 버킷으로 (백업 자체의 d1/·rooms/·state/ 는 빼고)
  if (pathname === '/api/admin/restore-assets') {
    const body = await readJson<{ cursor?: string }>(req).catch(() => null);
    const list = await env.BACKUP.list({ cursor: body?.cursor || undefined, limit: ASSETS_PER_CALL });
    let copied = 0;
    for (const o of list.objects) {
      if (/^(d1|rooms|state)\//.test(o.key) || (await env.ASSETS.head(o.key))) continue;
      const src = await env.BACKUP.get(o.key);
      if (!src) continue;
      await env.ASSETS.put(o.key, src.body, { httpMetadata: src.httpMetadata, customMetadata: src.customMetadata });
      copied++;
    }
    return json({ copied, cursor: list.truncated ? list.cursor : null });
  }
  return text('not found', 404);
}
