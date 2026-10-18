// 세트 라이브러리 (2026-10-19 레이어 구조 4단계, docs/architecture/composition-layers.md): 레이어 묶음을 계정에 저장해 다른 사인물에 비율 맞춰 넣는다. 색 라이브러리와 같은 방식(JSON 그대로, 형식·크기만 검사)
import { authenticate } from './auth';
import { json, readJson, text } from './http';

const MAX_SETS = 100;
const MAX_BYTES = 400_000;

export function validSets(v: unknown): boolean {
  if (!v || typeof v !== 'object') return false;
  const lib = v as { version?: unknown; sets?: unknown };
  if (lib.version !== 1 || !Array.isArray(lib.sets) || lib.sets.length > MAX_SETS) return false;
  for (const raw of lib.sets) {
    if (!raw || typeof raw !== 'object') return false;
    const s = raw as Record<string, unknown>;
    if (typeof s.id !== 'string' || !s.id || s.id.length > 40) return false;
    if (typeof s.name !== 'string' || !s.name.trim() || s.name.length > 40) return false;
    const f = s.frame as Record<string, unknown> | undefined;
    if (!f || typeof f.w !== 'number' || typeof f.h !== 'number') return false;
    if (!Array.isArray(s.layers) || !s.layers.length) return false;
    if (s.thumb !== undefined && (typeof s.thumb !== 'string' || s.thumb.length > 20_000)) return false;
    if (typeof s.createdAt !== 'number') return false;
  }
  return JSON.stringify(v).length <= MAX_BYTES;
}

export async function handleSets(req: Request, env: Env): Promise<Response> {
  const me = await authenticate(req, env);
  if (!me) return text('unauthorized', 401);
  if (req.method === 'GET') {
    const row = await env.DB.prepare('SELECT sets FROM accounts WHERE id = ?').bind(me.id).first<{ sets: string | null }>();
    return json({ sets: row?.sets ? JSON.parse(row.sets) : null });
  }
  if (req.method === 'PUT') {
    const body = await readJson<{ sets?: unknown }>(req);
    if (!body || !validSets(body.sets)) return text('bad sets', 400);
    await env.DB.prepare('UPDATE accounts SET sets = ? WHERE id = ?').bind(JSON.stringify(body.sets), me.id).run();
    return json({ sets: body.sets });
  }
  return text('method not allowed', 405);
}
