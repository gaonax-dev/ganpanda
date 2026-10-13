// 계정 기본 단가표 (2-1): JSON 그대로 저장. 값의 의미는 앱이 안다 — 여기서는 형식·크기만 검사한다.
import { authenticate } from './auth';
import { json, readJson, text } from './http';

const MAX_KEYS = 100;
const MAX_BYTES = 20_000;
const ROUNDINGS = new Set([1, 10, 100, 1000, 10000]);

function validPrices(v: unknown): boolean {
  if (!v || typeof v !== 'object') return false;
  const p = v as Record<string, unknown>;
  if (p.version !== 1) return false;
  const numMap = (m: unknown) => {
    if (m === undefined) return true;
    if (!m || typeof m !== 'object') return false;
    const entries = Object.entries(m as Record<string, unknown>);
    return entries.length <= MAX_KEYS && entries.every(([, n]) => typeof n === 'number' && isFinite(n) && n >= 0);
  };
  if (!numMap(p.products) || !numMap(p.sheets)) return false;
  for (const k of ['install', 'minimum']) if (p[k] !== undefined && !(typeof p[k] === 'number' && isFinite(p[k] as number) && (p[k] as number) >= 0)) return false;
  if (p.rounding !== undefined && !ROUNDINGS.has(p.rounding as number)) return false;
  if (p.vatIncluded !== undefined && typeof p.vatIncluded !== 'boolean') return false;
  return JSON.stringify(v).length <= MAX_BYTES;
}

export async function handlePrices(req: Request, env: Env): Promise<Response> {
  const me = await authenticate(req, env);
  if (!me) return text('unauthorized', 401);
  if (req.method === 'GET') {
    const row = await env.DB.prepare('SELECT prices FROM accounts WHERE id = ?').bind(me.id).first<{ prices: string | null }>();
    return json({ prices: row?.prices ? JSON.parse(row.prices) : null });
  }
  if (req.method === 'PUT') {
    const body = await readJson<{ prices?: unknown }>(req);
    if (!body || !validPrices(body.prices)) return text('bad prices', 400);
    await env.DB.prepare('UPDATE accounts SET prices = ? WHERE id = ?').bind(JSON.stringify(body.prices), me.id).run();
    return json({ prices: body.prices });
  }
  return text('method not allowed', 405);
}
