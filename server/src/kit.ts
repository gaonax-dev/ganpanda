// 채널 키트 올리기·공개 (2026-10-31 사용자: "블랜더에서 간판다로 모델 생성해서 보낼수 있는 플러그인 만들수 있나?" → "운영자만, 초안 공개 2단계로 진행해줘").
// 블렌더 애드온이 업로드 키(KIT_UPLOAD_TOKEN, wrangler secret)로 파일과 초안 목록을 올리고, 운영자(OPERATOR_EMAILS)가 앱에서 미리 본 뒤 공개·되돌리기.
// R2(ASSETS): kit/files/<sha256>.<ext>(내용 해시 — 바뀌지 않음), kit/draft.json, kit/published.json, kit/history/<판>.json
import { authenticate } from './auth';
import { json, readJson, text } from './http';
import { isOperator } from './operator';

const FILE_RE = /^([0-9a-f]{64})\.(glb|webp|png)$/;
const TYPE: Record<string, string> = { glb: 'model/gltf-binary', webp: 'image/webp', png: 'image/png' };
const MAX_FILE = 10 * 1024 * 1024;
/** 서버 판 번호는 1000부터 — 앱에 들어 있는 기본 키트(public/channel-models, 판 한 자리)와 겹치지 않게 */
const FIRST_VERSION = 1000;

interface KitMaps { letters: string; wall: string; letterIntensity: number; wallIntensity: number }
interface KitVariant { id: string; label: string; file: string; roles: string[]; lightmaps: { day: KitMaps; night: KitMaps }; size: number[]; bytes: number }
interface KitManifest { version: number; letter: string; variants: KitVariant[]; createdAt?: number; publishedAt?: number }

const uploadToken = (env: Env) => (env as unknown as { KIT_UPLOAD_TOKEN?: string }).KIT_UPLOAD_TOKEN;
const readManifest = async (env: Env, key: string): Promise<KitManifest | null> => { const o = await env.ASSETS.get(key); return o ? (o.json() as Promise<KitManifest>) : null; };
const putManifest = (env: Env, key: string, m: KitManifest) => env.ASSETS.put(key, JSON.stringify(m), { httpMetadata: { contentType: 'application/json' } });
async function sha256(buf: ArrayBuffer) { return [...new Uint8Array(await crypto.subtle.digest('SHA-256', buf))].map((b) => b.toString(16).padStart(2, '0')).join(''); }
const filesOf = (v: KitVariant) => [v.file, v.lightmaps.day.letters, v.lightmaps.day.wall, v.lightmaps.night.letters, v.lightmaps.night.wall];

async function nextVersion(env: Env) {
  const [d, p] = await Promise.all([readManifest(env, 'kit/draft.json'), readManifest(env, 'kit/published.json')]);
  return Math.max(FIRST_VERSION - 1, d?.version ?? 0, p?.version ?? 0) + 1;
}

function validManifest(b: unknown): b is { letter: string; variants: KitVariant[] } {
  const m = b as { letter?: unknown; variants?: unknown };
  if (!m || typeof m.letter !== 'string' || !Array.isArray(m.variants) || !m.variants.length || m.variants.length > 100) return false;
  return m.variants.every((v: KitVariant) => typeof v?.id === 'string' && /^[a-z0-9-]{1,40}$/.test(v.id) && typeof v.label === 'string' && Array.isArray(v.roles)
    && !!v.lightmaps?.day && !!v.lightmaps?.night && filesOf(v).every((f) => typeof f === 'string' && FILE_RE.test(f)));
}

export async function handleKit(req: Request, env: Env, pathname: string, url: URL): Promise<Response> {
  // 파일: 누구나 받기(바뀌지 않음), 올리기는 업로드 키
  const fm = pathname.match(/^\/api\/kit\/files\/([^/]+)$/);
  if (fm) {
    const name = fm[1];
    if (req.method === 'GET' || req.method === 'HEAD') {
      if (!FILE_RE.test(name)) return text('not found', 404);
      const o = req.method === 'HEAD' ? await env.ASSETS.head(`kit/files/${name}`) : await env.ASSETS.get(`kit/files/${name}`);
      if (!o) return text('not found', 404);
      const h = { 'content-type': TYPE[name.split('.').pop()!], 'cache-control': 'public, max-age=31536000, immutable' };
      return new Response(req.method === 'HEAD' ? null : (o as R2ObjectBody).body, { headers: h });
    }
    if (req.method !== 'PUT') return text('method', 405);
    const tok = uploadToken(env);
    if (!tok) return text('not found', 404);
    if (req.headers.get('authorization') !== `Bearer ${tok}`) return text('unauthorized', 401);
    const m = name.match(FILE_RE);
    if (!m) return json({ error: 'bad_name' }, 400);
    const buf = await req.arrayBuffer();
    if (buf.byteLength > MAX_FILE) return json({ error: 'too_large' }, 413);
    if ((await sha256(buf)) !== m[1]) return json({ error: 'hash_mismatch' }, 400);
    if (!(await env.ASSETS.head(`kit/files/${name}`))) await env.ASSETS.put(`kit/files/${name}`, buf, { httpMetadata: { contentType: TYPE[m[2]] } });
    return json({ ok: true });
  }
  // 초안 올리기 — 업로드 키
  if (pathname === '/api/kit/draft' && req.method === 'POST') {
    const tok = uploadToken(env);
    if (!tok) return text('not found', 404);
    if (req.headers.get('authorization') !== `Bearer ${tok}`) return text('unauthorized', 401);
    const body = await readJson<unknown>(req);
    if (!validManifest(body)) return json({ error: 'bad_manifest' }, 400);
    const missing: string[] = [];
    for (const v of body.variants) for (const f of filesOf(v)) if (!(await env.ASSETS.head(`kit/files/${f}`))) missing.push(f);
    if (missing.length) return json({ error: 'missing_files', missing }, 400);
    const m: KitManifest = { version: await nextVersion(env), letter: body.letter, variants: body.variants, createdAt: Date.now() };
    await putManifest(env, 'kit/draft.json', m);
    return json({ ok: true, version: m.version });
  }
  // 목록: 공개판은 누구나, 초안은 운영자
  if (pathname === '/api/kit/manifest' && req.method === 'GET') {
    if (url.searchParams.get('draft') === '1') {
      const me = await authenticate(req, env);
      if (!me) return text('unauthorized', 401);
      if (!isOperator(env, me.email)) return text('forbidden', 403);
      const d = await readManifest(env, 'kit/draft.json');
      return d ? json(d) : text('not found', 404);
    }
    const p = await readManifest(env, 'kit/published.json');
    return p ? new Response(JSON.stringify(p), { headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=60' } }) : text('not found', 404);
  }
  // 운영자: 공개 · 판 목록 · 되돌리기
  if (pathname === '/api/kit/publish' || pathname === '/api/kit/history' || pathname === '/api/kit/rollback') {
    const me = await authenticate(req, env);
    if (!me) return text('unauthorized', 401);
    if (!isOperator(env, me.email)) return text('forbidden', 403);
    if (pathname === '/api/kit/history' && req.method === 'GET') {
      const list = await env.ASSETS.list({ prefix: 'kit/history/' });
      const versions = list.objects.map((o) => Number(o.key.slice('kit/history/'.length).replace('.json', ''))).filter(Number.isFinite).sort((a, b) => b - a);
      const [d, p] = await Promise.all([readManifest(env, 'kit/draft.json'), readManifest(env, 'kit/published.json')]);
      return json({ versions, draft: d?.version ?? null, published: p?.version ?? null });
    }
    if (req.method !== 'POST') return text('method', 405);
    if (pathname === '/api/kit/publish') {
      const d = await readManifest(env, 'kit/draft.json');
      if (!d) return json({ error: 'no_draft' }, 404);
      const m = { ...d, publishedAt: Date.now() };
      await putManifest(env, 'kit/published.json', m);
      await putManifest(env, `kit/history/${m.version}.json`, m);
      return json({ ok: true, version: m.version });
    }
    const b = await readJson<{ version?: number }>(req);
    const old = b?.version ? await readManifest(env, `kit/history/${b.version}.json`) : null;
    if (!old) return json({ error: 'no_version' }, 404);
    // 되돌린 것도 새 판 번호로 — 기기에 저장된 카드 그림이 그 판으로 다시 그려지게
    const m: KitManifest = { ...old, version: await nextVersion(env), publishedAt: Date.now() };
    await putManifest(env, 'kit/published.json', m);
    await putManifest(env, `kit/history/${m.version}.json`, m);
    return json({ ok: true, version: m.version });
  }
  return text('not found', 404);
}
