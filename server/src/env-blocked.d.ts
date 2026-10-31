// 서비스 차단 (2026-10-31 사용자: "법적문제가 있다. 웹에서 접근을 차단한다."): '1' 이면 /api/health 만 빼고 모든 요청에 503. wrangler var — 해제는 "" 로 바꿔 배포
interface Env {
  SERVICE_BLOCKED?: string;
}
