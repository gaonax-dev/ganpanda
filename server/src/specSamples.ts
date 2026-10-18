// 사양 글 표본 (2026-10-18 사용자: "메모로 전환하는 글만 모아서 ai로 전환하는 방식으로"): 퀵입력이 못 알아본 글(요청사항으로 넘어간 부분)을
// 사용자가 보내면 쌓아 두고, 개발 때 파서 어휘·테스트 말뭉치로 쓴다. 로그인한 계정만, 하루 200개까지. 읽기는 wrangler d1 (server `npm run samples`)
import { authenticate } from './auth';
import { json, readJson, text } from './http';

const MAX_TEXT = 300;
const DAILY_MAX = 200;

export async function handleSpecSamples(req: Request, env: Env): Promise<Response> {
  if (req.method !== 'POST') return text('method not allowed', 405);
  const me = await authenticate(req, env);
  if (!me) return text('unauthorized', 401);
  const b = await readJson<{ text?: unknown; leftover?: unknown; recognized?: unknown; productId?: unknown }>(req);
  const t = typeof b?.text === 'string' ? b.text.trim() : '';
  const left = typeof b?.leftover === 'string' ? b.leftover.trim() : '';
  if (!t || !left || t.length > MAX_TEXT || left.length > MAX_TEXT) return text('bad sample', 400);
  const recognized = Array.isArray(b?.recognized) && b.recognized.length <= 30 && b.recognized.every((s) => typeof s === 'string' && s.length <= 80) ? (b.recognized as string[]) : null;
  if (b?.recognized !== undefined && !recognized) return text('bad sample', 400);
  const productId = typeof b?.productId === 'string' && b.productId.length <= 40 ? b.productId : null;
  const since = Date.now() - 86_400_000;
  const n = await env.DB.prepare('SELECT COUNT(*) AS n FROM spec_samples WHERE account_id = ? AND created_at > ?').bind(me.id, since).first<{ n: number }>();
  if ((n?.n ?? 0) >= DAILY_MAX) return text('too many', 429);
  const id = crypto.randomUUID();
  await env.DB.prepare('INSERT INTO spec_samples (id, account_id, product_id, text, leftover, recognized, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(id, me.id, productId, t, left, recognized ? JSON.stringify(recognized) : null, Date.now()).run();
  return json({ id }, 201);
}
