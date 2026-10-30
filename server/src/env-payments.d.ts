// 정식 결제 시작 (2026-10-30): '1' 이면 카드 결제(토스) — 그 전엔 유료 버전 신청(결제 없이 서버가 요금제를 올림). wrangler var
interface Env {
  PAYMENTS_LIVE?: string;
}
