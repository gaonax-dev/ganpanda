// 요청 크레딧 (2026-10-24 사용자: "자동견적에 금액이 나오는데 이걸통해 금액을 산정해 0.3 정도는 어떤가?" → 0.3%, 최저 3,000 · 최고 50,000, 할증 없음)
// 앱 src/lib/core/requestFee.ts 와 같은 규칙
import type { Account } from './auth';
import { isOperator } from './operator';

export const FEE_RATE = 0.003;
export const FEE_MIN = 3_000;
export const FEE_MAX = 50_000;
/** 한 계정의 한 달(한국 시각) 크레딧 결제 한도 (2026-10-24 "한도 500만원") */
export const CREDIT_MONTH_LIMIT = 5_000_000;
/** 크레딧 결제가 켜져 있나 (wrangler vars REQUEST_CREDITS = "1") */
export const creditsOn = (env: Env) => String(env.REQUEST_CREDITS ?? '') === '1';
/** 자동 견적 → 크레딧 (100원 단위 올림) */
export function requestFee(total: number | null | undefined): number {
  const t = typeof total === 'number' && Number.isFinite(total) && total > 0 ? total : 0;
  return Math.min(FEE_MAX, Math.max(FEE_MIN, Math.ceil((t * FEE_RATE) / 100) * 100));
}
/** 보낸 자동 견적: 0 초과 100억 미만 정수만, 아니면 null */
export const cleanTotal = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v > 0 && v < 1e10 ? Math.round(v) : null);

/** 이 간판집에게 요청 사진이 열렸나: 제안을 보냈거나(request_responses) 운영자 */
export async function photosOpen(env: Env, me: Account, requestId: string): Promise<boolean> {
  if (isOperator(env, me.email)) return true;
  return !!(await env.DB.prepare('SELECT 1 FROM request_responses WHERE request_id = ? AND account_id = ?').bind(requestId, me.id).first());
}

/** 제안을 보낸 순간: 요청 보드의 사진을 그 간판집 계정에 등록 → 가져온 내 프로젝트에서 사진이 열린다 */
export async function unlockPhotos(env: Env, requestId: string, accountId: string) {
  const r = await env.DB.prepare('SELECT account_id, snapshot_photos FROM requests WHERE id = ?').bind(requestId).first<{ account_id: string | null; snapshot_photos: string | null }>();
  const ids = r?.snapshot_photos ? (JSON.parse(r.snapshot_photos) as string[]) : [];
  if (!r?.account_id || !ids.length) return;
  const rows = await env.DB.prepare(`SELECT asset_id, size FROM account_assets WHERE account_id = ? AND asset_id IN (${ids.map(() => '?').join(',')})`).bind(r.account_id, ...ids).all<{ asset_id: string; size: number }>();
  const now = Date.now();
  if (rows.results.length) await env.DB.batch(rows.results.map((x) => env.DB.prepare('INSERT OR IGNORE INTO account_assets (account_id, asset_id, size, created_at) VALUES (?, ?, ?, ?)').bind(accountId, x.asset_id, x.size, now)));
}
