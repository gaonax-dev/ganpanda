// 사양 글 개인 사전 (2026-10-18 V1 — docs/features/spec-vocabulary.md): 퀵입력이 못 알아본 말에 사용자가 답한 뜻을 계정 규칙으로.
// GET/PUT/DELETE /api/me/spec-rules (내 규칙), GET /api/spec-rules/suggest?phrase= (같은 말에 다른 계정들이 정한 뜻을 계정 수 순으로 — 추천은 대세)
// V2 (2026-10-19): GET /api/spec-rules/defaults — 전국 기본값(대세): 말마다 계정 수 1위 뜻, 5곳부터. 바뀌려면 3곳 차 + 30일 (루프 방지 문턱). 규칙을 쓰고 지울 때마다 그 말만 다시 센다
import { authenticate } from './auth';
import { json, readJson, text } from './http';

const PHRASE_MAX = 60, ITEMS_MAX = 10, MEANING_MAX = 4000, LIMIT = 500;
const DEFAULT_MIN = 5, DEFAULT_LEAD = 3, DEFAULT_HOLD_MS = 30 * 86_400_000;
const KINDS = new Set(['product', 'bodyColor', 'channel', 'channelColor', 'led', 'size', 'thick', 'option', 'channelOption']);

function validMeaning(v: unknown): v is Record<string, unknown>[] {
  if (!Array.isArray(v) || !v.length || v.length > ITEMS_MAX) return false;
  for (const it of v) {
    if (!it || typeof it !== 'object') return false;
    const o = it as Record<string, unknown>;
    if (typeof o.kind !== 'string' || !KINDS.has(o.kind) || typeof o.label !== 'string' || o.label.length > 80) return false;
  }
  return JSON.stringify(v).length <= MEANING_MAX;
}
/** 뜻의 비교 키: 라벨을 뺀 내용 (같은 뜻을 묶어 센다) */
const keyOf = (meaning: Record<string, unknown>[]) => JSON.stringify(meaning.map(({ label: _l, ...rest }) => Object.fromEntries(Object.entries(rest).sort())));
const normPhrase = (p: unknown) => (typeof p === 'string' ? p.trim().replace(/\s+/g, ' ') : '');

/** 말 하나의 전국 기본값 다시 세기 (대세): 1위 뜻이 5곳 이상이면 기본값, 이미 있으면 다른 뜻이 3곳 이상 앞서고 30일 지났을 때만 바뀐다 */
export async function recomputeDefault(env: Env, phrase: string, now = Date.now()): Promise<void> {
  const rows = await env.DB.prepare('SELECT meaning_key, MIN(meaning) AS meaning, COUNT(DISTINCT account_id) AS n FROM spec_rules WHERE phrase = ? GROUP BY meaning_key ORDER BY n DESC, MIN(created_at) ASC LIMIT 1')
    .bind(phrase).all<{ meaning_key: string; meaning: string; n: number }>();
  const top = rows.results[0];
  const cur = await env.DB.prepare('SELECT meaning_key, count, since FROM spec_defaults WHERE phrase = ?').bind(phrase).first<{ meaning_key: string; count: number; since: number }>();
  if (!cur) {
    if (top && top.n >= DEFAULT_MIN) await env.DB.prepare('INSERT INTO spec_defaults (phrase, meaning_key, meaning, count, since) VALUES (?, ?, ?, ?, ?)').bind(phrase, top.meaning_key, top.meaning, top.n, now).run();
    return;
  }
  const curN = await env.DB.prepare('SELECT COUNT(DISTINCT account_id) AS n FROM spec_rules WHERE phrase = ? AND meaning_key = ?').bind(phrase, cur.meaning_key).first<{ n: number }>();
  if (top && top.meaning_key !== cur.meaning_key && top.n - (curN?.n ?? 0) >= DEFAULT_LEAD && now - cur.since >= DEFAULT_HOLD_MS) {
    await env.DB.prepare('UPDATE spec_defaults SET meaning_key = ?, meaning = ?, count = ?, since = ? WHERE phrase = ?').bind(top.meaning_key, top.meaning, top.n, now, phrase).run();
  } else await env.DB.prepare('UPDATE spec_defaults SET count = ? WHERE phrase = ?').bind(curN?.n ?? 0, phrase).run();
}

export async function handleSpecRules(req: Request, env: Env, pathname: string, url: URL): Promise<Response> {
  const me = await authenticate(req, env);
  if (!me) return text('unauthorized', 401);
  if (pathname === '/api/spec-rules/defaults') {
    const rows = await env.DB.prepare('SELECT phrase, meaning, count FROM spec_defaults ORDER BY count DESC LIMIT 2000').all<{ phrase: string; meaning: string; count: number }>();
    return json({ defaults: rows.results.map((r) => ({ phrase: r.phrase, meaning: JSON.parse(r.meaning), count: r.count })) });
  }
  if (pathname === '/api/spec-rules/suggest') {
    const phrase = normPhrase(url.searchParams.get('phrase'));
    if (!phrase || phrase.length > PHRASE_MAX) return text('bad phrase', 400);
    const rows = await env.DB.prepare('SELECT meaning_key, MIN(meaning) AS meaning, COUNT(DISTINCT account_id) AS n FROM spec_rules WHERE phrase = ? GROUP BY meaning_key ORDER BY n DESC, MIN(created_at) ASC LIMIT 3')
      .bind(phrase).all<{ meaning: string; n: number }>();
    return json({ suggestions: rows.results.map((r) => ({ meaning: JSON.parse(r.meaning), count: r.n })) });
  }
  if (req.method === 'GET') {
    const rows = await env.DB.prepare('SELECT phrase, meaning FROM spec_rules WHERE account_id = ? ORDER BY created_at ASC LIMIT ?').bind(me.id, LIMIT).all<{ phrase: string; meaning: string }>();
    return json({ rules: rows.results.map((r) => ({ phrase: r.phrase, meaning: JSON.parse(r.meaning) })) });
  }
  if (req.method === 'PUT') {
    const b = await readJson<{ phrase?: unknown; meaning?: unknown }>(req);
    const phrase = normPhrase(b?.phrase);
    if (!phrase || phrase.length > PHRASE_MAX || !validMeaning(b?.meaning)) return text('bad rule', 400);
    const n = await env.DB.prepare('SELECT COUNT(*) AS n FROM spec_rules WHERE account_id = ?').bind(me.id).first<{ n: number }>();
    const exists = await env.DB.prepare('SELECT 1 FROM spec_rules WHERE account_id = ? AND phrase = ?').bind(me.id, phrase).first();
    if (!exists && (n?.n ?? 0) >= LIMIT) return text('too many rules', 429);
    await env.DB.prepare('INSERT INTO spec_rules (id, account_id, phrase, meaning, meaning_key, created_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(account_id, phrase) DO UPDATE SET meaning = excluded.meaning, meaning_key = excluded.meaning_key, created_at = excluded.created_at')
      .bind(crypto.randomUUID(), me.id, phrase, JSON.stringify(b!.meaning), keyOf(b!.meaning as Record<string, unknown>[]), Date.now()).run();
    await recomputeDefault(env, phrase);
    return json({ rule: { phrase, meaning: b!.meaning } });
  }
  if (req.method === 'DELETE') {
    const b = await readJson<{ phrase?: unknown }>(req);
    const phrase = normPhrase(b?.phrase);
    if (!phrase) return text('bad rule', 400);
    await env.DB.prepare('DELETE FROM spec_rules WHERE account_id = ? AND phrase = ?').bind(me.id, phrase).run();
    await recomputeDefault(env, phrase);
    return json({ ok: true });
  }
  return text('method not allowed', 405);
}
