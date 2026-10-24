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
import { businessOf } from './business';
import { cloneRoom } from './snapshot';
import { newRoomId, type ProjectRow } from './projects';

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
  /** 보드 복제 요청 프로젝트와 그 사진 에셋 id JSON (2026-10-22) */
  snapshot_project?: string | null; snapshot_photos?: string | null;
  /** 간판집이 다른 업체에 보낸 외주 요청 (2026-10-22) */
  b2b?: number;
  /** 가게 사장이 고른 간판집 프로젝트 (2026-10-22) */
  chosen_project?: string | null;
}
const bizDocOf = (r: RequestRow): { type: string; size: number } | null => { try { return r.biz_doc ? (JSON.parse(r.biz_doc) as { type: string; size: number }) : null; } catch { return null; } };
const bizDocKey = (id: string) => `requests/${id}/biz-doc`;
const DOC_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);
const snapshotPhotos = (r: RequestRow): string[] => { try { return JSON.parse(r.snapshot_photos || '[]') as string[]; } catch { return []; } };
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
export async function shopCanSee(env: Env, me: Account, r: RequestRow): Promise<boolean> {
  const responded = await env.DB.prepare('SELECT 1 FROM projects WHERE owner_id = ? AND request_id = ?').bind(me.id, r.id).first();
  if (responded) return true;
  if (r.status === 'open' && isOperator(env, me.email)) return true;
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

/** 알림 메일에서 간판집이 여는 주소 (2026-10-22 "견적요청알림으로 견적요청카드에 해당 뷰를 볼수 없다"): 요청 보드(복제)가 있으면 그 보드, 없으면 받은 요청 페이지 */
export const shopRequestLink = (env: Pick<Env, 'APP_URL'>, r: Pick<RequestRow, 'id' | 'snapshot_project'>) =>
  r.snapshot_project ? `${appUrl(env as Env)}/?room=${r.snapshot_project}&request=${r.id}` : `${appUrl(env as Env)}/requests`;

/** 요청 알림 메일 (운영: Email Sending). 로컬·테스트는 EMAIL 이 없어 건너뜀. 실패해도 요청은 만들어진다 */
async function notify(env: Env, r: RequestRow, url: string) {
  if (!env.EMAIL) return;
  const shops = await env.DB.prepare("SELECT email, regions FROM accounts WHERE receive_requests = 1 AND regions <> ''").all<{ email: string; regions: string }>();
  const hit = shops.results.filter((s) => regionsOf(s).some((g) => regionMatches(g, r.region)));
  const to = new Set([...hit.map((s) => s.email), ...operatorEmails(env)]); // 운영자는 항상 (지역에 간판집이 없는 동안 수동 처리)
  for (const s of [...to].map((email) => ({ email }))) {
    try {
      await env.EMAIL.send({ to: s.email, from: FROM, subject: `[간판다] ${r.region} 간판 견적 요청 — ${r.store}`,
        text: `${r.region}에서 간판 견적 요청이 왔습니다.\n\n가게: ${r.store}\n내용: ${r.text || '(없음)'}\n\n요청 보기 (사진·사인물 그대로, [견적 넣기]): ${shopRequestLink(env, r)}\n견적을 넣으면 고객 연락처가 보입니다.` });
    } catch { /* 한 곳 실패가 다른 곳을 막지 않게 */ }
  }
  if (r.email) {
    try {
      await env.EMAIL.send({ to: r.email, from: FROM, subject: `[간판다] ${r.store} 간판 견적 요청을 받았습니다`,
        text: `요청이 접수되었습니다. 간판사들의 제안이 오면 아래 페이지에서 볼 수 있습니다 (이 주소를 저장해 두세요):\n${url}` });
    } catch { /* 고객 메일 실패는 무시 */ }
  }
}

const pubRequest = (r: RequestRow) => ({ id: r.id, store: r.store, region: r.region, text: r.text, status: r.status, createdAt: r.created_at, general: !!r.general, b2b: !!r.b2b, ...(r.chosen_project ? { chosenProject: r.chosen_project } : {}), ...(r.cancelled_at ? { cancelledAt: r.cancelled_at } : {}), ...(r.snapshot_project ? { snapshot: { project: r.snapshot_project, photos: snapshotPhotos(r) } } : {}), photos: photosOf(r).map(({ n, type }) => ({ n, type })), signs: signsOf(r), address: r.address ?? '', bizNo: r.biz_no ?? null, bizStatus: r.biz_status ?? null, bizDoc: bizDocOf(r), bizVerified: !!r.biz_verified, ownerName: r.owner_name ?? null });

export async function handleRequests(req: Request, env: Env, pathname: string, url: URL): Promise<Response> {
  // ---- 간판사 설정: PUT /api/me/request-settings {receive, regions[]} ----
  if (pathname === '/api/me/request-settings') {
    const me = await authenticate(req, env);
    if (!me) return text('unauthorized', 401);
    if (req.method !== 'PUT') return text('method not allowed', 405);
    const body = await readJson<{ receive?: boolean; regions?: string[] }>(req);
    if (!body || typeof body.receive !== 'boolean' || !Array.isArray(body.regions) || body.regions.some((g) => typeof g !== 'string')) return text('bad body', 400);
    // 사업장 주소의 지역이 언제나 맨 앞 (2026-10-24 "요청 지역설정을 사업자 주소로 먼저 설정하고 나머지는 원하는 지역을 … 체크방식으로")
    const home = (await businessOf(env, me.id))?.region ?? '';
    const regions = [...new Set([home, ...body.regions].map((g) => g.trim().slice(0, REGION_MAX)).filter(Boolean))].slice(0, 20);
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
    const b = await readJson<{ store?: string; region?: string; text?: string; phone?: string; email?: string; ref?: string; signs?: unknown; address?: string; bizNo?: string; ownerName?: string; startDate?: string; bizDocPending?: boolean; storeId?: string; general?: boolean; fromProject?: string; accountBusiness?: boolean }>(req);
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
    // 간판집 자신의 확인된 사업자(설정 "사업자 확인", businesses)로 (2026-10-22 외주 요청)
    const accBiz = !st && b?.accountBusiness === true ? await businessOf(env, me.id) : null;
    if (b?.accountBusiness === true && !st && (!accBiz || accBiz.status === 'closed')) return json({ error: 'no_business' }, 400);
    const general = !st && !accBiz && b?.general === true; // 일반 주문 (사업자 없음, 2026-10-22)
    // 보드 복제 (2026-10-22): 내 견적 초안 방만
    const draft = typeof b?.fromProject === 'string' ? await env.DB.prepare('SELECT * FROM projects WHERE id = ?').bind(b.fromProject).first<ProjectRow>() : null;
    // 소비자 견적 초안 방, 또는 간판집의 외주 프로젝트(B2B, 2026-10-22)
    if (b?.fromProject !== undefined && (!draft || draft.owner_id !== me.id || (draft.kind !== 'estimate' && !draft.outsource))) return json({ error: 'bad_project' }, 400);
    const b2b = !!draft?.outsource && draft.kind !== 'estimate';
    // 주소(선택)·사업자번호(선택, 2026-10-21 "둘다 작성"): 번호만 국세청 상태조회 → 폐업은 거절, 미등록 거절, 조회 불가면 확인 없이 받는다
    const address = typeof b?.address === 'string' && b.address.trim() ? b.address.trim().slice(0, 200) : st?.address ?? '';
    const bizNo = accBiz ? accBiz.no : st ? st.b_no : typeof b?.bizNo === 'string' ? b.bizNo.replace(/\D/g, '') : '';
    let bizStatus: string | null = accBiz ? accBiz.status : st ? st.status : null, bizVerified = st || accBiz ? 1 : 0;
    // 검증 요소 (2026-10-21 "사본이 없으면 직접입력 … 필요한 검증 요소만"): 사본을 올리거나(bizDocPending), 번호·대표자명·개업일로 국세청 진위확인
    const ownerName = accBiz ? accBiz.ownerName : st ? st.owner_name : typeof b?.ownerName === 'string' ? b.ownerName.trim().slice(0, 40) : '';
    const startDate = accBiz ? accBiz.startDate : st ? st.start_dt : typeof b?.startDate === 'string' ? b.startDate.replace(/\D/g, '') : '';
    const manual = !st && !accBiz && !!(bizNo && ownerName && /^\d{8}$/.test(startDate));
    if (!st && !accBiz && !general && !manual && !b?.bizDocPending) return json({ error: 'verification_required' }, 400);
    if (bizNo && !st && !accBiz) {
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
      store_id: st?.id ?? null, general: general ? 1 : 0, prev_id: null, b2b: b2b ? 1 : 0,
    };
    // 사업자의 사본이 있으면 요청에 복사 (제안 보낸 간판집만 연다)
    if (st?.doc) {
      const obj = await env.ASSETS.get(storeDocKey(st.id));
      if (obj) { const meta = JSON.parse(st.doc) as { type: string; size: number }; await env.ASSETS.put(bizDocKey(id), await obj.arrayBuffer(), { httpMetadata: { contentType: meta.type } }); row.biz_doc = st.doc; }
    }
    await env.DB.prepare('INSERT INTO requests (id, key_hash, store, region, text, phone, email, ref, photos, status, created_at, signs, account_id, address, biz_no, biz_status, owner_name, start_date, biz_verified, store_id, general, prev_id, biz_doc, b2b) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(row.id, row.key_hash, row.store, row.region, row.text, row.phone, row.email, row.ref, row.photos, row.status, row.created_at, row.signs, row.account_id, row.address, row.biz_no, row.biz_status, row.owner_name, row.start_date, row.biz_verified, row.store_id, row.general, row.prev_id, row.biz_doc ?? null, row.b2b ?? 0).run();
    // 요청 프로젝트 = 견적 초안 방의 읽기 전용 복제: 사진은 다시 올리지 않는다 (이미 이 계정의 에셋)
    let snapshotProject: string | undefined;
    if (draft) {
      snapshotProject = newRoomId();
      await env.DB.prepare("INSERT INTO projects (id, owner_id, name, created_at, kind) VALUES (?, ?, ?, ?, 'request')").bind(snapshotProject, me.id, `${store} 요청서`.slice(0, 60), Date.now()).run();
      const c = await cloneRoom(env, draft, { id: snapshotProject, owner_id: me.id }, ['photos', 'objects', 'sources', 'settings']); // 설정은 보드 배치만
      await env.DB.prepare('UPDATE requests SET snapshot_project = ?, snapshot_photos = ? WHERE id = ?').bind(snapshotProject, JSON.stringify(c.photoAssets), id).run();
      row.snapshot_project = snapshotProject; row.snapshot_photos = JSON.stringify(c.photoAssets);
    }
    const pageUrl = `${appUrl(env)}/r/${id}?key=${key}`;
    await notify(env, row, pageUrl);
    return json({ id, key, url: pageUrl, ...(snapshotProject ? { snapshotProject } : {}) }, 201);
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
    const answered = byReq.size ? (await env.DB.prepare(`SELECT * FROM requests WHERE id IN (${[...byReq.keys()].map(() => '?').join(',')})`).bind(...byReq.keys()).all<RequestRow>()).results : [];
    const all = new Map<string, RequestRow>();
    // 내가 보낸 요청(외주)은 받은 목록에 안 나온다. 가게 사장이 확정한 요청도 사라진다 (2026-10-22) — 고른 간판집은 자기 프로젝트에서, 떨어진 간판집은 "다른 업체 선택" 배지로
    for (const r of [...open, ...answered]) if (r.account_id !== me.id && r.status !== 'approved') all.set(r.id, r);
    const requests = [...all.values()].sort((a, b) => b.created_at - a.created_at).map((r) => {
      const m = byReq.get(r.id);
      // 연락처는 제안 링크를 보낸(요금이 발생한) 요청에만 (숨고식: 제안이 곧 연락처)
      return { ...pubRequest(r), responded: !!m?.proposal_url, ...(m ? { projectId: m.project_id } : {}), ...(m?.proposal_url ? { phone: r.phone, ...(r.email ? { email: r.email } : {}) } : {}) };
    });
    return json({ requests });
  }

  const m = pathname.match(/^\/api\/requests\/([A-Za-z0-9_-]{16})(?:\/(photos|biz-doc)(?:\/(\d+))?|\/(respond|cancel|choose|board))?$/);
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

  // ---- 취소: POST /api/requests/:id/cancel (고객, 2026-10-22) — 요청을 닫기만 한다 ("취소만 남기고 환불 재요청 빼줘": 제안한 간판집은 이미 연락처를 받았다).
  // 열린 요청만. 닫힌 요청은 새 간판집 목록에서 빠지고 제안을 못 만든다. 제안했던 간판집에 알림
  if (m[4] === 'cancel' && req.method === 'POST') {
    if (!(await customerOk(env, req, url, r, key))) return text('forbidden', 403);
    if (r.status !== 'open') return json({ error: 'not_open', status: r.status }, 409);
    await env.DB.prepare("UPDATE requests SET status = 'cancelled', cancelled_at = ? WHERE id = ?").bind(Date.now(), r.id).run();
    if (env.EMAIL) {
      const shops = await env.DB.prepare('SELECT a.email FROM request_responses rr JOIN accounts a ON a.id = rr.account_id WHERE rr.request_id = ?').bind(r.id).all<{ email: string }>();
      for (const s of shops.results) {
        try { await env.EMAIL.send({ to: s.email, from: FROM, subject: `[간판다] 견적 요청 취소 — ${r.store}`, text: `${r.store}의 견적 요청이 닫혔습니다. 이미 받은 연락처로 진행 중이던 이야기는 가게 사장님과 직접 이어 가세요.` }); } catch { /* 무시 */ }
      }
    }
    return json({ ok: true });
  }

  // ---- 실측 보기: POST /api/requests/:id/board (간판사) → 읽기 전용 요청 프로젝트 id (2026-10-22 "실측보기 눌렀는데 프로젝트 안열린다" → "그냥 프로젝트 열어주면되 소비자의 프로젝트를") ----
  // 복제가 있으면 그것, 없는 옛 요청은 그 가게 사장의 견적 프로젝트를 지금 복제해 붙인다(한 번만)
  if (m[4] === 'board' && req.method === 'POST') {
    const me = await authenticate(req, env);
    if (!me) return text('unauthorized', 401);
    if (!(await shopCanSee(env, me, r))) return text('forbidden', 403);
    if (r.snapshot_project) return json({ project: r.snapshot_project });
    const draft = r.account_id ? await env.DB.prepare("SELECT * FROM projects WHERE owner_id = ? AND kind = 'estimate' ORDER BY created_at LIMIT 1").bind(r.account_id).first<ProjectRow>() : null;
    if (!draft) return json({ error: 'no_board' }, 404);
    const snap = newRoomId();
    await env.DB.prepare("INSERT INTO projects (id, owner_id, name, created_at, kind) VALUES (?, ?, ?, ?, 'request')").bind(snap, draft.owner_id, `${r.store} 요청서`.slice(0, 60), Date.now()).run();
    const c = await cloneRoom(env, draft, { id: snap, owner_id: draft.owner_id }, ['photos', 'objects', 'sources', 'settings']);
    await env.DB.prepare('UPDATE requests SET snapshot_project = ?, snapshot_photos = ? WHERE id = ?').bind(snap, JSON.stringify(c.photoAssets), r.id).run();
    return json({ project: snap });
  }

  // ---- 확정: POST /api/requests/:id/choose {projectId} (고객, 2026-10-22) — 제안을 보낸 간판집 중 하나 ----
  if (m[4] === 'choose' && req.method === 'POST') {
    if (!(await customerOk(env, req, url, r, key))) return text('forbidden', 403);
    if (r.status === 'cancelled') return json({ error: 'cancelled' }, 409);
    const b = await readJson<{ projectId?: string }>(req);
    const rr = typeof b?.projectId === 'string' ? await env.DB.prepare('SELECT account_id, project_id FROM request_responses WHERE request_id = ? AND project_id = ?').bind(r.id, b.projectId).first<{ account_id: string; project_id: string }>() : null;
    if (!rr) return json({ error: 'bad_project' }, 400);
    await chooseShop(env, r.id, rr.project_id, rr.account_id);
    return json({ ok: true });
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
    // 가져오기 방식 (2026-10-22 "복제해서 자기 프로젝트로 가져오는건 옵션으로 보통 새로 만들경우도 있어서"): copy = 사진·사인물째(기본), photos = 사진만, blank = 빈 프로젝트
    const mode = (await readJson<{ mode?: string }>(req))?.mode;
    if (r.snapshot_project && mode !== 'blank') {
      const snap = await env.DB.prepare('SELECT * FROM projects WHERE id = ?').bind(r.snapshot_project).first<ProjectRow>();
      if (snap) await cloneRoom(env, snap, { id, owner_id: me.id }, mode === 'photos' ? ['photos'] : ['photos', 'objects', 'sources']);
    }
    return json({ project: { id, name, createdAt: now, role: 'owner', requestId: r.id } }, 201);
  }

  // ---- 고객 요청 페이지: GET /api/requests/:id?key= ----
  if (!m[2] && !m[4] && req.method === 'GET') {
    if (!(await customerOk(env, req, url, r, key))) return text('forbidden', 403);
    const rows = await env.DB.prepare('SELECT rr.proposal_url, rr.created_at, rr.project_id, a.name, a.email FROM request_responses rr JOIN accounts a ON a.id = rr.account_id WHERE rr.request_id = ? ORDER BY rr.created_at')
      .bind(r.id).all<{ proposal_url: string; created_at: number; project_id: string; name: string; email: string }>();
    const shopName = (a: { name: string; email: string }) => a.name || a.email.split('@')[0];
    const approved = r.approved_by ? await env.DB.prepare('SELECT name, email FROM accounts WHERE id = ?').bind(r.approved_by).first<{ name: string; email: string }>() : null;
    return json({ request: { ...pubRequest(r), ...(approved ? { approvedShop: shopName(approved), approvedAt: r.approved_at } : {}) }, responses: rows.results.map((x) => ({ shop: shopName(x), proposalPath: x.proposal_url, createdAt: x.created_at, projectId: x.project_id })) });
  }
  return text('not found', 404);
}

/** 제안 링크 발급 시 호출 (projects.ts): 요청에서 만든 프로젝트면 응답 기록 — 요금 발생·홍보자 정산 근거, 이때부터 연락처 공개. proposalUrl = 서버 기준 경로 `/p/<project>/<token>` */
export async function recordResponse(env: Env, project: { id: string; owner_id: string; request_id?: string | null }, proposalUrl: string) {
  if (!project.request_id) return;
  await env.DB.prepare('INSERT INTO request_responses (request_id, account_id, project_id, proposal_url, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(request_id, account_id) DO UPDATE SET proposal_url = excluded.proposal_url, project_id = excluded.project_id')
    .bind(project.request_id, project.owner_id, project.id, proposalUrl, Date.now()).run();
}

/**
 * 간판집 확정 (2026-10-22 "소비자가 간판집을 제안 리스트에서 확정을 선택하면 견적요청에서 사라지고 탈락한 업체의 복제된 프로젝트에 배지를 달아 다른 곳에서 진행하게 된것을 알린다.
 * 다만 변심으로 다시 시작할 수 있음으로 정지 처리 안내한다"): 요청은 승인됨(받은 목록에서 빠짐), 고른 프로젝트는 lost 해제,
 * 같은 요청의 다른 간판집 프로젝트는 lost_at + 정지(완료가 아니면) + 메일. 다시 다른 곳을 고르면(변심) 그대로 바뀐다
 */
export async function chooseShop(env: Env, requestId: string, projectId: string, ownerId: string) {
  const now = Date.now();
  const losers = (await env.DB.prepare('SELECT p.id, a.email FROM projects p JOIN accounts a ON a.id = p.owner_id WHERE p.request_id = ? AND p.id <> ? AND p.lost_at IS NULL').bind(requestId, projectId).all<{ id: string; email: string }>()).results;
  await env.DB.batch([
    env.DB.prepare("UPDATE requests SET status = 'approved', approved_at = ?, approved_by = ?, chosen_project = ? WHERE id = ?").bind(now, ownerId, projectId, requestId),
    env.DB.prepare('UPDATE projects SET lost_at = NULL WHERE id = ?').bind(projectId),
    env.DB.prepare("UPDATE projects SET lost_at = ?, status = CASE WHEN status = 'done' THEN status ELSE 'paused' END, status_at = ? WHERE request_id = ? AND id <> ? AND lost_at IS NULL").bind(now, now, requestId, projectId),
  ]);
  if (env.EMAIL) {
    const r = await getRequest(env, requestId);
    for (const l of losers) {
      try { await env.EMAIL.send({ to: l.email, from: FROM, subject: `[간판다] ${r?.store ?? ''} — 다른 간판집으로 정해졌습니다`, text: `${r?.store ?? '가게'} 사장님이 다른 간판집과 진행하기로 했습니다. 마음을 바꿔 다시 연락할 수 있어 프로젝트는 지우지 않고 "정지"로 두었습니다.` }); } catch { /* 무시 */ }
    }
  }
}

/** 승인 시 호출 (index.ts): 요청에서 만든 프로젝트의 제안이 승인되면 그 간판집으로 확정 */
export async function markApproved(env: Env, projectId: string) {
  const p = await env.DB.prepare('SELECT owner_id, request_id FROM projects WHERE id = ?').bind(projectId).first<{ owner_id: string; request_id: string | null }>();
  if (!p?.request_id) return;
  await chooseShop(env, p.request_id, projectId, p.owner_id);
}

/** `?session=` 을 Authorization 으로 (img 태그는 헤더를 못 넣는다) */
function withSessionParam(req: Request, url: URL): Request {
  const s = url.searchParams.get('session');
  if (!s || req.headers.get('authorization')) return req;
  const h = new Headers(req.headers);
  h.set('authorization', `Bearer ${s}`);
  return new Request(req, { headers: h });
}
