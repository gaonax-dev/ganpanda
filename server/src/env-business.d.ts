// 국세청 사업자등록정보 API 키 (data.go.kr 일반 인증키 Decoding; 운영: wrangler secret, 로컬·E2E: .dev.vars 에 'fake' = 가짜 응답). 비어 있으면 사업자 확인을 끈다
interface Env {
  NTS_API_KEY: string;
}
