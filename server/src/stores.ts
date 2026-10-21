// 가게 사장의 사업자 (2026-10-22 사용자: "사업자등록확인 요청 대화식으로 등록증 요청 … 사업자 추가도 있어야한다. 선택가능하게"):
// 계정 하나에 여럿, 국세청 진위확인(번호·대표자·개업일)이 맞아야 저장. 사본은 사업자에 붙여 두고 그 사업자로 보낸 요청에 따라간다
import { authenticate } from './auth';
import { json, randomToken, readJson, text } from './http';
import { configured, validBizNo, validateBusiness } from './business';

export interface StoreRow { id: string; account_id: string; b_no: string; name: string; owner_name: string; start_dt: string; address: string; status: string | null; verified: number; doc: string | null; created_at: number }
export const storeDocKey = (id: string) => `stores/${id}/doc`;
const DOC_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);
const MAX_DOC = 8 * 1024 * 1024;
export const pubStore = (r: StoreRow) => ({ id: r.id, bizNo: r.b_no, name: r.name, ownerName: r.owner_name, startDate: r.start_dt, address: r.address, status: r.status, verified: !!r.verified, hasDoc: !!r.doc, createdAt: r.created_at });
export const getStore = (env: Env, id: string) => env.DB.prepare('SELECT * FROM stores WHERE id = ?').bind(id).first<StoreRow>();

export async function handleStores(req: Request, env: Env, pathname: string): Promise<Response> {
  const me = await authenticate(req, env);
  if (!me) return text('unauthorized', 401);
  if (pathname === '/api/me/stores') {
    if (req.method === 'GET') {
      const rows = (await env.DB.prepare('SELECT * FROM stores WHERE account_id = ? ORDER BY created_at DESC').bind(me.id).all<StoreRow>()).results;
      return json({ stores: rows.map(pubStore), configured: configured(env) });
    }
    if (req.method !== 'POST') return text('method not allowed', 405);
    const b = await readJson<{ bizNo?: string; ownerName?: string; startDate?: string; name?: string; address?: string }>(req);
    const no = typeof b?.bizNo === 'string' ? b.bizNo.replace(/\D/g, '') : '';
    const ownerName = typeof b?.ownerName === 'string' ? b.ownerName.trim().slice(0, 40) : '';
    const startDate = typeof b?.startDate === 'string' ? b.startDate.replace(/\D/g, '') : '';
    const name = typeof b?.name === 'string' ? b.name.trim().slice(0, 60) : '';
    const address = typeof b?.address === 'string' ? b.address.trim().slice(0, 200) : '';
    if (!validBizNo(no) || !ownerName || !/^\d{8}$/.test(startDate)) return json({ error: 'bad_input' }, 400);
    if (!configured(env)) return json({ error: 'not_configured' }, 503);
    const v = await validateBusiness(env, { b_no: no, p_nm: ownerName, start_dt: startDate, b_nm: '' }).catch(() => null); // 상호는 안 맞춘다 (표기 차이)
    if (!v) return json({ error: 'nts_unavailable' }, 502);
    if (!v.registered) return json({ error: 'not_registered' }, 400);
    if (!v.valid) return json({ error: 'mismatch' }, 400);
    if (v.status === 'closed') return json({ error: 'biz_closed' }, 400);
    const old = await env.DB.prepare('SELECT * FROM stores WHERE account_id = ? AND b_no = ?').bind(me.id, no).first<StoreRow>();
    const id = old?.id ?? randomToken().slice(0, 16), now = Date.now();
    if (old) await env.DB.prepare('UPDATE stores SET name = ?, owner_name = ?, start_dt = ?, address = ?, status = ?, verified = 1, created_at = ? WHERE id = ?').bind(name, ownerName, startDate, address, v.status, now, id).run();
    else await env.DB.prepare('INSERT INTO stores (id, account_id, b_no, name, owner_name, start_dt, address, status, verified, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)').bind(id, me.id, no, name, ownerName, startDate, address, v.status, now).run();
    return json({ store: pubStore((await getStore(env, id))!) }, old ? 200 : 201);
  }
  const m = pathname.match(/^\/api\/me\/stores\/([A-Za-z0-9_-]{16})(\/doc)?$/);
  if (!m) return text('not found', 404);
  const st = await getStore(env, m[1]);
  if (!st || st.account_id !== me.id) return text('not found', 404);
  if (m[2]) {
    if (req.method !== 'PUT') return text('method not allowed', 405);
    const type = (req.headers.get('content-type') ?? '').split(';')[0].trim();
    if (!DOC_TYPES.has(type)) return text('unsupported type', 415);
    const bytes = await req.arrayBuffer();
    if (!bytes.byteLength || bytes.byteLength > MAX_DOC) return text('bad size', 413);
    await env.ASSETS.put(storeDocKey(st.id), bytes, { httpMetadata: { contentType: type } });
    await env.DB.prepare('UPDATE stores SET doc = ? WHERE id = ?').bind(JSON.stringify({ type, size: bytes.byteLength }), st.id).run();
    return json({ ok: true });
  }
  if (req.method === 'DELETE') {
    await env.DB.prepare('DELETE FROM stores WHERE id = ?').bind(st.id).run();
    await env.ASSETS.delete(storeDocKey(st.id));
    return json({ ok: true });
  }
  return text('method not allowed', 405);
}
