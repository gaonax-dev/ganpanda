// 소셜 로그인 자격 (운영: wrangler secret, 로컬: .dev.vars). 비어 있으면 그 공급자는 숨긴다.
// 코드는 전역 Env 를 쓰므로 전역 인터페이스를 확장한다 (wrangler types 가 같은 이름을 만들어도 타입이 같아 충돌 없음)
interface Env {
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  KAKAO_CLIENT_ID: string;
  KAKAO_CLIENT_SECRET: string;
  APPLE_CLIENT_ID: string;
  APPLE_TEAM_ID: string;
  APPLE_KEY_ID: string;
  APPLE_PRIVATE_KEY: string;
}
