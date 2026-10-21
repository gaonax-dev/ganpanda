// 간판다 동기화 서버: /api/rooms/:room/ws (실시간 협업), /api/assets/:id (사진·디자인 파일)
export { Room } from './room';
export { Account } from './account';
import { handleRequests, markApproved } from './requests';
import { planOf } from './plans';
import { runBackup } from './backup';
import { handleAdmin } from './admin';
import { handleVersions } from './versions';
import { storageUsed } from './usage';
import { handleAuth } from './auth';
import { handleBusiness, recheckBusinesses } from './business';
import { handleStores } from './stores';
import { handleAccountKind } from './accountKind';
import { handleEstimateProject } from './projects';
import { checkMailDns } from './mailDns';
import { handleProjects, resolveAccess, type Role } from './projects';
import { handleGroups } from './groups';
import { handleTeam } from './team';
import { handleSocial } from './social';
import { handlePrices } from './prices';
import { handleColors } from './colors';
import { handleSpecSamples } from './specSamples';
import { handleSpecRules } from './specRules';
import { handleSets } from './sets';
import { json, readJson, text } from './http';

const ROOM_RE = /^[A-Za-z0-9_-]{6,64}$/;
const ASSET_RE = /^[0-9a-f]{32}$/;
const MAX_ASSET = 25 * 1024 * 1024;
const ASSET_TYPES = new Set([
  'image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml', 'image/heic', 'application/pdf',
  // 음성 메모 (2026-10-18 휴대폰 녹음 → 말풍선 첨부): 크롬 webm, 사파리 mp4, 그 밖
  'audio/webm', 'audio/mp4', 'audio/ogg', 'audio/wav', 'audio/mpeg', 'audio/aac', 'audio/x-m4a',
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
    // viewer 도 올릴 수 있다 (대화 첨부용). 용량은 소유 계정에 쌓인다
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
    await env.BACKUP.put(id, bytes, { httpMetadata: { contentType: type } }); // 백업 버킷에도 (2026-10-21)
    if (!counted) {
      await env.DB.prepare('INSERT OR IGNORE INTO account_assets (account_id, asset_id, size, created_at) VALUES (?, ?, ?, ?)')
        .bind(ownerId, id, bytes.byteLength, Date.now()).run();
    }
    return new Response(null, { status: 201 });
  }
  if (req.method === 'GET' || req.method === 'HEAD') {
    // 소유 계정에 등록된 에셋만 (다른 계정의 프로젝트 자격으로는 받을 수 없다)
    const mine = await env.DB.prepare('SELECT 1 FROM account_assets WHERE account_id = ? AND asset_id = ?').bind(ownerId, id).first();
    // 없음과 다른 계정 것을 구별하지 않고 404 — 받는 쪽은 404 를 "아직 올라오는 중"으로 보고 다시 받는다 (2026-10-19 사진 기기 먼저·뒤에서 올리기; 전엔 GET 이 403 이라 다른 기기가 바로 포기했다)
    if (!mine) return text('not found', 404);
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

const MESSAGE_KINDS = new Set(['chat', 'comment', 'voice']); // voice = 음성 메모 (2026-10-18)
const MESSAGE_MAX = 2000;
const ATTACH_MAX = 5;

/** 첨부 목록 검증: 에셋 ID 형식·허용 형식·개수 */
function parseAttachments(v: unknown): { assetId: string; name: string; type: string; size: number }[] | null {
  if (v === undefined) return [];
  if (!Array.isArray(v) || v.length > ATTACH_MAX) return null;
  const out = [];
  for (const a of v) {
    if (!a || typeof a !== 'object') return null;
    const { assetId, name, type, size } = a as Record<string, unknown>;
    if (typeof assetId !== 'string' || !ASSET_RE.test(assetId)) return null;
    if (typeof name !== 'string' || !name.trim() || name.length > 120) return null;
    if (typeof type !== 'string' || !ASSET_TYPES.has(type)) return null;
    if (typeof size !== 'number' || !(size >= 0)) return null;
    out.push({ assetId, name: name.trim(), type, size: Math.round(size) });
  }
  return out;
}

/** viewer 는 문서를 편집할 수 없으므로 대화는 서버가 대신 기록한다 (다른 역할도 사용 가능). DELETE = 지우기 (viewer 는 자기 글만, 2026-10-18) */
async function postMessage(req: Request, env: Env, room: string, role: Role): Promise<Response> {
  if (req.method === 'DELETE') {
    const b = await readJson<{ id?: string; author?: string }>(req);
    const id = typeof b?.id === 'string' ? b.id : '';
    const author = typeof b?.author === 'string' ? b.author.trim().slice(0, 40) : '';
    if (!id || (role === 'viewer' && !author)) return text('bad request', 400);
    const st = await env.ROOM.getByName(room).removeMessage(id, role === 'viewer' ? author : undefined);
    return st === 200 ? json({ ok: true }) : text(st === 403 ? 'not yours' : 'not found', st);
  }
  if (req.method !== 'POST') return text('method not allowed', 405);
  const b = await readJson<{ objectId?: string; author?: string; text?: string; kind?: string; attachments?: unknown }>(req);
  const txt = typeof b?.text === 'string' ? b.text.trim().slice(0, MESSAGE_MAX) : '';
  const objectId = typeof b?.objectId === 'string' ? b.objectId : '';
  const author = typeof b?.author === 'string' ? b.author.trim().slice(0, 40) : '';
  const kind = b?.kind ?? 'chat';
  const attachments = parseAttachments(b?.attachments);
  if (!attachments || (!txt && !attachments.length) || !objectId || !author || !MESSAGE_KINDS.has(kind)) return text('bad message', 400);
  const msg = await env.ROOM.getByName(room).addMessage(objectId, author, txt, kind as 'chat' | 'comment' | 'voice', attachments);
  return json({ message: msg }, 201);
}

/** 제안 승인 (viewer·editor·owner 모두). 이름·해시·스냅샷을 문서에 기록 */
async function postApproval(req: Request, env: Env, room: string): Promise<Response> {
  if (req.method !== 'POST') return text('method not allowed', 405);
  const b = await readJson<{ by?: string; hash?: string; snapshot?: unknown; proposalId?: string }>(req);
  const by = typeof b?.by === 'string' ? b.by.trim().slice(0, 40) : '';
  const hash = typeof b?.hash === 'string' ? b.hash.trim().slice(0, 64) : '';
  if (!by || !hash || !b?.snapshot || typeof b.snapshot !== 'object') return text('bad approval', 400);
  if (JSON.stringify(b.snapshot).length > 200_000) return text('snapshot too large', 413);
  const approval = await env.ROOM.getByName(room).addApproval(by, hash, b.snapshot, typeof b.proposalId === 'string' ? b.proposalId : undefined);
  await markApproved(env, room); // 요청판: 요청에서 만든 프로젝트면 요청을 승인됨으로 (2026-10-17)
  return json({ approval }, 201);
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/**
 * 제안 링크 랜딩: 카카오톡·문자 미리보기(OG)를 위해 서버가 HTML 을 돌려주고, 사람은 앱의 제안 페이지로 넘어간다.
 * 토큰이 틀리면 404 (프로젝트 존재도 알리지 않음)
 */
async function proposalLanding(req: Request, env: Env, projectId: string, token: string, image: boolean, url: URL): Promise<Response> {
  if (!ROOM_RE.test(projectId)) return text('not found', 404);
  const access = await resolveAccess(req, env, projectId, token);
  if (typeof access === 'number') return text('not found', 404);
  if (image) {
    const id = await env.ROOM.getByName(projectId).proposalImageAsset();
    const obj = id ? await env.ASSETS.get(id) : null;
    if (!obj) return text('not found', 404);
    return new Response(obj.body, { headers: { 'content-type': obj.httpMetadata?.contentType ?? 'image/png', 'cache-control': 'public, max-age=600' } });
  }
  const app = `${env.APP_URL.replace(/\/+$/, '')}/?room=${projectId}&invite=${token}&proposal=1`;
  const name = esc(access.project.name);
  const imgUrl = `${url.origin}/p/${projectId}/${token}/image.png`;
  const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${name} 간판 제안</title>
<meta property="og:type" content="website"><meta property="og:title" content="${name} 간판 제안">
<meta property="og:description" content="가게 사진 위에 간판이 이렇게 달립니다 — 치수·금액을 확인하고 승인해 주세요.">
<meta property="og:image" content="${imgUrl}"><meta property="og:url" content="${url.origin}/p/${projectId}/${token}">
<meta http-equiv="refresh" content="0;url=${app}">
<style>body{font-family:sans-serif;background:#0f1115;color:#eee;display:grid;place-items:center;height:100vh;margin:0}a{color:#ffcc00}</style></head>
<body><p>제안 페이지로 이동합니다… <a href="${app}">열리지 않으면 여기를 누르세요</a></p><script>location.replace(${JSON.stringify(app)})</script></body></html>`;
  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
}

/** viewer 가 사진 위에 핀을 꽂는다 (문서 편집 권한 없이) */
async function postPin(req: Request, env: Env, room: string): Promise<Response> {
  if (req.method !== 'POST') return text('method not allowed', 405);
  const b = await readJson<{ photoId?: string; x?: number; y?: number; author?: string; to?: string }>(req);
  const photoId = typeof b?.photoId === 'string' ? b.photoId : '';
  const author = typeof b?.author === 'string' ? b.author.trim().slice(0, 40) : '';
  const to = typeof b?.to === 'string' ? b.to.trim().slice(0, 40) : ''; // 받는 사람 (2026-10-17 말풍선), 비우면 모두
  if (!photoId || !author || typeof b?.x !== 'number' || typeof b?.y !== 'number' || !isFinite(b.x) || !isFinite(b.y)) return text('bad pin', 400);
  const pin = await env.ROOM.getByName(room).addPin(photoId, b.x, b.y, author, to);
  return json({ pin }, 201);
}

const MODEL_PATH_RE = /^[A-Za-z0-9_-]+(\/[A-Za-z0-9_.-]+)+$/;

async function serveModel(req: Request, env: Env, rawPath: string): Promise<Response> {
  let path: string;
  try { path = decodeURIComponent(rawPath); } catch { return text('bad path', 400); }
  if (!MODEL_PATH_RE.test(path) || path.includes('..')) return text('bad path', 400);
  if (req.method !== 'GET' && req.method !== 'HEAD') return text('method not allowed', 405);
  const obj = req.method === 'HEAD' ? await env.ASSETS.head('models/' + path) : await env.ASSETS.get('models/' + path);
  if (!obj) return text('not found', 404);
  const headers = new Headers({
    'content-type': obj.httpMetadata?.contentType ?? 'application/octet-stream',
    'content-length': String(obj.size),
    'cache-control': 'public, max-age=31536000, immutable',
    'x-content-type-options': 'nosniff',
  });
  return new Response(req.method === 'HEAD' ? null : (obj as R2ObjectBody).body, { headers });
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    const url = new URL(req.url);
    const { pathname } = url;

    if (pathname === '/api/health') { // 메일 DNS 가 위험하면 503 — 외부 모니터가 알린다 (2026-10-22)
      const mail = await checkMailDns();
      return withCors(Response.json({ ok: !mail.danger, mail }, { status: mail.danger ? 503 : 200, headers: { 'cache-control': 'no-store' } }));
    }
    if (pathname === '/api/auth/providers' || /^\/api\/auth\/(kakao|google|apple)\//.test(pathname)) return withCors(await handleSocial(req, env, pathname));
    if (pathname === '/api/me/prices') return withCors(await handlePrices(req, env));
    if (pathname === '/api/me/colors') return withCors(await handleColors(req, env));
    if (pathname === '/api/me/sets') return withCors(await handleSets(req, env)); // 세트 라이브러리 (2026-10-19)
    if (pathname === '/api/spec-samples') return withCors(await handleSpecSamples(req, env)); // 퀵입력이 못 알아본 글 표본 (2026-10-18)
    if (pathname === '/api/me/spec-rules' || pathname === '/api/spec-rules/suggest' || pathname === '/api/spec-rules/defaults') return withCors(await handleSpecRules(req, env, pathname, url)); // 사양 글 개인 사전 + 추천 + 전국 기본값 (2026-10-18 V1 · 10-19 V2)
    if (pathname === '/api/me/business') return withCors(await handleBusiness(req, env)); // 사업자 확인 (2026-10-21)
    if (pathname === '/api/me/kind' || (pathname === '/api/me' && req.method === 'DELETE')) return withCors(await handleAccountKind(req, env, pathname)); // 계정 종류 전환·삭제 (2026-10-22)
    if (pathname.startsWith('/api/me/stores')) return withCors(await handleStores(req, env, pathname)); // 가게 사장의 사업자 (2026-10-22)
    if (pathname === '/api/estimate/project') return withCors(await handleEstimateProject(req, env)); // 소비자 견적 초안 방 (2026-10-22)
    if (pathname.startsWith('/api/me/team')) return withCors(await handleTeam(req, env, pathname));
    if (pathname.startsWith('/api/admin/')) return withCors(await handleAdmin(req, env, pathname)); // 운영자 복원 (2026-10-21)
    if (pathname.startsWith('/api/auth/') || pathname === '/api/me' || pathname === '/api/me/password' || pathname === '/api/me/plan' || pathname === '/api/me/presence' || pathname === '/api/me/logout-others') return withCors(await handleAuth(req, env, pathname));
    if (pathname.startsWith('/api/groups')) return withCors(await handleGroups(req, env, pathname));
    if (pathname.startsWith('/api/requests') || pathname === '/api/me/request-settings') return withCors(await handleRequests(req, env, pathname, url));
    if (/^\/api\/projects\/[^/]+\/versions/.test(pathname)) return withCors(await handleVersions(req, env, pathname, url)); // 사용자 버전 기록 (2026-10-21)
    if (pathname.startsWith('/api/projects') || pathname.startsWith('/api/invites/')) return withCors(await handleProjects(req, env, pathname, url));

    // 방 접속·대화 API: ?session= / ?invite= 로 자격 전달 (브라우저 WebSocket 은 헤더를 못 넣는다)
    // 제안 링크 랜딩 (OG 미리보기) — 토큰이 자격
    const landing = pathname.match(/^\/p\/([^/]+)\/([^/]+?)(\/image\.png)?$/);
    if (landing) return withCors(await proposalLanding(req, env, decodeURIComponent(landing[1]), decodeURIComponent(landing[2]), !!landing[3], url));

    const room = pathname.match(/^\/api\/rooms\/([^/]+?)(\/ws|\/messages|\/pins|\/approvals)?$/);
    if (room) {
      const name = decodeURIComponent(room[1]);
      if (!ROOM_RE.test(name)) return withCors(text('bad room', 400));
      const authed = withSessionParam(req, url);
      const access = await resolveAccess(authed, env, name, url.searchParams.get('invite'));
      if (typeof access === 'number') return withCors(text('no access', access));
      if (access.project.kind === 'request' && room[2]) return withCors(text('read only', 403)); // 요청 프로젝트에는 대화·말풍선·승인 없음 (간판집끼리 섞이지 않게)
      if (room[2] === '/messages') return withCors(await postMessage(req, env, name, access.role));
      if (room[2] === '/pins') return withCors(await postPin(req, env, name));
      if (room[2] === '/approvals') return withCors(await postApproval(req, env, name));
      if (req.headers.get('Upgrade') !== 'websocket') return withCors(text('expected websocket', 426));
      // 동시 접속 좌석 제한은 없앴다 (2026-10-21 "동시접속이라고 했는데 맴버가입수이다" — 요금제 한도는 팀 멤버 수, plans.ts)
      const sid = crypto.randomUUID();
      const fwd = new Request(req, { headers: new Headers(req.headers) });
      fwd.headers.set('x-role', access.role);
      fwd.headers.set('x-sid', sid);
      return env.ROOM.getByName(name).fetch(fwd);
    }

    // 모델 파일 (SlimSAM 등): 사용자 데이터가 아니므로 공개, 내용이 바뀌지 않으므로 장기 캐시
    if (pathname.startsWith('/api/models/')) return withCors(await serveModel(req, env, pathname.slice('/api/models/'.length)));

    const asset = pathname.match(/^\/api\/assets\/([^/]+)$/);
    if (asset) return withCors(await handleAsset(req, env, asset[1], url));

    return withCors(text('not found', 404));
  },
  /** 매시간 백업 + 사업자 상태 재조회(30일 지난 것, 2026-10-21) (wrangler.jsonc triggers.crons) */
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(runBackup(env));
    ctx.waitUntil(recheckBusinesses(env).catch(() => 0));
  },
} satisfies ExportedHandler<Env>;
