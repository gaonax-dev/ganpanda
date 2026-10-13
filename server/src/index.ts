// 간판다 동기화 서버: /api/rooms/:room/ws (실시간 협업), /api/assets/:id (사진·디자인 파일)
export { Room } from './room';
import { handleAuth } from './auth';
import { handleProjects, resolveAccess, type Role } from './projects';
import { json, readJson, text } from './http';

const ROOM_RE = /^[A-Za-z0-9_-]{6,64}$/;
const ASSET_RE = /^[0-9a-f]{32}$/;
const MAX_ASSET = 25 * 1024 * 1024;
const ASSET_TYPES = new Set([
  'image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml', 'image/heic', 'application/pdf',
]);

const CORS: Record<string, string> = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, HEAD, PUT, POST, PATCH, DELETE, OPTIONS',
  'access-control-allow-headers': 'content-type, authorization',
  'access-control-max-age': '86400',
};

function withCors(res: Response): Response {
  if (res.status === 101) return res;
  const out = new Response(res.body, res);
  for (const [k, v] of Object.entries(CORS)) out.headers.set(k, v);
  return out;
}


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

/** ?session= 쿼리를 Authorization 헤더로 옮긴 요청 (WebSocket 용) */
function withSessionParam(req: Request, url: URL): Request {
  const s = url.searchParams.get('session');
  if (!s || req.headers.has('authorization')) return req;
  const r = new Request(req, { headers: new Headers(req.headers) });
  r.headers.set('authorization', `Bearer ${s}`);
  return r;
}

const MESSAGE_KINDS = new Set(['chat', 'comment']);
const MESSAGE_MAX = 2000;

/** viewer 는 문서를 편집할 수 없으므로 대화는 서버가 대신 기록한다 (다른 역할도 사용 가능) */
async function postMessage(req: Request, env: Env, room: string, _role: Role): Promise<Response> {
  if (req.method !== 'POST') return text('method not allowed', 405);
  const b = await readJson<{ objectId?: string; author?: string; text?: string; kind?: string }>(req);
  const txt = typeof b?.text === 'string' ? b.text.trim().slice(0, MESSAGE_MAX) : '';
  const objectId = typeof b?.objectId === 'string' ? b.objectId : '';
  const author = typeof b?.author === 'string' ? b.author.trim().slice(0, 40) : '';
  const kind = b?.kind ?? 'chat';
  if (!txt || !objectId || !author || !MESSAGE_KINDS.has(kind)) return text('bad message', 400);
  const msg = await env.ROOM.getByName(room).addMessage(objectId, author, txt, kind as 'chat' | 'comment');
  return json({ message: msg }, 201);
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    const url = new URL(req.url);
    const { pathname } = url;

    if (pathname === '/api/health') return withCors(Response.json({ ok: true }));
    if (pathname.startsWith('/api/auth/') || pathname === '/api/me') return withCors(await handleAuth(req, env, pathname));
    if (pathname.startsWith('/api/projects') || pathname.startsWith('/api/invites/')) return withCors(await handleProjects(req, env, pathname, url));

    // 방 접속·대화 API: ?session= / ?invite= 로 자격 전달 (브라우저 WebSocket 은 헤더를 못 넣는다)
    const room = pathname.match(/^\/api\/rooms\/([^/]+?)(\/ws|\/messages)?$/);
    if (room) {
      const name = decodeURIComponent(room[1]);
      if (!ROOM_RE.test(name)) return withCors(text('bad room', 400));
      const authed = withSessionParam(req, url);
      const access = await resolveAccess(authed, env, name, url.searchParams.get('invite'));
      if (typeof access === 'number') return withCors(text('no access', access));
      if (room[2] === '/messages') return withCors(await postMessage(req, env, name, access.role));
      if (req.headers.get('Upgrade') !== 'websocket') return withCors(text('expected websocket', 426));
      const fwd = new Request(req, { headers: new Headers(req.headers) });
      fwd.headers.set('x-role', access.role);
      return env.ROOM.getByName(name).fetch(fwd);
    }

    const asset = pathname.match(/^\/api\/assets\/([^/]+)$/);
    if (asset) return withCors(await handleAsset(req, env, asset[1]));

    return withCors(text('not found', 404));
  },
} satisfies ExportedHandler<Env>;
