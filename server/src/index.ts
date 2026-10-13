// 간판다 동기화 서버: /api/rooms/:room/ws (실시간 협업), /api/assets/:id (사진·디자인 파일)
export { Room } from './room';
export { Account } from './account';
import { planOf } from './plans';
import { storageUsed } from './usage';
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

async function handleAsset(req: Request, env: Env, id: string, url: URL): Promise<Response> {
  if (!ASSET_RE.test(id)) return text('bad asset id', 400);
  // 에셋은 프로젝트 자격으로만 접근 (업로드: owner/editor, 다운로드: viewer 포함)
  const projectId = url.searchParams.get('project');
  if (!projectId) return text('project required', 401);
  const access = await resolveAccess(withSessionParam(req, url), env, projectId, url.searchParams.get('invite'));
  if (typeof access === 'number') return text('no access', access);
  const ownerId = access.project.owner_id;

  if (req.method === 'PUT') {
    if (access.role === 'viewer') return text('viewer cannot upload', 403);
    const type = (req.headers.get('content-type') ?? '').split(';')[0].trim();
    if (!ASSET_TYPES.has(type)) return text('unsupported type', 415);
    if (Number(req.headers.get('content-length') ?? 0) > MAX_ASSET) return text('too large', 413);
    const bytes = await req.arrayBuffer();
    if (bytes.byteLength > MAX_ASSET) return text('too large', 413);
    if ((await assetId(bytes)) !== id) return text('hash mismatch', 400);
    const owner = await env.DB.prepare('SELECT plan FROM accounts WHERE id = ?').bind(ownerId).first<{ plan: string }>();
    const counted = await env.DB.prepare('SELECT 1 FROM account_assets WHERE account_id = ? AND asset_id = ?').bind(ownerId, id).first();
    if (!counted) {
      const limitBytes = planOf(owner?.plan ?? 'free').storageBytes;
      const usedBytes = await storageUsed(env, ownerId);
      if (usedBytes + bytes.byteLength > limitBytes) return json({ error: 'storage_limit', limitBytes, usedBytes, sizeBytes: bytes.byteLength }, 413);
    }
    await env.ASSETS.put(id, bytes, { httpMetadata: { contentType: type } });
    if (!counted) {
      await env.DB.prepare('INSERT OR IGNORE INTO account_assets (account_id, asset_id, size, created_at) VALUES (?, ?, ?, ?)')
        .bind(ownerId, id, bytes.byteLength, Date.now()).run();
    }
    return new Response(null, { status: 201 });
  }
  if (req.method === 'GET' || req.method === 'HEAD') {
    // 소유 계정에 등록된 에셋만 (다른 계정의 프로젝트 자격으로는 받을 수 없다)
    const mine = await env.DB.prepare('SELECT 1 FROM account_assets WHERE account_id = ? AND asset_id = ?').bind(ownerId, id).first();
    if (!mine) return text('not found', req.method === 'HEAD' ? 404 : 403);
    const obj = req.method === 'HEAD' ? await env.ASSETS.head(id) : await env.ASSETS.get(id);
    if (!obj) return text('not found', 404);
    const headers = new Headers({
      'content-type': obj.httpMetadata?.contentType ?? 'application/octet-stream',
      'content-length': String(obj.size),
      'cache-control': 'private, max-age=31536000, immutable',
      'x-content-type-options': 'nosniff',
      // SVG·PDF 안의 스크립트가 실행되지 않도록 격리
      'content-security-policy': "default-src 'none'; img-src data:; style-src 'unsafe-inline'; sandbox",
    });
    return new Response(req.method === 'HEAD' ? null : (obj as R2ObjectBody).body, { headers });
  }
  return text('method not allowed', 405);
}

/**
 * ?session= 쿼리를 Authorization 헤더로 옮긴 "권한 검사용" 요청 (WebSocket·에셋 용).
 * 본문은 복제하지 않는다 — 원본 요청에서 본문을 읽을 수 있어야 하므로 헤더만 담은 GET 요청을 만든다.
 */
function withSessionParam(req: Request, url: URL): Request {
  const s = url.searchParams.get('session');
  if (!s || req.headers.has('authorization')) return req;
  const headers = new Headers(req.headers);
  headers.set('authorization', `Bearer ${s}`);
  return new Request(req.url, { method: 'GET', headers });
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

/** viewer 가 사진 위에 핀을 꽂는다 (문서 편집 권한 없이) */
async function postPin(req: Request, env: Env, room: string): Promise<Response> {
  if (req.method !== 'POST') return text('method not allowed', 405);
  const b = await readJson<{ photoId?: string; x?: number; y?: number; author?: string }>(req);
  const photoId = typeof b?.photoId === 'string' ? b.photoId : '';
  const author = typeof b?.author === 'string' ? b.author.trim().slice(0, 40) : '';
  if (!photoId || !author || typeof b?.x !== 'number' || typeof b?.y !== 'number' || !isFinite(b.x) || !isFinite(b.y)) return text('bad pin', 400);
  const pin = await env.ROOM.getByName(room).addPin(photoId, b.x, b.y, author);
  return json({ pin }, 201);
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
    const room = pathname.match(/^\/api\/rooms\/([^/]+?)(\/ws|\/messages|\/pins)?$/);
    if (room) {
      const name = decodeURIComponent(room[1]);
      if (!ROOM_RE.test(name)) return withCors(text('bad room', 400));
      const authed = withSessionParam(req, url);
      const access = await resolveAccess(authed, env, name, url.searchParams.get('invite'));
      if (typeof access === 'number') return withCors(text('no access', access));
      if (room[2] === '/messages') return withCors(await postMessage(req, env, name, access.role));
      if (room[2] === '/pins') return withCors(await postPin(req, env, name));
      if (req.headers.get('Upgrade') !== 'websocket') return withCors(text('expected websocket', 426));
      // 동시접속 좌석: 사람 = 계정 ID 또는 손님 브라우저 ID (없으면 소켓마다 1석)
      const sid = crypto.randomUUID();
      const person = access.account ? `acct:${access.account.id}` : `guest:${url.searchParams.get('guest') || sid}`;
      const ownerId = access.project.owner_id;
      const owner = await env.DB.prepare('SELECT plan FROM accounts WHERE id = ?').bind(ownerId).first<{ plan: string }>();
      const seat = await env.ACCOUNT.getByName(ownerId).acquire(person, sid, planOf(owner?.plan ?? 'free').seats);
      if (!seat.ok) return withCors(json({ error: 'seat_limit', used: seat.used, limit: seat.limit }, 429));
      const fwd = new Request(req, { headers: new Headers(req.headers) });
      fwd.headers.set('x-role', access.role);
      fwd.headers.set('x-sid', sid);
      fwd.headers.set('x-owner', ownerId);
      return env.ROOM.getByName(name).fetch(fwd);
    }

    const asset = pathname.match(/^\/api\/assets\/([^/]+)$/);
    if (asset) return withCors(await handleAsset(req, env, asset[1], url));

    return withCors(text('not found', 404));
  },
} satisfies ExportedHandler<Env>;
