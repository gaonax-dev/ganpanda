// 요금제 (기준표, 2026-10-17 개편). 결제는 미구현 — accounts.plan 은 관리자가 바꾼다.
// 멤버 = 설정에서 소유자가 추가한 팀 멤버 수(소유자 제외). 2026-10-21 사용자: "동시접속이라고 했는데 맴버가입수이다" — 동시 접속 좌석 제한은 없앴다.
// 무료 2명, 베이직 5명, 프로 10명(2026-10-21 "베이직 5명 프로 10명" — 같은 날의 1.5배 3·8명을 대체). 무료 용량 500MB → 100MB.
// 무료는 제안 링크 월 건수와 제안 페이지 브랜딩으로 구분한다.
export interface Plan {
  name: string;
  storageBytes: number;
  /** 팀 멤버 수 한도 (소유자 제외) */
  members: number;
  /** 사용자 버전 기록·되돌리기 (2026-10-21): 보이는 기간(일, 0 = 없음), 직접 저장한 버전은 기간과 무관하게 계속 */
  versionDays: number;
  manualForever: boolean;
  /** 한 달 제안 링크 건수. null = 무제한 */
  proposalsPerMonth: number | null;
  /** 제안 페이지에 "간판다로 만든 제안" 표시 */
  branding: boolean;
  priceKrw: number;
}
const MB = 1024 * 1024;
const GB = 1024 * MB;

export const PLANS = {
  free: { name: '무료', storageBytes: 100 * MB, members: 2, versionDays: 0, manualForever: false, proposalsPerMonth: 3, branding: true, priceKrw: 0 },
  basic: { name: '베이직', storageBytes: 5 * GB, members: 5, versionDays: 7, manualForever: false, proposalsPerMonth: null, branding: false, priceKrw: 30000 },
  pro: { name: '프로', storageBytes: 20 * GB, members: 10, versionDays: 30, manualForever: true, proposalsPerMonth: null, branding: false, priceKrw: 60000 },
} as const satisfies Record<string, Plan>;

export type PlanId = keyof typeof PLANS;
/** 옛 요금제 id 는 가까운 것으로 (starter → basic). 모르는 값은 무료 */
const ALIAS: Record<string, PlanId> = { starter: 'basic' };
export const planOf = (id: string): Plan => PLANS[(id in PLANS ? id : ALIAS[id] ?? 'free') as PlanId];
