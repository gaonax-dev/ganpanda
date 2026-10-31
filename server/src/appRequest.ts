// 설치한 앱(Tauri)의 요청인가 — 앱 셸이 User-Agent 에 붙이는 토큰 (2026-10-31 서비스 차단 중 앱만 열기). auth.ts·index.ts 가 함께 쓴다(순환 import 피함)
export const APP_UA_TOKEN = 'Ganpanda-App/';
export const isAppRequest = (req: Request) => (req.headers.get('user-agent') ?? '').includes(APP_UA_TOKEN);
