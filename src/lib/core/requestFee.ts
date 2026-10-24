// 요청 크레딧 (2026-10-24 사용자: "자동견적에 금액이 나오는데 이걸통해 금액을 산정해 0.3 정도는 어떤가?" → 0.3%, 최저 3,000 · 최고 50,000, 할증 없음)
// 서버 server/src/credit.ts 와 같은 규칙
export const FEE_RATE = 0.003;
export const FEE_MIN = 3_000;
export const FEE_MAX = 50_000;
/** 자동 견적 → 크레딧 (100원 단위 올림) */
export function requestFee(total: number | null | undefined): number {
  const t = typeof total === 'number' && Number.isFinite(total) && total > 0 ? total : 0;
  return Math.min(FEE_MAX, Math.max(FEE_MIN, Math.ceil((t * FEE_RATE) / 100) * 100));
}
