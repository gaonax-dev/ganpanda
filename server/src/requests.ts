// 요청판 (2026-10-17): 가게 사장의 견적 요청(로그인 없음) → 지역의 "요청 받기" 간판사 → 요청에서 프로젝트 → 제안 링크.
// 돈은 고객↔간판사 직접. 간판다는 전달·기록만 (docs/product/decisions.md). 간판사 과금은 제안 링크 발급(projects.ts) 에서 요금제 건수로.
import { authenticate, type Account } from './auth';
import { json, randomToken, readJson, sha256hex, text } from './http';
import { validateRequestSigns, type RequestSign } from './requestSigns';
import { configured as ntsConfigured, fetchStatuses, validBizNo, validateBusiness } from './business';
import { scanBizDoc } from './docScan';
import { regionMatches, regionOfAddress } from './region';
import { isOperator, operatorEmails } from './operator';
import { getStore, storeDocKey } from './stores';

/** 같은 전화번호의 열린 요청 한도 (허위 요청 방지 1차) */
export const REQUEST_LIMIT_PER_PHONE = 3;
/** 사진 장수 제한은 없앰 (2026-10-22 사용자: "견적요청보내기 사진수 리밋있다. 제거해줘") — 30 은 저장소 보호용 안전선일 뿐 */
const MAX_PHOTOS = 30;
const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
const PHOTO_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const STORE_MAX = 60, REGION_MAX = 40, TEXT_MAX = 500, REF_MAX = 40;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const FROM = { email: 'login@ganpanda.co.kr', name: '간판다' };

export interface RequestRow {
  id: string; key_hash: string; store: string; region: string; text: string; phone: string; email: string | null; ref: string | null;
  photos: string; status: 'open' | 'approved' | 'cancelled'; created_at: number; approved_at: number | null; approved_by: string | null;
  /** 소비자가 그린 사인물 JSON (2026-10-21). 옛 행은 없음 */
  signs?: string;
  /** 요청한 계정 (2026-10-21 로그인 필수). 옛 행은 null */
  account_id?: string | null;
  /** 가게 주소·사업자번호(선택, 2026-10-21)와 국세청 상태(active/suspended, 확인 안 됨 = null) */
  address?: string; biz_no?: string | null; biz_status?: string | null;
  /** 사업자등록증 사본 메타 JSON {type,size} (2026-10-21) */
  biz_doc?: string | null;
  /** 사본 없이 직접 넣은 검증 요소와 진위확인 결과 (2026-10-21) */
  owner_name?: string | null; start_date?: string | null; biz_verified?: number;
  /** 고른 사업자(stores), 일반 주문(사업자 없음), 재요청이면 앞 요청, 취소 시각 (2026-10-22) */
  store_id?: string | null; general?: number; prev_id?: string | null; cancelled_at?: number | null;
}
const bizDocOf = (r: RequestRow): { type: string; size: number } | null => { try { return r.biz_doc ? (JSON.parse(r.biz_doc) as { type: string; size: number }) : null; } catch { return null; } };
const bizDocKey = (id: string) => `requests/${id}/biz-doc`;
const DOC_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);
const signsOf = (r: RequestRow): RequestSign[] => { try { return validateRequestSigns(JSON.parse(r.signs || '[]')) ?? []; } catch { return []; } };
interface PhotoMeta { n: number; type: string; size: number }
const photosOf = (r: RequestRow): PhotoMeta[] => { try { return JSON.parse(r.photos) as PhotoMeta[]; } catch { return []; } };
const photoKey = (id: string, n: number) => `requests/${id}/${n}`;
/** 지역 비교: 공백 무시 */
/** 지역 맞춤 (2026-10-21 "지역입력은 주소와 중복된다"): 요청 지역은 주소에서 뽑고, 간판사 지역과는 포함 관계로 (region.ts) */
export const regionsOf = (a: Pick<Account, 'regions'>): string[] => (a.regions ?? '').split(',').map((s) => s.trim()).filter(Boolean);
const appUrl = (env: Env) => env.APP_URL.replace(/\/+$/, '');

const getRequest = (env: Env, id: string) => env.DB.prepare('SELECT * FROM requests WHERE id = ?').bind(id).first<RequestRow>();

/** 간판사가 이 요청을 볼 수 있나: 요청 받기 + 지역 일치(열린 요청), 또는 이미 답한 요청 */
/** 운영자 (2026-10-21 "받을 간판 가게가 없다. 일정 기간 수동으로 처리"): OPERATOR_EMAILS 의 계정은 지역에 상관없이 모든 열린 요청을 받고 알림 메일도 받는다 (operator.ts) */
async function shopCanSee(env: Env, me: Account, r: RequestRow): Promise<boolean> {
  const responded = await env.DB.prepare('SELECT 1 FROM projects WHERE owner_id = ? AND request_id = ?').bind(me.id, r.id).first();
  if (responded) return true;
  if (r.status === 'open' && isOperator(env, me.email)) return true;
  if (r.status === 'open' && r.prev_id && (await env.DB.prepare('SELECT 1 FROM request_responses WHERE request_id = ? AND account_id = ?').bind(r.prev_id, me.id).first())) return true; // 재견적 (2026-10-22)
  if (!me.receive_requests || r.status !== 'open') return false;
  return regionsOf(me).some((g) => regionMatches(g, r.region));
}
async function customerKeyOk(r: RequestRow, key: string | null): Promise<boolean> {
  return !!key && (await sha256hex(key)) === r.key_hash;
}
/** 고객: 키 또는 요청한 계정의 세션 (2026-10-21 로그인 요청 — 키 없이도 내 요청을 연다) */
async function customerOk(env: Env, req: Request, url: URL, r: RequestRow, key: string | null): Promise<boolean> {
  if (await customerKeyOk(r, key)) return true;
  if (!r.account_id) return false;
  const me = await authenticate(withSessionParam(req, url), env);
  return !!me && me.id === r.account_id;
}

/** 요청 알림 메일 (운영: Email Sending). 로컬·테스트는 EMAIL 이 없어 건너뜀. 실패해도 요청은 만들어진다 */
async function notify(env: Env, r: RequestRow, url: string) {
  if (!env.EMAIL) return;
  const shops = await env.DB.prepare("SELECT email, regions FROM accounts WHERE receive_requests = 1 AND regions <> ''").all<{ email: string; regions: string }>();
  const hit = shops.results.filter((s) => regionsOf(s).some((g) => regionMatches(g, r.region)));
  const home = `${appUrl(env)}/`;
  const to = new Set([...hit.map((s) => s.email), ...operatorEmails(env)]); // 운영자는 항상 (지역에 간판집이 없는 동안 수동 처리)
  // 재요청이면 앞 요청에 제안했던 간판집에 재견적 요청 (2026-10-22 "재 견적 간판다에서 요청을 보낸다")
  if (r.prev_id) {
    const prev = await env.DB.prepare('SELECT a.email FROM request_responses rr JOIN accounts a ON a.id = rr.account_id WHERE rr.request_id = ?').bind(r.prev_id).all<{ email: string }>();
    for (const p of prev.results) {
      to.delete(p.email);
      try { await env.EMAIL.send({ to: p.email, from: FROM, subject: `[간판다] 재견적 요청 — ${r.store}`, text: `${r.store}에서 내용을 고쳐 다시 견적을 요청했습니다. 앞 요청에 보낸 제안 건수는 돌려드렸습니다.\n\n간판다 홈의 "받은 요청"에서 새 내용을 보고 다시 제안해 주세요: ${home}` }); } catch { /* 무시 */ }
    }
  }
  for (const s of [...to].map((email) => ({ email }))) {
    try {
      await env.EMAIL.send({ to: s.email, from: FROM, subject: `[간판다] ${r.region} 간판 견적 요청 — ${r.store}`,
        text: `${r.region}에서 간판 견적 요청이 왔습니다.\n\n가게: ${r.store}\n내용: ${r.text || '(없음)'}\n\n간판다 홈의 "받은 요청"에서 사진을 보고 제안을 만드세요: ${home}\n제안 링크를 보내면 고객 연락처가 보입니다.` });
    } catch { /* 한 곳 실패가 다른 곳을 막지 않게 */ }
  }
  if (r.email) {
    try {
      await env.EMAIL.send({ to: r.email, from: FROM, subject: `[간판다] ${r.store} 간판 견적 요청을 받았습니다`,
        text: `요청이 접수되었습니다. 간판사들의 제안이 오면 아래 페이지에서 볼 수 있습니다 (이 주소를 저장해 두세요):\n${url}` });
    } catch { /* 고객 메일 실패는 무시 */ }
  }
}

const pubRequest = (r: RequestRow) => ({ id: r.id, store: r.store, region: r.region, text: r.text, status: r.status, createdAt: r.created_at, general: !!r.general, reRequest: !!r.prev_id, ...(r.cancelled_at ? { cancelledAt: r.cancelled_at } : {}), photos: photosOf(r).map(({ n, type }) => ({ n, type })), signs: signsOf(r), address: r.address ?? '', bizNo: r.biz_no ?? null, bizStatus: r.biz_status ?? null, bizDoc: bizDocOf(r), bizVerified: !!r.biz_verified, ownerName: r.owner_name ?? null });

export async function handleRequests(req: Request, env: Env, pathname: string, url: URL): Promise<Response> {
  // ---- 간판사 설정: PUT /api/me/request-settings {receive, regions[]} ----
  if (pathname === '/api/me/request-settings') {
    const me = await authenticate(req, env);
    if (!me) return text('unauthorized', 401);
    if (req.method !== 'PUT') return text('method not allowed', 405);
    const body = await readJson<{ receive?: boolean; regions?: string[] }>(req);
    if (!body || typeof body.receive !== 'boolean' || !Array.isArray(body.regions) || body.regions.some((g) => typeof g !== 'string')) return text('bad body', 400);
    const regions = [...new Set(body.regions.map((g) => g.trim().slice(0, REGION_MAX)).filter(Boolean))].slice(0, 20);
    await env.DB.prepare('UPDATE accounts SET receive_requests = ?, regions = ? WHERE id = ?').bind(body.receive ? 1 : 0, regions.join(','), me.id).run();
    return json({ requestSettings: { receive: body.receive, regions } });
  }

  // ---- 사업자등록증 읽기: POST /api/requests/doc-scan (로그인, 그림 바이트) → 번호·상호·주소… 못 읽으면 404 scan_failed → 직접 입력 (2026-10-21) ----
  if (pathname === '/api/requests/doc-scan' && req.method === 'POST') {
    const me = await authenticate(req, env);
    if (!me) return text('unauthorized', 401);
    const type = (req.headers.get('content-type') ?? '').split(';')[0].trim();
    if (!DOC_TYPES.has(type)) return text('unsupported type', 415);
    const bytes = await req.arrayBuffer();
    if (!bytes.byteLength || bytes.byteLength > MAX_PHOTO_BYTES) return text('bad size', 413);
    const fields = await scanBizDoc(env, bytes, type);
    return fields ? json({ fields }) : json({ error: 'scan_failed' }, 404);
  }

  // ---- 내 요청 목록: GET /api/requests/mine (요청한 계정, 2026-10-21) ----
  if (pathname === '/api/requests/mine' && req.method === 'GET') {
    const me = await authenticate(req, env);
    if (!me) return text('unauthorized', 401);
    const rows = (await env.DB.prepare('SELECT r.*, (SELECT COUNT(*) FROM request_responses rr WHERE rr.request_id = r.id) AS responses FROM requests r WHERE r.account_id = ? ORDER BY r.created_at DESC LIMIT 50').bind(me.id).all<RequestRow & { responses: number }>()).results;
    return json({ requests: rows.map((r) => ({ ...pubRequest(r), responses: Number(r.responses) })) });
  }

  // ---- 요청 올리기: POST /api/requests (로그인 필수 — 2026-10-21 "인증이 되야": 카카오 기본) ----
  if (pathname === '/api/requests' && req.method === 'POST') {
    const me = await authenticate(req, env);
    if (!me) return json({ error: 'login_required' }, 401);
    const b = await readJson<{ store?: string; region?: string; text?: string; phone?: string; email?: string; ref?: string; signs?: unknown; address?: string; bizNo?: string; ownerName?: string; startDate?: string; bizDocPending?: boolean; storeId?: string; general?: boolean; prevId?: string }>(req);
    const store = typeof b?.store === 'string' ? b.store.trim().slice(0, STORE_MAX) : '';
    const address0 = typeof b?.address === 'string' ? b.address.trim() : '';
    const region = (typeof b?.region === 'string' && b.region.trim() ? b.region.trim() : regionOfAddress(address0)).slice(0, REGION_MAX); // 지역이 없으면 주소에서 (2026-10-21)
    const phone = typeof b?.phone === 'string' ? b.phone.replace(/\D/g, '') : '';
    const email = typeof b?.email === 'string' && b.email.trim() ? b.email.trim().toLowerCase() : null;
    if (!store || !region || !/^\d{9,11}$/.test(phone)) return text('bad request', 400);
    if (email && !EMAIL_RE.test(email)) return text('bad email', 400);
    const signs = b?.signs === undefined ? [] : validateRequestSigns(b.signs); // 소비자가 그린 사인물 (2026-10-21)
    if (!signs) return text('bad signs', 400);
    // 고른 사업자(2026-10-22 "사업자 추가 … 선택가능하게"): 내 것·인증된 것만, 번호·대표자·개업일·상태를 그대로 싣는다
    const st = typeof b?.storeId === 'string' ? await getStore(env, b.storeId) : null;
    if (b?.storeId !== undefined && (!st || st.account_id !== me.id || !st.verified)) return json({ error: 'bad_store' }, 400);
    const general = !st && b?.general === true; // 일반 주문 (사업자 없음, 2026-10-22)
    // 재요청 (2026-10-22 "견적요청 취소 후 재 요청"): 앞 요청은 내 것이고 취소된 것
    const prev = typeof b?.prevId === 'string' ? await getRequest(env, b.prevId) : null;
    if (b?.prevId !== undefined && (!prev || prev.account_id !== me.id || prev.status !== 'cancelled')) return json({ error: 'bad_prev' }, 400);
    // 주소(선택)·사업자번호(선택, 2026-10-21 "둘다 작성"): 번호만 국세청 상태조회 → 폐업은 거절, 미등록 거절, 조회 불가면 확인 없이 받는다
    const address = typeof b?.address === 'string' && b.address.trim() ? b.address.trim().slice(0, 200) : st?.address ?? '';
    const bizNo = st ? st.b_no : typeof b?.bizNo === 'string' ? b.bizNo.replace(/\D/g, '') : '';
    let bizStatus: string | null = st ? st.status : null, bizVerified = st ? 1 : 0;
    // 검증 요소 (2026-10-21 "사본이 없으면 직접입력 … 필요한 검증 요소만"): 사본을 올리거나(bizDocPending), 번호·대표자명·개업일로 국세청 진위확인
    const ownerName = st ? st.owner_name : typeof b?.ownerName === 'string' ? b.ownerName.trim().slice(0, 40) : '';
    const startDate = st ? st.start_dt : typeof b?.startDate === 'string' ? b.startDate.replace(/\D/g, '') : '';
    const manual = !st && !!(bizNo && ownerName && /^\d{8}$/.test(startDate));
    if (!st && !general && !manual && !b?.bizDocPending) return json({ error: 'verification_required' }, 400);
    if (bizNo && !st) {
      if (!validBizNo(bizNo)) return json({ error: 'bad_biz_no' }, 400);
      if (ntsConfigured(env)) {
        if (manual) {
          const v = await validateBusiness(env, { b_no: bizNo, p_nm: ownerName, start_dt: startDate, b_nm: '' }).catch(() => null); // 상호는 안 맞춘다 (브랜드명·띄어쓰기로 틀릴 수 있다)
          if (v) {
            if (!v.registered) return json({ error: 'not_registered' }, 400);
            if (!v.valid) return json({ error: 'mismatch' }, 400);
            if (v.status === 'closed') return json({ error: 'biz_closed' }, 400);
            bizStatus = v.status; bizVerified = 1;
          }
        } else {
          const st = (await fetchStatuses(env, [bizNo]).catch(() => new Map<string, string>())).get(bizNo) ?? null;
          if (st === 'closed') return json({ error: 'biz_closed' }, 400);
          bizStatus = st; // active · suspended · null(응답 없음 = 미등록이거나 조회 실패)
        }
      }
    }
    const open = await env.DB.prepare("SELECT COUNT(*) AS n FROM requests WHERE phone = ? AND status = 'open'").bind(phone).first<{ n: number }>();
    if (Number(open?.n ?? 0) >= REQUEST_LIMIT_PER_PHONE) return json({ error: 'request_limit', limit: REQUEST_LIMIT_PER_PHONE }, 429);
    const id = randomToken().slice(0, 16), key = randomToken();
    const row: RequestRow = {
      id, key_hash: await sha256hex(key), store, region, text: typeof b?.text === 'string' ? b.text.trim().slice(0, TEXT_MAX) : '', phone, email,
      ref: typeof b?.ref === 'string' && b.ref.trim() ? b.ref.trim().slice(0, REF_MAX) : null, photos: '[]', status: 'open', created_at: Date.now(), approved_at: null, approved_by: null, signs: JSON.stringify(signs), account_id: me.id, address, biz_no: general ? null : bizNo || null, biz_status: bizStatus, owner_name: general ? null : ownerName || null, start_date: general ? null : startDate || null, biz_verified: bizVerified,
      store_id: st?.id ?? null, general: general ? 1 : 0, prev_id: prev?.id ?? null,
    };
    // 사업자의 사본이 있으면 요청에 복사 (제안 보낸 간판집만 연다)
    if (st?.doc) {
      const obj = await env.ASSETS.get(storeDocKey(st.id));
      if (obj) { const meta = JSON.parse(st.doc) as { type: string; size: number }; await env.ASSETS.put(bizDocKey(id), await obj.arrayBuffer(), { httpMetadata: { contentType: meta.type } }); row.biz_doc = st.doc; }
    }
    await env.DB.prepare('INSERT INTO requests (id, key_hash, store, region, text, phone, email, ref, photos, status, created_at, signs, account_id, address, biz_no, biz_status, owner_name, start_date, biz_verified, store_id, general, prev_id, biz_doc) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(row.id, row.key_hash, row.store, row.region, row.text, row.phone, row.email, row.ref, row.photos, row.status, row.created_at, row.signs, row.account_id, row.address, row.biz_no, row.biz_status, row.owner_name, row.start_date, row.biz_verified, row.store_id, row.general, row.prev_id, row.biz_doc ?? null).run();
    const pageUrl = `${appUrl(env)}/r/${id}?key=${key}`;
    await notify(env, row, pageUrl);
    return json({ id, key, url: pageUrl }, 201);
  }

  // ---- 간판사: 받은 요청 목록 GET /api/requests ----
  if (pathname === '/api/requests' && req.method === 'GET') {
    const me = await authenticate(req, env);
    if (!me) return text('unauthorized', 401);
    const mine = await env.DB.prepare('SELECT p.request_id, p.id AS project_id, rr.proposal_url FROM projects p LEFT JOIN request_responses rr ON rr.request_id = p.request_id AND rr.account_id = p.owner_id WHERE p.owner_id = ? AND p.request_id IS NOT NULL')
      .bind(me.id).all<{ request_id: string; project_id: string; proposal_url: string | null }>();
    const byReq = new Map(mine.results.map((m) => [m.request_id, m]));
    const regions = me.receive_requests ? regionsOf(me) : [];
    const operator = isOperator(env, me.email);
    const open = regions.length || operator ? (await env.DB.prepare("SELECT * FROM requests WHERE status = 'open' ORDER BY created_at DESC LIMIT 200").all<RequestRow>()).results.filter((r) => operator || regions.some((g) => regionMatches(g, r.region))) : [];
    // 재견적 (2026-10-22): 앞 요청에 제안했던 열린 재요청은 지역과 상관없이
    const again = (await env.DB.prepare("SELECT r.* FROM requests r JOIN request_responses rr ON rr.request_id = r.prev_id WHERE rr.account_id = ? AND r.status = 'open'").bind(me.id).all<RequestRow>()).results;
    open.push(...again);
    const answered = byReq.size ? (await env.DB.prepare(`SELECT * FROM requests WHERE id IN (${[...byReq.keys()].map(() => '?').join(',')})`).bind(...byReq.keys()).all<RequestRow>()).results : [];
    const all = new Map<string, RequestRow>();
    for (const r of [...open, ...answered]) all.set(r.id, r);
    const requests = [...all.values()].sort((a, b) => b.created_at - a.created_at).map((r) => {
      const m = byReq.get(r.id);
      // 연락처는 제안 링크를 보낸(요금이 발생한) 요청에만 (숨고식: 제안이 곧 연락처)
      return { ...pubRequest(r), responded: !!m?.proposal_url, ...(m ? { projectId: m.project_id } : {}), ...(m?.proposal_url ? { phone: r.phone, ...(r.email ? { email: r.email } : {}) } : {}) };
    });
    return json({ requests });
  }

  const m = pathname.match(/^\/api\/requests\/([A-Za-z0-9_-]{16})(?:\/(photos|biz-doc)(?:\/(\d+))?|\/(respond|cancel))?$/);
  if (!m) return text('not found', 404);
  const r = await getRequest(env, m[1]);
  if (!r) return text('request not found', 404);
  const key = url.searchParams.get('key');

  // ---- 사진 올리기: PUT /api/requests/:id/photos?key= (고객) ----
  if (m[2] === 'photos' && m[3] === undefined && req.method === 'PUT') {
    if (!(await customerOk(env, req, url, r, key))) return text('forbidden', 403);
    const type = (req.headers.get('content-type') ?? '').split(';')[0].trim();
    if (!PHOTO_TYPES.has(type)) return text('unsupported type', 415);
    const photos = photosOf(r);
    if (photos.length >= MAX_PHOTOS) return text('too many photos', 409);
    const bytes = await req.arrayBuffer();
    if (!bytes.byteLength || bytes.byteLength > MAX_PHOTO_BYTES) return text('bad size', 413);
    const n = photos.length ? Math.max(...photos.map((p) => p.n)) + 1 : 0;
    await env.ASSETS.put(photoKey(r.id, n), bytes, { httpMetadata: { contentType: type } });
    photos.push({ n, type, size: bytes.byteLength });
    await env.DB.prepare('UPDATE requests SET photos = ? WHERE id = ?').bind(JSON.stringify(photos), r.id).run();
    return json({ n }, 201);
  }

  // ---- 사업자등록증 사본: PUT(고객) / GET(고객 또는 제안을 보낸 간판사 — 연락처와 같은 기준) (2026-10-21) ----
  if (m[2] === 'biz-doc' && m[3] === undefined) {
    if (req.method === 'PUT') {
      if (!(await customerOk(env, req, url, r, key))) return text('forbidden', 403);
      const type = (req.headers.get('content-type') ?? '').split(';')[0].trim();
      if (!DOC_TYPES.has(type)) return text('unsupported type', 415);
      const bytes = await req.arrayBuffer();
      if (!bytes.byteLength || bytes.byteLength > MAX_PHOTO_BYTES) return text('bad size', 413);
      await env.ASSETS.put(bizDocKey(r.id), bytes, { httpMetadata: { contentType: type } });
      await env.DB.prepare('UPDATE requests SET biz_doc = ? WHERE id = ?').bind(JSON.stringify({ type, size: bytes.byteLength }), r.id).run();
      return json({ ok: true });
    }
    if (req.method === 'GET' || req.method === 'HEAD') {
      let ok = await customerOk(env, req, url, r, key);
      if (!ok) {
        const me = await authenticate(withSessionParam(req, url), env);
        if (!me) return text('unauthorized', 401);
        ok = !!(await env.DB.prepare('SELECT 1 FROM request_responses WHERE request_id = ? AND account_id = ?').bind(r.id, me.id).first()); // 제안을 보낸 간판사만
      }
      if (!ok) return text('forbidden', 403);
      const meta = bizDocOf(r);
      if (!meta) return text('not found', 404);
      const obj = await env.ASSETS.get(bizDocKey(r.id));
      if (!obj) return text('not found', 404);
      return new Response(req.method === 'HEAD' ? null : obj.body, { headers: { 'content-type': meta.type, 'cache-control': 'private, no-store', 'content-disposition': 'inline; filename="business-registration"' } });
    }
    return text('method not allowed', 405);
  }

  // ---- 사진 받기: GET /api/requests/:id/photos/:n (고객 키 또는 간판사 세션·?session=) ----
  if (m[2] === 'photos' && m[3] !== undefined && (req.method === 'GET' || req.method === 'HEAD')) {
    let ok = await customerOk(env, req, url, r, key);
    if (!ok) {
      const me = await authenticate(withSessionParam(req, url), env);
      if (!me) return text('unauthorized', 401);
      ok = await shopCanSee(env, me, r);
    }
    if (!ok) return text('forbidden', 403);
    const meta = photosOf(r).find((p) => p.n === Number(m[3]));
    if (!meta) return text('not found', 404);
    const obj = req.method === 'HEAD' ? await env.ASSETS.head(photoKey(r.id, meta.n)) : await env.ASSETS.get(photoKey(r.id, meta.n));
    if (!obj) return text('not found', 404);
    return new Response(req.method === 'HEAD' ? null : (obj as R2ObjectBody).body, { headers: { 'content-type': meta.type, 'content-length': String(obj.size), 'cache-control': 'private, max-age=3600', 'x-content-type-options': 'nosniff' } });
  }

  // ---- 취소: POST /api/requests/:id/cancel (고객, 2026-10-22 "견적요청 취소 후 재 요청할수있다. 견적 입찰한 업체들은 토큰을 돌려받고") ----
  // 열린 요청만. 이 요청으로 만든 프로젝트의 제안 링크는 이번 달 제안 건수에서 뺀다(환불), 그 간판집에 알림
  if (m[4] === 'cancel' && req.method === 'POST') {
    if (!(await customerOk(env, req, url, r, key))) return text('forbidden', 403);
    if (r.status !== 'open') return json({ error: 'not_open', status: r.status }, 409);
    const now = Date.now();
    await env.DB.prepare("UPDATE requests SET status = 'cancelled', cancelled_at = ? WHERE id = ?").bind(now, r.id).run();
    const refund = await env.DB.prepare("UPDATE invites SET refunded_at = ? WHERE kind = 'proposal' AND refunded_at IS NULL AND project_id IN (SELECT id FROM projects WHERE request_id = ?)").bind(now, r.id).run();
    if (env.EMAIL) {
      const shops = await env.DB.prepare('SELECT a.email FROM request_responses rr JOIN accounts a ON a.id = rr.account_id WHERE rr.request_id = ?').bind(r.id).all<{ email: string }>();
      for (const s of shops.results) {
        try { await env.EMAIL.send({ to: s.email, from: FROM, subject: `[간판다] 견적 요청 취소 — ${r.store}`, text: `${r.store}의 견적 요청이 취소되었습니다. 이 요청에 보낸 제안 건수는 돌려드렸습니다. 가게 사장님이 내용을 고쳐 다시 요청하면 재견적 요청을 보내 드립니다.` }); } catch { /* 무시 */ }
      }
    }
    return json({ ok: true, refunded: refund.meta.changes ?? 0 });
  }

  // ---- 답하기: POST /api/requests/:id/respond (간판사) → 요청 사진이 들어갈 프로젝트 ----
  if (m[4] === 'respond' && req.method === 'POST') {
    const me = await authenticate(req, env);
    if (!me) return text('unauthorized', 401);
    if (!(await shopCanSee(env, me, r))) return text('forbidden', 403);
    const existing = await env.DB.prepare('SELECT * FROM projects WHERE owner_id = ? AND request_id = ?').bind(me.id, r.id).first<{ id: string; name: string; created_at: number }>();
    if (existing) return json({ project: { id: existing.id, name: existing.name, createdAt: existing.created_at, role: 'owner', requestId: r.id } });
    const id = randomToken().slice(0, 16), name = `${r.store} 요청`.slice(0, 60), now = Date.now();
    await env.DB.prepare('INSERT INTO projects (id, owner_id, name, created_at, request_id) VALUES (?, ?, ?, ?, ?)').bind(id, me.id, name, now, r.id).run();
    return json({ project: { id, name, createdAt: now, role: 'owner', requestId: r.id } }, 201);
  }

  // ---- 고객 요청 페이지: GET /api/requests/:id?key= ----
  if (!m[2] && !m[4] && req.method === 'GET') {
    if (!(await customerOk(env, req, url, r, key))) return text('forbidden', 403);
    const rows = await env.DB.prepare('SELECT rr.proposal_url, rr.created_at, a.name, a.email FROM request_responses rr JOIN accounts a ON a.id = rr.account_id WHERE rr.request_id = ? ORDER BY rr.created_at')
      .bind(r.id).all<{ proposal_url: string; created_at: number; name: string; email: string }>();
    const shopName = (a: { name: string; email: string }) => a.name || a.email.split('@')[0];
    const approved = r.approved_by ? await env.DB.prepare('SELECT name, email FROM accounts WHERE id = ?').bind(r.approved_by).first<{ name: string; email: string }>() : null;
    return json({ request: { ...pubRequest(r), ...(approved ? { approvedShop: shopName(approved), approvedAt: r.approved_at } : {}) }, responses: rows.results.map((x) => ({ shop: shopName(x), proposalPath: x.proposal_url, createdAt: x.created_at })) });
  }
  return text('not found', 404);
}

/** 제안 링크 발급 시 호출 (projects.ts): 요청에서 만든 프로젝트면 응답 기록 — 요금 발생·홍보자 정산 근거, 이때부터 연락처 공개. proposalUrl = 서버 기준 경로 `/p/<project>/<token>` */
export async function recordResponse(env: Env, project: { id: string; owner_id: string; request_id?: string | null }, proposalUrl: string) {
  if (!project.request_id) return;
  await env.DB.prepare('INSERT INTO request_responses (request_id, account_id, project_id, proposal_url, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(request_id, account_id) DO UPDATE SET proposal_url = excluded.proposal_url, project_id = excluded.project_id')
    .bind(project.request_id, project.owner_id, project.id, proposalUrl, Date.now()).run();
}

/** 승인 시 호출 (index.ts): 요청에서 만든 프로젝트의 제안이 승인되면 요청을 승인됨으로 */
export async function markApproved(env: Env, projectId: string) {
  const p = await env.DB.prepare('SELECT owner_id, request_id FROM projects WHERE id = ?').bind(projectId).first<{ owner_id: string; request_id: string | null }>();
  if (!p?.request_id) return;
  await env.DB.prepare("UPDATE requests SET status = 'approved', approved_at = ?, approved_by = ? WHERE id = ?").bind(Date.now(), p.owner_id, p.request_id).run();
}

/** `?session=` 을 Authorization 으로 (img 태그는 헤더를 못 넣는다) */
function withSessionParam(req: Request, url: URL): Request {
  const s = url.searchParams.get('session');
  if (!s || req.headers.get('authorization')) return req;
  const h = new Headers(req.headers);
  h.set('authorization', `Bearer ${s}`);
  return new Request(req, { headers: h });
}
