// 계정 색 라이브러리 (2026-10-17 "색상관리가 중요하다 … 라이브러리에 저장해서 꺼내쓴다"): JSON 그대로 저장. 형식·크기만 검사한다
import { authenticate } from './auth';
import { json, readJson, text } from './http';

const KINDS = new Set(['페인트', '시트', '천', '필름']);
const MAX_CARDS = 300;
const MAX_BYTES = 60_000;
const HEX = /^#[0-9a-f]{6}$/i;

export function validColors(v: unknown): boolean {
  if (!v || typeof v !== 'object') return false;
  const lib = v as { version?: unknown; colors?: unknown };
  if (lib.version !== 1 || !Array.isArray(lib.colors) || lib.colors.length > MAX_CARDS) return false;
  for (const raw of lib.colors) {
    if (!raw || typeof raw !== 'object') return false;
    const c = raw as Record<string, unknown>;
    if (typeof c.id !== 'string' || !c.id || c.id.length > 40) return false;
    if (!KINDS.has(c.kind as string)) return false;
    if (typeof c.name !== 'string' || !c.name.trim() || c.name.length > 40) return false;
    if (typeof c.hex !== 'string' || !HEX.test(c.hex)) return false;
    for (const k of ['supplier', 'code']) if (c[k] !== undefined && (typeof c[k] !== 'string' || (c[k] as string).length > 60)) return false;
    if (typeof c.createdAt !== 'number') return false;
  }
  return JSON.stringify(v).length <= MAX_BYTES;
}

export async function handleColors(req: Request, env: Env): Promise<Response> {
  const me = await authenticate(req, env);
  if (!me) return text('unauthorized', 401);
  if (req.method === 'GET') {
    const row = await env.DB.prepare('SELECT colors FROM accounts WHERE id = ?').bind(me.id).first<{ colors: string | null }>();
    return json({ colors: row?.colors ? JSON.parse(row.colors) : null });
  }
  if (req.method === 'PUT') {
    const body = await readJson<{ colors?: unknown }>(req);
    if (!body || !validColors(body.colors)) return text('bad colors', 400);
    await env.DB.prepare('UPDATE accounts SET colors = ? WHERE id = ?').bind(JSON.stringify(body.colors), me.id).run();
    return json({ colors: body.colors });
  }
  return text('method not allowed', 405);
}
