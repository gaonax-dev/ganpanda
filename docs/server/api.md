# 서버 API

## 요약
`server/`는 화면이 없는 API 서버(Cloudflare Worker)입니다. 모든 응답에 CORS(`*`)를 붙입니다.

## 상태
구현됨 — `server/src/index.ts`. 계정·요금제 API는 계획입니다.

## 엔드포인트

| 메서드 | 경로 | 설명 | 응답 |
|---|---|---|---|
| GET | `/api/health` | 상태 확인 | `{ "ok": true }` |
| GET (WebSocket) | `/api/rooms/:room/ws` | 프로젝트 실시간 동기화 (y-websocket 호환) | 101 / 400 잘못된 방 이름 / 426 WebSocket 아님 |
| PUT | `/api/assets/:id` | 에셋 업로드 | 201 / 400 ID 형식·해시 불일치 / 413 25MB 초과 / 415 형식 불가 |
| GET, HEAD | `/api/assets/:id` | 에셋 다운로드·존재 확인 | 200 / 404 |
| OPTIONS | 모든 경로 | CORS 사전 요청 | 204 |

## 규칙
- 방 이름: `^[A-Za-z0-9_-]{6,64}$`
- 에셋 ID: `^[0-9a-f]{32}$` = 내용 SHA-256 앞 16바이트. 업로드할 때 서버가 다시 계산해 검증합니다.
- 허용 형식: png, jpeg, webp, gif, svg+xml, heic, pdf. 최대 25MB (`MAX_ASSET`).
- 다운로드 응답: `cache-control: immutable`(내용이 바뀌지 않으므로), `nosniff`, `content-security-policy: … sandbox` (SVG·PDF 안의 스크립트 실행 방지)
- WebSocket 메시지 형식 → [../architecture/sync.md](../architecture/sync.md)

## 계획 (미구현)
- 계정(카카오·구글·이메일), 프로젝트 생성·초대, 요금제 한도 → [../product/pricing.md](../product/pricing.md)
- 지금은 방 ID와 에셋 ID만 알면 누구나 접근할 수 있습니다. **인증 도입 전에는 공개 배포에 쓰지 않습니다.**

## 관련 테스트
- `server/test/sync.test.ts`, `server/test/assets.test.ts`
