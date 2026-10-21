// 계정 사용량 (저장 용량·팀 멤버 수·이번 달 제안 건수) 과 한도
import { planOf } from './plans';

export async function storageUsed(env: Env, accountId: string): Promise<number> {
  const r = await env.DB.prepare('SELECT COALESCE(SUM(size), 0) AS n FROM account_assets WHERE account_id = ?').bind(accountId).first<{ n: number }>();
  return Number(r?.n ?? 0);
}

/** 이번 달(현지 아닌 UTC 달력) 1일 0시 */
export const monthStart = (now = Date.now()) => { const d = new Date(now); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1); };

/** 계정의 모든 프로젝트에서 이번 달 만든 제안 링크 수 */
export async function proposalsThisMonth(env: Env, accountId: string): Promise<number> {
  const r = await env.DB.prepare("SELECT COUNT(*) AS n FROM invites i JOIN projects p ON p.id = i.project_id WHERE p.owner_id = ? AND i.kind = 'proposal' AND i.created_at >= ?")
    .bind(accountId, monthStart()).first<{ n: number }>();
  return Number(r?.n ?? 0);
}

/** 설정의 팀 멤버 수 (소유자 제외) — 2026-10-21 요금제 한도 */
export async function membersOf(env: Env, accountId: string): Promise<number> {
  const r = await env.DB.prepare('SELECT COUNT(*) AS n FROM team_members WHERE owner_id = ?').bind(accountId).first<{ n: number }>();
  return Number(r?.n ?? 0);
}

export async function usageOf(env: Env, accountId: string, plan: string) {
  const p = planOf(plan);
  const [storageBytes, members, proposals] = await Promise.all([storageUsed(env, accountId), membersOf(env, accountId), proposalsThisMonth(env, accountId)]);
  return { limits: { storageBytes: p.storageBytes, members: p.members, proposalsPerMonth: p.proposalsPerMonth }, usage: { storageBytes, members, proposals } };
}
