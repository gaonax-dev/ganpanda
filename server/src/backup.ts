// 백업 (2026-10-21 사용자: "우리는 백업이 되고 있는가?" → "클라우드플레어에 백업하는게 좋을 것 같아" → "그 순서대로 진행해줘").
// 백업 버킷(BACKUP, R2 `ganpanda-backup` — 사진 버킷과 따로)에 매시간(cron) 조금씩:
//  · D1: 하루 한 번 전체 표를 JSON(gzip) — d1/<YYYY-MM-DD>.json.gz. 로그인 세션·토큰처럼 잠깐 쓰는 표는 뺀다
//  · 프로젝트 문서(Room): 마지막 백업 뒤 바뀐 것만 그날 날짜 파일로 — rooms/<프로젝트>/<YYYY-MM-DD>.bin (Yjs 전체 상태). 한 번에 ROOMS_PER_RUN 개씩 차례로
//  · 사진: 올라올 때 index.ts 가 함께 넣고, 예전에 올라온 것은 여기서 ASSETS_PER_RUN 개씩 채운다(같은 키 = 같은 내용)
//  · 정리: 하루 한 번, 30일 지난 날짜 파일(D1·프로젝트)과 되돌리기 직전 저장(r-)을 지운다. 사용자가 직접 저장한 버전(m-)은 남긴다
// 복원 절차 → docs/server/backup.md

export const RETAIN_DAYS = 30;
const ROOMS_PER_RUN = 200;
const ASSETS_PER_RUN = 200;
/** 백업하지 않는 D1 표: 잠깐 쓰는 로그인 정보 (복원 뒤엔 다시 로그인하면 된다) */
const SKIP_TABLES = new Set(['sessions', 'login_tokens', 'oauth_states', 'login_failures', 'd1_migrations']);
const DAY = 24 * 3600 * 1000;

/** UTC 날짜 YYYY-MM-DD */
export const dayKey = (t: number) => new Date(t).toISOString().slice(0, 10);

async function gzip(text: string): Promise<ArrayBuffer> {
  return new Response(new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer();
}

/** D1 전체(빼는 표 제외)를 하루 한 번 — 이미 오늘 것이 있으면 건너뛴다 */
async function backupD1(env: Env, now: number): Promise<void> {
  const key = `d1/${dayKey(now)}.json.gz`;
  if (await env.BACKUP.head(key)) return;
  const names = (await env.DB.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'").all<{ name: string }>()).results
    .map((r) => r.name).filter((n) => !SKIP_TABLES.has(n));
  const tables: Record<string, unknown[]> = {};
  for (const n of names) tables[n] = (await env.DB.prepare(`SELECT * FROM "${n.replace(/"/g, '')}"`).all()).results;
  await env.BACKUP.put(key, await gzip(JSON.stringify({ at: now, tables })), { httpMetadata: { contentType: 'application/json', contentEncoding: 'gzip' } });
}

/** 프로젝트 문서: 차례(커서)대로 ROOMS_PER_RUN 개 — 마지막 백업 뒤 바뀐 것만 그날 날짜 파일로 */
async function backupRooms(env: Env, now: number) {
  const cursorKey = 'state/rooms-cursor';
  const after = (await (await env.BACKUP.get(cursorKey))?.text()) ?? '';
  const rows = (await env.DB.prepare('SELECT id FROM projects WHERE id > ? ORDER BY id LIMIT ?').bind(after, ROOMS_PER_RUN).all<{ id: string }>()).results;
  for (const { id } of rows) {
    const room = env.ROOM.getByName(id);
    const s = await room.backupState();
    if (!s) continue;
    await env.BACKUP.put(`rooms/${id}/${dayKey(now)}.bin`, s.data, { customMetadata: { kind: 'auto', at: String(now), changedAt: String(s.changedAt) } });
    await room.markBackedUp(s.changedAt);
  }
  // 끝까지 돌았으면 처음부터
  await env.BACKUP.put(cursorKey, rows.length < ROOMS_PER_RUN ? '' : rows[rows.length - 1].id);
}

/** 예전에 올라온 사진: ASSETS 를 차례(커서)대로 훑어 백업에 없는 것을 복사. AI 모델 파일(models/)은 다시 올리면 되므로 뺀다 */
async function backupAssets(env: Env) {
  const cursorKey = 'state/assets-cursor';
  const cursor = (await (await env.BACKUP.get(cursorKey))?.text()) || undefined;
  const list = await env.ASSETS.list({ cursor, limit: ASSETS_PER_RUN });
  for (const o of list.objects) {
    if (o.key.startsWith('models/') || (await env.BACKUP.head(o.key))) continue;
    const src = await env.ASSETS.get(o.key);
    if (src) await env.BACKUP.put(o.key, src.body, { httpMetadata: src.httpMetadata, customMetadata: src.customMetadata });
  }
  await env.BACKUP.put(cursorKey, list.truncated ? list.cursor : '');
}

/** 30일 지난 날짜 파일(d1/·rooms/<id>/<날짜>.bin)과 되돌리기 직전 저장(rooms/<id>/r-<시각>.bin) 정리. 직접 저장(m-)은 남긴다 */
async function purge(env: Env, now: number) {
  const cut = now - RETAIN_DAYS * DAY;
  for (const prefix of ['d1/', 'rooms/']) {
    let cursor: string | undefined;
    do {
      const list = await env.BACKUP.list({ prefix, cursor });
      const old = list.objects.map((o) => o.key).filter((k) => {
        const name = k.split('/').pop()!;
        const date = name.match(/^(\d{4}-\d{2}-\d{2})\./)?.[1];
        if (date) return Date.parse(date) < cut;
        const r = name.match(/^r-(\d+)\./)?.[1];
        return r ? Number(r) < cut : false;
      });
      if (old.length) await env.BACKUP.delete(old);
      cursor = list.truncated ? list.cursor : undefined;
    } while (cursor);
  }
}

/** 예약 작업 한 번 (매시간) */
export async function runBackup(env: Env, now = Date.now()) {
  await backupD1(env, now);
  await backupRooms(env, now);
  await backupAssets(env);
  // 정리는 하루 한 번 (표시 파일)
  const mark = `state/purged/${dayKey(now)}`;
  if (!(await env.BACKUP.head(mark))) { await purge(env, now); await env.BACKUP.put(mark, String(now)); }
}
