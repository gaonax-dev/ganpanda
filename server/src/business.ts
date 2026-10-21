// 사업자 확인 (2026-10-21 결정 "사업자 등록으로 확인하는 건?" → 숨고·크몽 방식): 로그인(사람) 위에 얹는 "어느 사업체인가".
// 국세청 공공데이터 API(진위확인·상태조회)로 번호·대표자명·개업일을 확인해 계정에 붙인다. 계정 하나 = 사업자 하나, 번호는 계정 사이에 유일.
// 폐업은 월 1회 재조회(cron). 키 NTS_API_KEY (data.go.kr 일반 인증키 Decoding) — 'fake' 면 로컬·E2E 용 가짜 응답
import { authenticate } from './auth';
import { json, readJson, text } from './http';

const NTS = 'https://api.odcloud.kr/api/nts-businessman/v1';
/** 재조회 주기 (30일) */
export const RECHECK_MS = 30 * 24 * 60 * 60 * 1000;

export type BizStatus = 'active' | 'suspended' | 'closed';
export interface BusinessRow { b_no: string; account_id: string; owner_name: string; start_dt: string; name: string; status: BizStatus; verified_at: number; checked_at: number }
export interface BusinessPublic { no: string; name: string; ownerName: string; startDate: string; status: BizStatus; verifiedAt: number; checkedAt: number }

/** 국세청 호출 (테스트에서 가짜로 바꿔 끼운다) */
let ntsFetch: typeof fetch = (input, init) => fetch(input, init);
export function setNtsFetch(f: typeof fetch | null) { ntsFetch = f ?? ((input, init) => fetch(input, init)); }

export const configured = (env: Env) => !!env.NTS_API_KEY;
const toPublic = (r: BusinessRow): BusinessPublic => ({ no: r.b_no, name: r.name, ownerName: r.owner_name, startDate: r.start_dt, status: r.status, verifiedAt: r.verified_at, checkedAt: r.checked_at });
const statusOf = (cd: string | undefined): BizStatus | null => (cd === '01' ? 'active' : cd === '02' ? 'suspended' : cd === '03' ? 'closed' : null);
const isDigits = (s: unknown, n: number): s is string => typeof s === 'string' && new RegExp(`^\\d{${n}}$`).test(s);

/** 검증 자릿수 (core/business.ts 와 같은 알고리즘 — 서버는 앱 코드를 안 가져온다) */
export function validBizNo(d: string): boolean {
  if (!/^\d{10}$/.test(d)) return false;
  const w = [1, 3, 7, 1, 3, 7, 1, 3, 5];
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += Number(d[i]) * w[i];
  sum += Math.floor((Number(d[8]) * 5) / 10);
  return (10 - (sum % 10)) % 10 === Number(d[9]);
}

type Validate = { valid: boolean; status: BizStatus | null; registered: boolean };
/** 진위확인: 번호 + 대표자명 + 개업일 (+상호). 로컬 'fake' 키: 대표자명 '홍길동' 이면 일치, 999 로 시작하면 폐업 */
async function validate(env: Env, b: { b_no: string; p_nm: string; start_dt: string; b_nm: string }): Promise<Validate | null> {
  if (env.NTS_API_KEY === 'fake') return { valid: b.p_nm === '홍길동', status: b.b_no.startsWith('999') ? 'closed' : 'active', registered: true };
  const r = await ntsFetch(`${NTS}/validate?serviceKey=${encodeURIComponent(env.NTS_API_KEY)}&returnType=JSON`, {
    method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ businesses: [{ b_no: b.b_no, start_dt: b.start_dt, p_nm: b.p_nm, p_nm2: '', b_nm: b.b_nm, corp_no: '', b_sector: '', b_type: '', b_adr: '' }] }),
  });
  if (!r.ok) return null;
  const j = await r.json<{ data?: { valid?: string; status?: { b_stt_cd?: string; b_stt?: string } }[] }>();
  const d = j.data?.[0];
  if (!d) return null;
  const status = statusOf(d.status?.b_stt_cd);
  return { valid: d.valid === '01', status, registered: status !== null };
}

/** 상태조회 (여러 건, 100개까지) → 번호별 상태. 등록되지 않은 번호는 빠진다 */
export async function fetchStatuses(env: Env, nos: string[]): Promise<Map<string, BizStatus>> {
  const out = new Map<string, BizStatus>();
  if (!nos.length) return out;
  if (env.NTS_API_KEY === 'fake') { for (const n of nos) out.set(n, n.startsWith('999') ? 'closed' : 'active'); return out; }
  const r = await ntsFetch(`${NTS}/status?serviceKey=${encodeURIComponent(env.NTS_API_KEY)}&returnType=JSON`, {
    method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify({ b_no: nos.slice(0, 100) }),
  });
  if (!r.ok) return out;
  const j = await r.json<{ data?: { b_no: string; b_stt_cd?: string }[] }>();
  for (const d of j.data ?? []) { const s = statusOf(d.b_stt_cd); if (s) out.set(d.b_no, s); }
  return out;
}

export async function businessOf(env: Env, accountId: string): Promise<BusinessPublic | null> {
  const r = await env.DB.prepare('SELECT * FROM businesses WHERE account_id = ?').bind(accountId).first<BusinessRow>();
  return r ? toPublic(r) : null;
}

/** 월 1회 재조회 (cron): 오래된 것부터 100개. 폐업·휴업이면 상태만 바꾼다 (데이터는 그대로) */
export async function recheckBusinesses(env: Env, now = Date.now()): Promise<number> {
  if (!configured(env)) return 0;
  const rows = (await env.DB.prepare('SELECT b_no, status FROM businesses WHERE checked_at < ? ORDER BY checked_at LIMIT 100').bind(now - RECHECK_MS).all<{ b_no: string; status: BizStatus }>()).results;
  if (!rows.length) return 0;
  const st = await fetchStatuses(env, rows.map((r) => r.b_no));
  let n = 0;
  for (const r of rows) {
    const s = st.get(r.b_no);
    if (!s) continue; // 응답 없음 — 다음에
    await env.DB.prepare('UPDATE businesses SET status = ?, checked_at = ? WHERE b_no = ?').bind(s, now, r.b_no).run();
    n++;
  }
  return n;
}

export async function handleBusiness(req: Request, env: Env): Promise<Response> {
  const me = await authenticate(req, env);
  if (!me) return text('unauthorized', 401);
  if (req.method === 'GET') return json({ business: await businessOf(env, me.id), configured: configured(env) });
  if (req.method === 'DELETE') {
    await env.DB.prepare('DELETE FROM businesses WHERE account_id = ?').bind(me.id).run();
    return json({ business: null });
  }
  if (req.method !== 'PUT') return text('method not allowed', 405);
  if (!configured(env)) return json({ error: 'not_configured' }, 503);
  const b = await readJson<{ no?: string; ownerName?: string; startDate?: string; name?: string }>(req);
  const no = typeof b?.no === 'string' ? b.no.replace(/\D/g, '') : '';
  const ownerName = typeof b?.ownerName === 'string' ? b.ownerName.trim().slice(0, 40) : '';
  const startDate = typeof b?.startDate === 'string' ? b.startDate.replace(/\D/g, '') : '';
  const name = typeof b?.name === 'string' ? b.name.trim().slice(0, 60) : '';
  if (!validBizNo(no) || !ownerName || !isDigits(startDate, 8)) return json({ error: 'bad_input' }, 400);
  // 다른 계정이 이미 쓰는 번호 (체험·요금은 사업자당 1번)
  const taken = await env.DB.prepare('SELECT account_id FROM businesses WHERE b_no = ?').bind(no).first<{ account_id: string }>();
  if (taken && taken.account_id !== me.id) return json({ error: 'taken' }, 409);
  const v = await validate(env, { b_no: no, p_nm: ownerName, start_dt: startDate, b_nm: name });
  if (!v) return json({ error: 'nts_unavailable' }, 502);
  if (!v.registered) return json({ error: 'not_registered' }, 400);
  if (!v.valid) return json({ error: 'mismatch' }, 400);
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare('DELETE FROM businesses WHERE account_id = ?').bind(me.id),
    env.DB.prepare('INSERT INTO businesses (b_no, account_id, owner_name, start_dt, name, status, verified_at, checked_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(no, me.id, ownerName, startDate, name, v.status ?? 'active', now, now),
  ]);
  return json({ business: await businessOf(env, me.id) });
}
