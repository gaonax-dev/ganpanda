// 토스페이먼츠 (2026-10-23): API 개별 연동 키(자동결제). 운영: wrangler secret, 로컬·E2E: .dev.vars 에 TOSS_SECRET_KEY='fake' = 토스 호출 없이 가짜 응답.
// TOSS_SECRET_KEY 가 test_ 로 시작하면 테스트 결제 — TOSS_TEST_ALLOW_EMAILS(쉼표) 계정만 결제할 수 있다(비면 모두). BILLING_ENC_KEY = 빌링키 암호화 키(32바이트 hex)
interface Env {
  TOSS_CLIENT_KEY: string;
  TOSS_SECRET_KEY: string;
  BILLING_ENC_KEY: string;
  TOSS_TEST_ALLOW_EMAILS?: string;
}
