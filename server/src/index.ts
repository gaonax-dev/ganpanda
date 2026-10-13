// 간판다 동기화 서버: /api/rooms/:room/ws (실시간 협업), /api/assets/:id (사진·디자인 파일)
export { Room } from './room';

const ROOM_RE = /^[A-Za-z0-9_-]{6,64}$/;
const ASSET_RE = /^[0-9a-f]{32}$/;
const MAX_ASSET = 25 * 1024 * 1024;
const ASSET_TYPES = new Set([
  'image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml', 'image/heic', 'application/pdf',
]);

const CORS: Record<string, string> = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, HEAD, PUT, OPTIONS',
  'access-control-allow-headers': 'content-type',
  'access-control-max-age': '86400',
};

function withCors(res: Response): Response {
  if (res.status === 101) return res;
  const out = new Response(res.body, res);
  for (const [k, v] of Object.entries(CORS)) out.headers.set(k, v);
  return out;
}

const text = (body: string, status: number) => new Response(body, { status });

/** 에셋 ID = 내용 SHA-256 앞 16바이트(hex) — 클라이언트 IndexedDB 키와 동일 */
async function assetId(bytes: ArrayBuffer): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(d)].slice(0, 16).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function handleAsset(req: Request, env: Env, id: string): Promise<Response> {
  if (!ASSET_RE.test(id)) return text('bad asset id', 400);
  if (req.method === 'PUT') {
    const type = (req.headers.get('content-type') ?? '').split(';')[0].trim();
    if (!ASSET_TYPES.has(type)) return text('unsupported type', 415);
    if (Number(req.headers.get('content-length') ?? 0) > MAX_ASSET) return text('too large', 413);
    const bytes = await req.arrayBuffer();
    if (bytes.byteLength > MAX_ASSET) return text('too large', 413);
    if ((await assetId(bytes)) !== id) return text('hash mismatch', 400);
    await env.ASSETS.put(id, bytes, { httpMetadata: { contentType: type } });
    return new Response(null, { status: 201 });
  }
  if (req.method === 'GET' || req.method === 'HEAD') {
    const obj = req.method === 'HEAD' ? await env.ASSETS.head(id) : await env.ASSETS.get(id);
    if (!obj) return text('not found', 404);
    const headers = new Headers({
      'content-type': obj.httpMetadata?.contentType ?? 'application/octet-stream',
      'content-length': String(obj.size),
      'cache-control': 'public, max-age=31536000, immutable',
      'x-content-type-options': 'nosniff',
      // SVG·PDF 안의 스크립트가 실행되지 않도록 격리
      'content-security-policy': "default-src 'none'; img-src data:; style-src 'unsafe-inline'; sandbox",
    });
    return new Response(req.method === 'HEAD' ? null : (obj as R2ObjectBody).body, { headers });
  }
  return text('method not allowed', 405);
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    const { pathname } = new URL(req.url);

    if (pathname === '/api/health') return withCors(Response.json({ ok: true }));

    const room = pathname.match(/^\/api\/rooms\/([^/]+)\/ws$/);
    if (room) {
      const name = decodeURIComponent(room[1]);
      if (!ROOM_RE.test(name)) return withCors(text('bad room', 400));
      if (req.headers.get('Upgrade') !== 'websocket') return withCors(text('expected websocket', 426));
      return env.ROOM.getByName(name).fetch(req);
    }

    const asset = pathname.match(/^\/api\/assets\/([^/]+)$/);
    if (asset) return withCors(await handleAsset(req, env, asset[1]));

    return withCors(text('not found', 404));
  },
} satisfies ExportedHandler<Env>;
