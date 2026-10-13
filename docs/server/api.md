# 서버 API

## 요약
`server/`는 화면이 없는 API 서버(Cloudflare Worker)입니다. 모든 응답에 CORS(`*`)를 붙입니다.

## 상태
구현됨 — `server/src/index.ts`. 계정·요금제 API는 계획입니다.

## 엔드포인트

| 메서드 | 경로 | 설명 | 응답 |
|---|---|---|---|
| GET | `/api/health` | 상태 확인 | `{ "ok": true }` |
| GET (WebSocket) | `/api/rooms/:room` (또는 `/api/rooms/:room/ws`) | 프로젝트 실시간 동기화 (y-websocket 호환 — 클라이언트는 `/api/rooms/<room>`으로 접속) | 101 / 400 잘못된 방 이름 / 426 WebSocket 아님 |
| PUT | `/api/assets/:id` | 에셋 업로드 | 201 / 400 ID 형식·해시 불일치 / 413 25MB 초과 / 415 형식 불가 |
| GET, HEAD | `/api/assets/:id` | 에셋 다운로드·존재 확인 | 200 / 404 |
| OPTIONS | 모든 경로 | CORS 사전 요청 | 204 |
| POST | `/api/auth/email` `{email}` | 매직링크 요청 (링크 유효 15분, 1회용) | 202 `{ok}` (개발·테스트: `link` 포함) / 400 / 503 이메일 미설정 |
| POST | `/api/auth/verify` `{token}` | 링크 검증 → 계정 생성(최초)·세션 발급 | 200 `{session, account}` / 404 없음 / 410 만료·사용됨 |
| GET | `/api/me` | 내 계정 (`Authorization: Bearer <세션>`) | 200 `{account}` / 401 |
| PATCH | `/api/me` `{name}` | 표시 이름 변경 (40자) | 200 / 401 |
| POST | `/api/auth/logout` | 세션 삭제 | 204 / 401 |

## 규칙
- 방 이름: `^[A-Za-z0-9_-]{6,64}$`
- 에셋 ID: `^[0-9a-f]{32}$` = 내용 SHA-256 앞 16바이트. 업로드할 때 서버가 다시 계산해 검증합니다.
- 허용 형식: png, jpeg, webp, gif, svg+xml, heic, pdf. 최대 25MB (`MAX_ASSET`).
- 다운로드 응답: `cache-control: immutable`(내용이 바뀌지 않으므로), `nosniff`, `content-security-policy: … sandbox` (SVG·PDF 안의 스크립트 실행 방지)
- WebSocket 메시지 형식 → [../architecture/sync.md](../architecture/sync.md)

## 프로젝트·초대 (1-2b) — `Authorization: Bearer <세션>`
| 메서드 | 경로 | 설명 | 응답 |
|---|---|---|---|
| GET | `/api/projects` | 내 프로젝트 (최근 순) | `{projects}` |
| POST | `/api/projects` `{name}` | 프로젝트 생성 (id = 방 이름, 16자) | 201 `{project}` / 400 |
| PATCH | `/api/projects/:id` `{name}` | 이름 변경 (소유자) | 200 / 403 / 404 |
| DELETE | `/api/projects/:id` | 삭제 + 초대 폐기 (소유자) | 204 / 403 |
| GET | `/api/projects/:id/invites` | 초대 목록 (토큰은 돌려주지 않음, id = 해시 앞 16자) | `{invites}` |
| POST | `/api/projects/:id/invites` `{role: viewer\|editor}` | 초대 링크 생성 | 201 `{token, role, url}` / 400 |
| DELETE | `/api/projects/:id/invites/:inviteId` | 초대 폐기 | 204 |
| GET | `/api/invites/:token` | 초대 토큰 조회 (로그인 불필요) | `{project:{id,name}, role}` / 404 |
| GET | `/api/projects/:id/access` (`?invite=`) | 내 역할 확인 | `{role, project}` / 401 / 403 / 404 |
| POST | `/api/rooms/:id/messages` (`?invite=` 또는 세션) `{objectId, author, text, kind}` | 대화·코멘트 추가 (viewer 용, 서버가 문서에 기록) | 201 / 400 / 401 / 403 |

- WebSocket `/api/rooms/:id`는 `?session=<세션>` 또는 `?invite=<토큰>`으로 자격을 넘깁니다(브라우저 WebSocket 은 헤더를 못 넣음). 등록 안 된 방 404, 자격 없음 401, 다른 프로젝트 토큰 403.
- 역할: `owner`(소유자 세션) / `editor` / `viewer`. **viewer 소켓이 보낸 문서 변경은 서버가 버립니다**(동기화 요청만 처리). → [../features/projects-invites.md](../features/projects-invites.md)

## 인증 (1-2a)
- 세션은 90일 Bearer 토큰. 서버에는 SHA-256 해시만 저장(`sessions.token_hash`). 매직링크 토큰도 해시만 저장.
- 이메일은 소문자·공백 제거 후 저장. 계정 `plan` 기본값 `free`.
- `AUTH_DEV_LINK=1`(`.dev.vars`, 테스트 바인딩)이면 이메일 대신 응답에 링크를 넣습니다. 운영에는 설정하지 않습니다.
- 이메일 발송은 도메인 인증 뒤 Cloudflare Email 로 연결 예정. 그전에는 503.

## 계획 (미구현)
- 카카오·구글 로그인(1-2d), 요금제 한도·에셋 권한(1-2c) → [../product/pricing.md](../product/pricing.md)
- 방 접속은 1-2b 에서 권한 검사가 붙었습니다. 에셋은 아직 ID만 알면 받을 수 있습니다(ID 는 내용 해시 32자라 추측은 어렵지만, 1-2c 에서 프로젝트 기준 권한을 붙입니다).

## 관련 테스트
- `server/test/sync.test.ts`, `server/test/assets.test.ts`, `server/test/auth.test.ts`, `server/test/projects.test.ts`, `server/test/access.test.ts`
