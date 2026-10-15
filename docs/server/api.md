# 서버 API

## 요약
`server/`는 화면이 없는 API 서버(Cloudflare Worker)입니다. 모든 응답에 CORS(`*`)를 붙입니다.

## 상태
구현됨 — `server/src/index.ts`. 계정·요금제 API는 계획입니다.

## 엔드포인트

| 메서드 | 경로 | 설명 | 응답 |
|---|---|---|---|
| GET | `/api/health` | 상태 확인 | `{ "ok": true }` |
| GET (WebSocket) | `/api/rooms/:room` (또는 `/ws`) `?session=`\|`?invite=&guest=` | 프로젝트 실시간 동기화 (y-websocket 호환) | 101 / 400 방 이름 / 401·403·404 권한 / **429 `{error:'seat_limit', used, limit}`** 동시접속 한도 / 426 |
| PUT | `/api/assets/:id` `?project=&session\|invite` | 에셋 업로드 (viewer 포함 — 대화 첨부용). 사용량은 프로젝트 소유 계정에 | 201 / 400 ID·해시 / 401·403 권한 / 413 25MB 초과 또는 **`{error:'storage_limit', limitBytes, usedBytes, sizeBytes}`** / 415 |
| GET, HEAD | `/api/assets/:id` `?project=&session\|invite` | 에셋 다운로드·존재 확인 (viewer 포함, 소유 계정에 등록된 에셋만) | 200 / 403 / 404 |
| OPTIONS | 모든 경로 | CORS 사전 요청 | 204 |
| GET, HEAD | `/api/models/*` | AI 모델 파일 (R2 `models/` 아래, 공개·`immutable` 캐시, 경로 탈출 400) | 200 / 404 |
| POST | `/api/auth/email` `{email}` | 매직링크 요청 (링크 유효 15분, 1회용) | 202 `{ok}` (개발·테스트: `link` 포함) / 400 / 503 이메일 미설정 |
| POST | `/api/auth/verify` `{token}` | 링크 검증 → 계정 생성(최초)·세션 발급 | 200 `{session, account}` / 404 없음 / 410 만료·사용됨 |
| GET | `/api/auth/providers` | 자격이 설정된 소셜 공급자 | `{providers:[…]}` |
| GET | `/api/auth/{kakao\|google\|apple}/start?next=` | 소셜 로그인 시작 (302 → 공급자) | 302 / 400 next 형식 / 503 미설정 |
| GET·POST | `/api/auth/{p}/callback` | 공급자 콜백 (애플은 POST form) → 302 `APP_URL/login#session=…&next=…` | 302 / 400 state / 502 공급자 오류 |
| GET | `/api/me` | 내 계정 + 한도·사용량 + 기본 단가표 (`Authorization: Bearer <세션>`) | 200 `{account, prices, limits:{…}, usage:{…}}` / 401 |
| PATCH | `/api/me` `{name}` | 표시 이름 변경 (40자) | 200 / 401 |
| GET·PUT | `/api/me/prices` `{prices}` | 계정 기본 단가표 (JSON, 형식·크기만 검사: version 1, 숫자 ≥0, 키 100개·20KB 이하) | 200 / 400 / 401 |
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
| GET | `/api/projects` | 내 프로젝트 (최근 순; `groupId, status, contractAmount, paidAmount` 포함) | `{projects}` |
| POST | `/api/projects` `{name}` | 프로젝트 생성 (id = 방 이름, 16자) | 201 `{project}` / 400 |
| PATCH | `/api/projects/:id` `{name}` | 이름 변경 (소유자) | 200 / 403 / 404 |
| DELETE | `/api/projects/:id` | 삭제 + 초대 폐기 (소유자) | 204 / 403 |
| GET | `/api/projects/:id/invites` | 초대 목록 (토큰은 돌려주지 않음, id = 해시 앞 16자) | `{invites}` |
| POST | `/api/projects/:id/invites` `{role: viewer\|editor}` | 초대 링크 생성 | 201 `{token, role, url}` / 400 |
| DELETE | `/api/projects/:id/invites/:inviteId` | 초대 폐기 | 204 |
| PATCH | `/api/projects/:id` `{name?, groupId?: id\|null, status?: waiting\|ongoing\|done, contractAmount?: number\|null, paidAmount?, quoteTotal?}` | 그룹(내 그룹만)·상태·정산 변경 (소유자, 주어진 것만). `contractAmount: null` = 자동(견적 합계) 복구. `quoteTotal` 은 앱이 리스트 뷰 견적 합계를 저장 | 200 / 400 / 403 / 404 |
| GET | `/api/groups` | 내 그룹 (오너 것 + 내가 팀 멤버인 오너들의 것: `role`, `canBilling`) | `{groups}` |
| POST | `/api/groups` `{name, projectIds?}` | 그룹 생성 (+ 내 프로젝트들을 바로 넣기) | 201 `{group}` / 400 |
| GET | `/api/groups/:id` | 그룹 보기: 프로젝트(상태; `quoteTotal/contractAmount/contractAuto/paidAmount` 는 `canBilling` 인 사람에게만) | `{group, projects}` / 403 |
| PATCH / DELETE | `/api/groups/:id` | 이름 변경 / 삭제(프로젝트는 그룹만 빠짐) (오너) | 200 / 204 / 403 |
| GET | `/api/me/team` | 내 팀 멤버 (오너) | `{members}` |
| POST | `/api/me/team` `{email, canBilling?}` | 멤버 추가 (가입된 계정만, 자기 자신 불가) | 201 `{member}` / 400 / 404 |
| PATCH / DELETE | `/api/me/team/:accountId` `{canBilling}` | 정산 보기 허용 / 멤버 제거 | 200 / 204 / 404 |
| GET | `/api/invites/:token` | 초대 토큰 조회 (로그인 불필요) | `{project:{id,name}, role}` / 404 |
| GET | `/api/projects/:id/access` (`?invite=`) | 내 역할 확인 + 좌석 현황 | `{role, project, seats:{used, limit}}` / 401 / 403 / 404 |
| POST | `/api/rooms/:id/messages` (`?invite=` 또는 세션) `{objectId, author, text, kind, attachments?}` | 대화·코멘트 추가 (viewer 용, 서버가 문서에 기록). 첨부는 최대 5개, 에셋 ID 32자·허용 형식만. 글이 없으면 첨부 필수 | 201 / 400 / 401 / 403 |
| POST | `/api/rooms/:id/pins` (`?invite=` 또는 세션) `{photoId, x, y, author}` | 위치 코멘트(핀) 추가 (viewer 용) | 201 `{pin}` / 400 / 401 / 403 |
| POST | `/api/rooms/:id/approvals` (`?invite=` 또는 세션) `{by, hash, snapshot, proposalId?}` | **제안 승인** 기록 (viewer 포함). Room DO 가 `settings.approvals` 에 추가하고 `kind:'approval'` 메시지를 남긴다. 스냅샷 200KB 한도 | 201 `{approval}` / 400 / 401 / 403 / 413 |
| GET | `/p/:project/:token` | **제안 링크 랜딩** (OG 메타: 프로젝트 이름, `/p/:project/:token/image.png`) → 앱 `/?room=&invite=&proposal=1` 로 이동. 토큰이 자격 | 200 HTML / 404 |
| GET | `/p/:project/:token/image.png` | 제안 미리보기 이미지(첫 사진 주간 렌더 에셋). 제안이 없으면 404 | 200 / 404 |

- WebSocket `/api/rooms/:id`는 `?session=<세션>` 또는 `?invite=<토큰>`으로 자격을 넘깁니다(브라우저 WebSocket 은 헤더를 못 넣음). 등록 안 된 방 404, 자격 없음 401, 다른 프로젝트 토큰 403.
- 역할: `owner`(소유자 세션) / `editor` / `viewer`. **viewer 소켓이 보낸 문서 변경은 서버가 버립니다**(동기화 요청만 처리). → [../features/projects-invites.md](../features/projects-invites.md)

## 인증 (1-2a)
- 세션은 90일 Bearer 토큰. 서버에는 SHA-256 해시만 저장(`sessions.token_hash`). 매직링크 토큰도 해시만 저장.
- 이메일은 소문자·공백 제거 후 저장. 계정 `plan` 기본값 `free`.
- `AUTH_DEV_LINK=1`(`.dev.vars`, 테스트 바인딩)이면 이메일 대신 응답에 링크를 넣습니다. 운영에는 설정하지 않습니다.
- 이메일 발송은 도메인 인증 뒤 Cloudflare Email 로 연결 예정. 그전에는 503.

## 계획 (미구현)
- 카카오·구글 로그인(1-2d), 이메일 발송 → [../product/pricing.md](../product/pricing.md)
- 방 접속(1-2b)과 에셋(1-2c) 모두 프로젝트 자격으로 권한을 검사합니다. 요금제 한도 → [../product/pricing.md](../product/pricing.md)

## 관련 테스트
- `server/test/sync.test.ts`, `server/test/assets.test.ts`, `server/test/auth.test.ts`, `server/test/projects.test.ts`, `server/test/access.test.ts`, `server/test/limits.test.ts`
