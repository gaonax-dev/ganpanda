// 계정 사용량 (저장 용량·좌석) 과 한도
import { planOf } from './plans';

export async function storageUsed(env: Env, accountId: string): Promise<number> {
  const r = await env.DB.prepare('SELECT COALESCE(SUM(size), 0) AS n FROM account_assets WHERE account_id = ?').bind(accountId).first<{ n: number }>();
  return Number(r?.n ?? 0);
}

export async function usageOf(env: Env, accountId: string, plan: string) {
  const p = planOf(plan);
  const [storageBytes, seats] = await Promise.all([storageUsed(env, accountId), env.ACCOUNT.getByName(accountId).usedSeats()]);
  return { limits: { storageBytes: p.storageBytes, seats: p.seats }, usage: { storageBytes, seats } };
}
