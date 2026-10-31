# 서버 API

## 요약
`server/`는 화면이 없는 API 서버(Cloudflare Worker)입니다. 모든 응답에 CORS(`*`)를 붙입니다.

## 상태
구현됨 — `server/src/index.ts`. 계정·요금제 API는 계획입니다.

## 엔드포인트

| 메서드 | 경로 | 설명 | 응답 |
|---|---|---|---|
| GET | `/api/health` | 상태 확인 | `{ "ok": true }` |
| GET (WebSocket) | `/api/rooms/:room` (또는 `/ws`) `?session=`\|`?invite=&guest=` | 프로젝트 실시간 동기화 (y-websocket 호환) | 101 / 400 방 이름 / 401·403·404 권한 (동시 접속 제한 없음 — 2026-10-21) |
| PUT | `/api/assets/:id` `?project=&session\|invite` | 에셋 업로드 (viewer 포함 — 대화 첨부용). 사용량은 프로젝트 소유 계정에 | 201 / 400 ID·해시 / 401·403 권한 / 413 25MB 초과 또는 **`{error:'storage_limit', limitBytes, usedBytes, sizeBytes}`** / 415 |
| GET, HEAD | `/api/assets/:id` `?project=&session\|invite` | 에셋 다운로드·존재 확인 (viewer 포함, 소유 계정에 등록된 에셋만) | 200 / 403 / 404 |
| OPTIONS | 모든 경로 | CORS 사전 요청 | 204 |
| GET, HEAD | `/api/models/*` | AI 모델 파일 (R2 `models/` 아래, 공개·`immutable` 캐시, 경로 탈출 400) | 200 / 404 |
| POST | `/api/auth/email` `{email}` | 매직링크 요청 (링크 유효 15분, 1회용) — **가입한 계정만**(2026-10-24), `next?` 돌아갈 경로 | 202 `{ok}` (개발·테스트: `link` 포함) / 400 / 404 `{error:'no_account'}` / 503 이메일 미설정 |
| POST | `/api/auth/verify` `{token}` | 링크 검증 → 계정 생성(최초)·세션 발급 | 200 `{session, account}` / 404 없음 / 410 만료·사용됨 |
| GET | `/api/auth/providers` | 자격이 설정된 소셜 공급자 | `{providers:[…]}` |
| GET | `/api/auth/{kakao\|google\|apple}/start?next=` | 소셜 로그인 시작 (302 → 공급자) | 302 / 400 next 형식 / 503 미설정 |
| GET·POST | `/api/auth/{p}/callback` | 공급자 콜백 (애플은 POST form) → 302 `APP_URL/login#session=…&next=…` | 302 / 400 state / 502 공급자 오류 |
| GET | `/api/me` | 내 계정 + 한도·사용량 + 기본 단가표 (`Authorization: Bearer <세션>`) | 200 `{account, prices, limits:{…}, usage:{…}}` / 401 |
| PATCH | `/api/me` `{name}` | 표시 이름 변경 (40자) | 200 / 401 |
| GET·PUT | `/api/me/colors` `{colors}` | 계정 색 라이브러리 (2026-10-17, JSON `{version:1, colors:[{id, kind(페인트·시트·천·필름), name≤40, hex, supplier?≤60, code?≤60, createdAt}]}`, 300개·60KB 이하). `/api/me` 응답에도 `colors` | 200 / 400 / 401 |
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
| POST | `/api/projects` `{name, contact?, address?, contractDate?, startDate?, dueDate?, memo?}` | 프로젝트 생성 (id = 방 이름, 16자) | 201 `{project}` / 400 |
| PATCH | `/api/projects/:id` `{name}` | 이름 변경 (소유자) | 200 / 403 / 404 |
| DELETE | `/api/projects/:id` | 삭제 + 초대 폐기 (소유자) | 204 / 403 |
| GET | `/api/projects/:id/invites` | 초대 목록 (id = 해시 앞 16자). 소유자가 **다시 복사**할 수 있게 폐기 안 된 링크는 `url` 포함(2026-10-17, `invites.token` 원문 저장 — 그 전에 만든 링크는 없음). 제안 링크는 `kind:'proposal'` | `{invites[{id, role, createdAt, revoked, kind?, url?}]}` |
| POST | `/api/projects/:id/invites` `{role: viewer\|editor, kind?: 'proposal'}` | 초대 링크 생성. `kind: 'proposal'` = 제안 보내기 링크 → 무료 요금제 월 건수 한도 (2026-10-17) | 201 `{token, role, url}` / 400 / **402 `{error:'proposal_limit', used, limit}`** |
| DELETE | `/api/projects/:id/invites/:inviteId` | 초대 폐기 | 204 |
| PATCH | `/api/projects/:id` `{name?, groupId?: id\|null, status?: waiting\|ongoing\|paused\|done, contractAmount?: number\|null, paidAmount?, quoteTotal?}` | 그룹(내 그룹만)·상태·정산 변경 (소유자, 주어진 것만). 상태가 바뀌면 `statusAt`(시각)을 찍어 돌려준다(2026-10-21; 개발 모드 `AUTH_DEV_LINK=1` 에서만 `statusAt` 입력 허용). `signTotal`·`signUnmeasured`(0 이상 정수)는 앱이 실측 상태용으로 저장(2026-10-21). 상세 칸 `contact/address/memo`(글), `contractDate/startDate/dueDate`(`YYYY-MM-DD`, 빈 값·null = 지움, 그 밖은 400)도 같이(2026-10-21). **주어진 칸만 UPDATE** — 앱이 견적 합계와 실측 수를 같은 순간 따로 보내므로 전체 행 덮어쓰기면 서로 지웠다(2026-10-21). `contractAmount: null` = 자동(견적 합계) 복구. `quoteTotal` 은 앱이 리스트 뷰 견적 합계를 저장 | 200 / 400 / 403 / 404 |
| GET | `/api/groups` | 내 그룹 (오너 것 + 내가 팀 멤버인 오너들의 것: `role`, `canBilling`) | `{groups}` |
| POST | `/api/groups` `{name, projectIds?}` | 그룹 생성 (+ 내 프로젝트들을 바로 넣기) | 201 `{group}` / 400 |
| GET | `/api/groups/:id` | 그룹 보기: 프로젝트(상태; `quoteTotal/contractAmount/contractAuto/paidAmount` 는 `canBilling` 인 사람에게만) | `{group, projects}` / 403 |
| PATCH / DELETE | `/api/groups/:id` | 이름 변경 / 삭제(프로젝트는 그룹만 빠짐) (오너) | 200 / 204 / 403 |
| GET | `/api/me/team` | 내 팀 멤버 (오너) | `{members}` |
| POST | `/api/me/team` `{email, canBilling?}` | 멤버 추가 (가입된 계정만, 자기 자신 불가) | 201 `{member}` / 400 / 404 |
| PATCH / DELETE | `/api/me/team/:accountId` `{canBilling}` | 정산 보기 허용 / 멤버 제거 | 200 / 204 / 404 |
| PUT | `/api/me/plan` `{plan: free\|basic\|pro}` | **개발 모드 전용**(`AUTH_DEV_LINK=1`, E2E 에서 소유자+직원 동시 작업용). 운영은 404 — 결제 미구현, 관리자가 D1 에서 바꿈 | `{account}` / 400 / 404 |
| GET·PUT·PATCH·DELETE | `/api/me/business` `{no, ownerName, startDate, name?, address?}` · PATCH `{address}` (주소만, 2026-10-24) | 사업자 확인 (2026-10-21): 국세청 진위확인 → 계정에 사업자. `/api/me` 응답에도 `business` | 200 `{business}` / 400 `{error: bad_input\|mismatch\|not_registered}` / 409 `taken` / 502 `nts_unavailable` / 503 `not_configured` → [../features/accounts.md](../features/accounts.md) |
| GET | `/api/me/billing` | 구독·결제 (2026-10-23 토스 자동결제): `{configured, test, fake, clientKey, allowed, business, plan, plans[{id,name,priceKrw}], sub{plan,nextPlan,autoRenew,periodEnd,graceUntil,card,lastError,hasCard}\|null, payments[]}` | 200 → [../product/pricing.md](../product/pricing.md#결제-2026-10-23-토스페이먼츠-자동결제) |
| POST | `/api/me/billing/prepare` `{plan}` | 카드 등록 준비 → `{customerKey, clientKey}` (계정마다 하나) | 403 `business_required`·`not_allowed` / 400 `bad_plan` / 503 `not_configured` |
| POST | `/api/me/billing/issue` `{authKey, customerKey, plan}` | 토스 카드 등록에서 돌아와 빌링키 발급(암호화 저장) → 새 구독이면 첫 달 결제·요금제, 구독 중이면 카드 바꾸기(유예 중이면 바로 재결제) | 200 `{ok, changed?:'card', sub}` / 402 `{error: charge_failed\|issue_failed, message}` / 400 `bad_request` |
| POST | `/api/me/billing/cancel` · `/resume` · `/plan {plan}` | 해지 예약(기간 끝까지) · 해지 취소 · 다음 결제일부터 요금제 | 200 `{ok, sub}` / 400 `no_subscription` |
| POST | `/api/billing/webhook` | 토스 웹훅(인증 없음): 본문은 믿지 않고 주문을 토스에 다시 조회 — 취소면 결제 기록만 `CANCELED` | 200 |
| POST | `/api/me/presence` `{device}` | 같은 아이디 동시 사용 신호(30초마다, 2026-10-21) | `{others}` 지금 쓰는 다른 기기 수 / 400 / 401 |
| POST | `/api/me/logout-others` `{device}` | [다른 곳 로그아웃] — 이 세션 말고 이 계정 세션 모두 삭제 | `{ok}` / 400 / 401 |
| GET | `/api/invites/:token` | 초대 토큰 조회 (로그인 불필요) | `{project:{id,name}, role}` / 404 |
| GET | `/api/projects/:id/access` (`?invite=`) | 내 역할 확인 + 정산 보기(오너, 또는 정산 보기 켠 팀 멤버의 편집 초대 — 이익율 표시, 2026-10-16) | `{role, project, billing, branding}` / 401 / 403 / 404 |
| POST | `/api/rooms/:id/messages` (`?invite=` 또는 세션) `{objectId, author, text, kind, attachments?}` | 대화·코멘트 추가 (viewer 용, 서버가 문서에 기록). 첨부는 최대 5개, 에셋 ID 32자·허용 형식만. 글이 없으면 첨부 필수 | 201 / 400 / 401 / 403 |
| POST | `/api/rooms/:id/pins` (`?invite=` 또는 세션) `{photoId, x, y, author}` | 위치 코멘트(핀) 추가 (viewer 용) | 201 `{pin}` / 400 / 401 / 403 |
| POST | `/api/rooms/:id/talk-sync` (`?invite=` 또는 세션) | 톡 색인(`talk_index`) 다시 만들기 — 방을 만들거나 톡을 보낸 뒤 (2026-10-22) | `{ok}` |
| GET | `/api/me/talks` | 내가 멤버인 모든 톡방 (메인 화면) | `{talks:[{projectId, projectName, roomId, roomName, last}]}` |
| GET / POST | `/api/me/talks/:project/:room` `{text}` | 방 메시지 읽기(최근 200) / 보내기 — 색인에 내가 있는 방만 | `{messages}` / 201 / 403 |
| POST | `/api/rooms/:id/approvals` (`?invite=` 또는 세션) `{by, hash, snapshot, proposalId?}` | **제안 승인** 기록 (viewer 포함). Room DO 가 `settings.approvals` 에 추가하고 `kind:'approval'` 메시지를 남긴다. 스냅샷 200KB 한도. 요청판 프로젝트면 요청을 `approved` 로 | 201 `{approval}` / 400 / 401 / 403 / 413 |
| POST | `/api/requests` `{store, region, text?, phone, email?, ref?, signs?, address?, bizNo?, storeId?, general?, accountBusiness?, fromProject?}` — fromProject = 내 견적 초안 방 또는 내 외주 프로젝트(→ `b2b`) → 읽기 전용 요청 프로젝트로 복제(설정은 보드 배치만), 응답에 `snapshotProject`. accountBusiness = 설정에서 확인한 내 사업자로 (2026-10-22) | **요청판**(2026-10-17) 견적 요청 올리기 — **로그인 필수**(2026-10-21, 401 `login_required`), `signs` = 소비자가 그린 사인물(50개, 64KB). `bizNo` 는 국세청 상태조회(폐업 400 `biz_closed`, 자릿수 400 `bad_biz_no`) → 응답 `bizStatus`, `address` 그대로. `PUT·GET /api/requests/:id/biz-doc` = 사업자등록증 사본(그림·PDF 8MB; GET 은 고객 키·세션 또는 **제안을 보낸** 간판사 세션). `POST /api/requests/doc-scan`(로그인, 그림 바이트) = 사본 읽기 → `{fields:{bizNo?,name?,owner?,address?,startDate?}}` / 404 `scan_failed`. `GET /api/requests/mine` = 내 요청 목록(제안 수). 요청 페이지·사진은 키 또는 요청한 계정 세션. 전화는 숫자 9~11자리, 같은 번호의 열린 요청 3건까지. 지역 간판사에게 메일(운영) | 201 `{id, key, url}` / 400 / **429 `{error:'request_limit', limit}`** |
| PUT | `/api/requests/:id/photos?key=` (이미지 본문) | 요청 사진 올리기 (고객 키, 8MB·jpeg/png/webp, 장수 제한 없음 — 안전선 30장) | 201 `{n}` / 403 / 409 / 413 / 415 |
| GET | `/api/requests/:id/photos/:n` (`?key=` 또는 세션·`?session=`) | 요청 사진 (고객, 또는 그 요청을 볼 수 있는 간판사) | 200 / 401 / 403 / 404 |
| GET | `/api/requests/:id?key=` | 고객의 내 요청 페이지: 요청 + 받은 제안(`responses[{shop, proposalPath, createdAt}]`, 경로는 앱이 서버 주소를 붙임), 승인되면 `approvedShop` | `{request, responses}` / 403 / 404 |
| GET | `/api/requests` | 간판사: 받은 요청 — 요청 받기가 켜진 지역의 열린 요청 + 내가 답한 요청. 제안을 보낸 요청에만 `phone`·`email` | `{requests[{…, responded, projectId?, phone?}]}` / 401 |
| POST | `/api/me/kind` `{kind:'shop'}` | 가게 사장 → 간판집 전환 (2026-10-22): 견적 초안 방은 보통 프로젝트로. 반대는 400 | 200 `{kind}` / 400 |
| DELETE | `/api/me` `{confirm:'삭제'}` | 계정 삭제 (2026-10-22): 프로젝트·팀·사업자·로그인 정보 삭제, 보낸 요청은 닫고 개인정보 삭제 | 200 / 400 confirm_required |
| GET·POST | `/api/me/stores` `{bizNo, ownerName, startDate, name, address}` | 가게 사장의 사업자 (2026-10-22, 여럿): 국세청 진위확인 통과만 저장. 목록은 최근 순 | 200 `{stores}` / 201 `{store}` / 400 mismatch·not_registered·biz_closed·bad_input / 502 nts_unavailable |
| PUT·DELETE | `/api/me/stores/:id/doc` · `/api/me/stores/:id` | 사업자등록증 사본(그림·PDF 8MB) 붙이기 · 사업자 지우기 | 200 / 404 / 413 / 415 |
| POST | `/api/requests/:id/board` | 간판사 실측 보기 (2026-10-22): 읽기 전용 요청 프로젝트 id. 복제가 없는 옛 요청은 그 가게 사장의 견적 프로젝트를 지금 복제(한 번만) | 200 `{project}` / 403 / 404 no_board |
| POST | `/api/requests/:id/choose?key=` `{projectId}` | 고객이 제안한 간판집 확정 (2026-10-22): 요청 승인·받은 목록에서 빠짐, 다른 간판집 프로젝트는 lost + 정지 + 메일. 다시 부르면 바뀜 | 200 / 400 bad_project / 403 / 409 cancelled |
| POST | `/api/requests/:id/cancel?key=` | 고객이 요청 취소 (열린 요청만, 2026-10-22): 요청을 닫기만 — 환불·재요청 없음, 제안했던 간판집에 메일 | 200 `{ok}` / 403 / 409 not_open |
| POST | `/api/requests/:id/respond` `{mode?: copy|photos|blank}` | 간판사: 요청에서 프로젝트 만들기(`projects.request_id`, 이름 "<가게> 요청"). 이미 있으면 그것. 보드 복제 요청이면 mode 대로 요청 프로젝트를 복제(기본 copy = 사진·사인물째, photos = 사진만, blank = 빈 프로젝트, 2026-10-22) | 201/200 `{project}` / 401 / 403 / 404 |
| PUT | `/api/me/request-settings` `{receive, regions[]}` | 요청 받기·지역 (쉼표 구분 저장, 최대 20곳). `GET /api/me` 의 `requestSettings` | `{requestSettings}` / 400 / 401 |
| GET | `/p/:project/:token` | **제안 링크 랜딩** (OG 메타: 프로젝트 이름, `/p/:project/:token/image.png`) → 앱 `/?room=&invite=&proposal=1` 로 이동. 토큰이 자격 | 200 HTML / 404 |
| GET | `/p/:project/:token/image.png` | 제안 미리보기 이미지(첫 사진 주간 렌더 에셋). 제안이 없으면 404 | 200 / 404 |

- WebSocket `/api/rooms/:id`는 `?session=<세션>` 또는 `?invite=<토큰>`으로 자격을 넘깁니다(브라우저 WebSocket 은 헤더를 못 넣음). 등록 안 된 방 404, 자격 없음 401, 다른 프로젝트 토큰 403.
- 역할: `owner`(소유자 세션) / `editor` / `viewer`. **viewer 소켓이 보낸 문서 변경은 서버가 버립니다**(동기화 요청만 처리). → [../features/projects-invites.md](../features/projects-invites.md)

## 인증 (1-2a)
- `POST /api/auth/signup {email, password(8+), name?, business:{no, ownerName, startDate, name?, address?}, next?}` → 202 인증 메일(`/login?token=&verify=1[&next=]`, 24시간) / 400 (`business_required`·`bad_input`·`mismatch`·`not_registered` JSON) / 409(인증된 이메일, 또는 `{error:'taken'}`) / 502·503 (2026-10-24 사업자 확인) · `POST /api/auth/resend-verify {email}` → 항상 202 · 비밀번호 로그인은 인증 전 403 · `POST /api/auth/login {email, password}` → `{session, account}` / 401 / 429(15분 10회) · `POST /api/auth/email {email, reset?}` (reset 이면 재설정 링크 `&reset=1`) · `POST /api/auth/verify` → `{session, account, reset}` · `POST /api/me/password {password, current?}` → 200 / 400 / 403. → [../features/accounts.md](../features/accounts.md)
- 세션은 90일 Bearer 토큰. 서버에는 SHA-256 해시만 저장(`sessions.token_hash`). 매직링크 토큰도 해시만 저장.
- 이메일은 소문자·공백 제거 후 저장. 계정 `plan` 기본값 `free`.
- `AUTH_DEV_LINK=1`(`.dev.vars`, 테스트 바인딩)이면 이메일 대신 응답에 링크를 넣습니다. 운영에는 설정하지 않습니다.
- 이메일 발송은 도메인 인증 뒤 Cloudflare Email 로 연결 예정. 그전에는 503.

## 계획 (미구현)
- 카카오·구글 로그인(1-2d), 이메일 발송 → [../product/pricing.md](../product/pricing.md)
- 방 접속(1-2b)과 에셋(1-2c) 모두 프로젝트 자격으로 권한을 검사합니다. 요금제 한도 → [../product/pricing.md](../product/pricing.md)

## 관련 테스트
- `server/test/sync.test.ts`, `server/test/assets.test.ts`, `server/test/auth.test.ts`, `server/test/projects.test.ts`, `server/test/access.test.ts`, `server/test/limits.test.ts`

## 운영자 복원 (2026-10-21, `ADMIN_TOKEN` 비밀값이 있을 때만 — 없으면 404) → [backup.md](backup.md)
| 메서드 | 경로 | 설명 | 응답 |
|---|---|---|---|
| POST | `/api/admin/restore` `{project, key, mode: merge\|revert}` (Bearer ADMIN_TOKEN) | 백업 파일로 프로젝트 문서 복원 — merge = 그대로 합침, revert = 내용 바꿈(대화 유지) | `{ok}` / 400 / 401 / 404 |
| POST | `/api/admin/restore-assets` `{cursor?}` (Bearer ADMIN_TOKEN) | 백업에만 있는 사진을 사진 버킷으로 (300개씩) | `{copied, cursor}` |
| POST | `/api/admin/backups` `{prefix?, cursor?}` (Bearer ADMIN_TOKEN) | 백업 목록 (500개씩) — wrangler 에 R2 목록 명령이 없어서 | `{objects:[{key, size, uploaded, kind?}], cursor}` |

## 버전 기록 (2026-10-21, 유료 — 무료 402) → [backup.md](backup.md)
| 메서드 | 경로 | 설명 | 응답 |
|---|---|---|---|
| GET | `/api/projects/:id/versions` (`?invite=`) | 보이는 기간 안의 버전 (편집 권한) | `{versions:[{key, kind: auto\|manual\|before, at, label?, by?}]}` / 402 / 403 |
| POST | `/api/projects/:id/versions` `{label?}` | 지금 상태 저장 | 201 `{version}` |
| POST | `/api/projects/:id/versions/restore` `{key}` | 되돌리기 (직전 상태를 before 로 남김, 대화 유지) | `{ok}` / 403 기간 밖 / 404 |
| POST | `/api/projects/:id/versions/copy` `{key}` | 그 버전으로 새 프로젝트 (소유자) | 201 `{project}` |
- 멤버 초대 (2026-10-24): `POST /api/me/team {email, canBilling?}` — 가입된 이메일 201 `{member}`, 아니면 202 `{invite, link?}` 가입 링크 메일(`/login?team=`, 7일) / 403 `member_limit`(대기 중 초대 포함). `GET /api/me/team` → `{members, invites}` · `POST /api/me/team/link {canBilling?}` → 201 `{link, invite}` 이메일 없는 링크 초대(카카오톡 공유, 2026-10-24) · `DELETE /api/me/team/invites/:email|:id` · 공개 `GET /api/team-invite/:token` → `{email, ownerName, expiresAt}` / 404 / 410 · `POST /api/auth/signup {email, password, name?, teamInvite}` → 200 `{session, account}`(사업자 확인·인증 메일 없음; 링크 초대면 202 `{verify: true}` 인증 메일) / 403 `email_mismatch` / 404 / 409 / 410. 대기 중 초대는 그 이메일 계정의 로그인(메일 링크·비밀번호·소셜)마다 받아들여진다.

## 신고 · 차단 (2026-10-26)
- `POST /api/reports` {projectId?, messageId?, targetId?, targetName?, reason: spam|abuse|sexual|fraud|other, detail?} — 프로젝트 메시지면 `?invite=` 손님도, 아니면 로그인. 메시지 글을 증거로 저장, 운영자 메일.
- `GET/POST /api/me/blocks` {id, name} · `DELETE /api/me/blocks/:id` — 내 차단 목록(나 자신은 400).
- 운영자: `GET /api/operator/content-reports` · `POST /api/operator/content-reports/:id` {action: hide|dismiss}(hide = 메시지 삭제).

## 계정 조치 · 이의 신청 (2026-10-27, 약관 개정안 제5조의2)
- 정지된 계정(`accounts.banned` 또는 `suspended_until > 지금`)의 로그인 요청은 라우터가 403 `{error: 'suspended', until, banned, reason}` — 예외: `/api/me`, `/api/me/appeals`, `/api/auth/*`.
- `POST /api/me/appeals` {text} — 이의 신청(처리 대기 중이면 409), 운영자 메일.
- 관리자 가입 계정 목록 (2026-10-27): `GET /api/operator/accounts?q=&kind=shop|consumer|none&limit=50&offset=` (운영자만, 최근 가입 순) → `{accounts:[{id,email,name,kind,plan,createdAt,emailVerified,termsVersion,projects(요청 제외),lastSeenAt(마지막 세션 생성),status:active|suspended|banned,requestsBlocked,business:{name,status}|null,operator}], summary:{total,today(한국 자정부터),week,shops,consumers,verified,suspended}, next}`.
- 운영자: `GET /api/operator/members?q=`(이메일·이름·아이디, 비우면 정지된 회원, 조치 이력 포함) · `POST /api/operator/members/:id/action` {action: warn|suspend|ban|lift, days?, reason}(회원 이메일) · `GET /api/operator/appeals` · `POST /api/operator/appeals/:id` {decision: accept|reject, reply}(accept = 해제).
- 가입: 계정 생성 때 `terms_version`·`terms_at`. 영구 정지 뒤 탈퇴한 이메일(해시, 1년)은 가입 403 `banned`.

## 채널 키트 (2026-10-31) → [../features/channel-models.md](../features/channel-models.md)
업로드는 `KIT_UPLOAD_TOKEN` 비밀값이 있을 때만(없으면 404). 공개·되돌리기는 운영자(`OPERATOR_EMAILS`) 세션.
| 방법 | 경로 | 설명 | 응답 |
|---|---|---|---|
| PUT | `/api/kit/files/<sha256>.<glb\|webp\|png>` (Bearer KIT_UPLOAD_TOKEN) | 파일 올리기 — 내용 해시가 이름과 같아야, 10MB 이하 | `{ok}` / 400 hash_mismatch·bad_name / 401 / 413 |
| GET·HEAD | `/api/kit/files/<이름>` | 파일 (누구나, 1년 immutable 캐시) | 파일 / 404 |
| POST | `/api/kit/draft` `{letter, variants}` (Bearer KIT_UPLOAD_TOKEN) | 초안 목록 — 가리키는 파일이 모두 있어야 | `{ok, version}` / 400 missing_files·bad_manifest |
| GET | `/api/kit/manifest` · `?draft=1`(운영자) | 공개판(60초 캐시) · 초안 | 목록 / 404(없음 — 앱은 기본 키트) / 403 |
| GET | `/api/kit/history` (운영자) | 지난 판 번호·초안·공개판 | `{versions, draft, published}` |
| POST | `/api/kit/publish` (운영자) | 초안을 공개 | `{ok, version}` / 404 no_draft |
| POST | `/api/kit/rollback` `{version}` (운영자) | 지난 판을 새 판 번호로 다시 공개 | `{ok, version}` / 404 |

