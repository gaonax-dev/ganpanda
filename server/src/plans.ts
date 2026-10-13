// 요금제 (기준표). 결제는 미구현 — accounts.plan 은 관리자가 바꾼다.
export interface Plan { name: string; storageBytes: number; seats: number; priceKrw: number }
const MB = 1024 * 1024;
const GB = 1024 * MB;

export const PLANS = {
  free: { name: '무료', storageBytes: 50 * MB, seats: 3, priceKrw: 0 },
  starter: { name: '스타터', storageBytes: 2 * GB, seats: 5, priceKrw: 50000 },
  pro: { name: '프로', storageBytes: 10 * GB, seats: 10, priceKrw: 100000 },
} as const satisfies Record<string, Plan>;

export type PlanId = keyof typeof PLANS;
export const planOf = (id: string): Plan => PLANS[(id in PLANS ? id : 'free') as PlanId];
