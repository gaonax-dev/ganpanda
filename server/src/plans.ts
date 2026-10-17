// 요금제 (기준표, 2026-10-17 개편). 결제는 미구현 — accounts.plan 은 관리자가 바꾼다.
// 좌석 = 동시에 작업하는 사람(소유자·직원). 고객(viewer 초대) 열람은 세지 않는다 — 제안 링크가 퍼지는 길을 막지 않기 위해.
// 무료는 제안 링크 월 건수와 제안 페이지 브랜딩으로 구분한다.
export interface Plan {
  name: string;
  storageBytes: number;
  /** 동시 작업 인원 (소유자 포함, 직원 = editor 초대·세션) */
  seats: number;
  /** 한 달 제안 링크 건수. null = 무제한 */
  proposalsPerMonth: number | null;
  /** 제안 페이지에 "간판다로 만든 제안" 표시 */
  branding: boolean;
  priceKrw: number;
}
const MB = 1024 * 1024;
const GB = 1024 * MB;

export const PLANS = {
  free: { name: '무료', storageBytes: 500 * MB, seats: 1, proposalsPerMonth: 3, branding: true, priceKrw: 0 },
  basic: { name: '베이직', storageBytes: 5 * GB, seats: 2, proposalsPerMonth: null, branding: false, priceKrw: 30000 },
  pro: { name: '프로', storageBytes: 20 * GB, seats: 5, proposalsPerMonth: null, branding: false, priceKrw: 60000 },
} as const satisfies Record<string, Plan>;

export type PlanId = keyof typeof PLANS;
/** 옛 요금제 id 는 가까운 것으로 (starter → basic). 모르는 값은 무료 */
const ALIAS: Record<string, PlanId> = { starter: 'basic' };
export const planOf = (id: string): Plan => PLANS[(id in PLANS ? id : ALIAS[id] ?? 'free') as PlanId];
