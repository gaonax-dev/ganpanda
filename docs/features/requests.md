# 요청판 (견적 요청 → 가입 간판사 → 제안 링크)

## 요약
가게 사장이 **로그인 없이** 사진과 내용으로 간판 견적을 요청하면, 그 지역에서 **"요청 받기"를 켠 간판사**들에게 전달됩니다. 간판사는 요청에서 바로 프로젝트를 만들어(사진이 들어온 채로) 평소처럼 사인물을 그리고 **제안 링크**로 답합니다. 고객은 요청 페이지에서 받은 제안들을 나란히 보고 하나를 승인합니다. 계약·시공·돈은 고객과 간판사 사이에서 직접 — 간판다는 전달·기록만. 홍보자(아르바이트)는 자기 코드가 붙은 링크로 요청을 데려오고, 그 요청에 제안이 들어온 만큼 수수료를 받습니다(지급은 밖에서, 기록만). 결정 → [../product/decisions.md](../product/decisions.md) 2026-10-17, 과금 → [../product/pricing.md](../product/pricing.md).

## 상태
1차 구현됨 (2026-10-17). **화면은 숨김** — 같은 날 사용자: "우선 안보이게 해줘 현재는 간판 실측툴로서 기본기를 단단히 하겠다". 서버·API·DB 는 그대로 살아 있고(`/r/<id>` 고객 페이지도 동작), 설정의 "견적 요청 받기"·홈 "받은 요청"·`/request` 폼만 `app.requestsEnabled` 로 가려 둠. 켜기: 빌드 `VITE_REQUESTS=1`(운영 공개) 또는 기기 localStorage `ganpanda.requests=1`(내부 확인·E2E). 남은 일은 아래.

**방향 (2026-10-17)**: 거래 흐름(요청·입찰·분배)은 이 앱이 아니라 **추후 독립된 웹**에서 디자이너·영업·제작이 서로 일을 주고받는 형태로 만든다(사용자: "현재 웹에서 같이 있는것보다는 추후 독립된 웹에서…"). 이 앱은 실측·제안 도구로 남고, 여기의 서버 API·DB(`requests`, `request_responses`, 요청 사진)는 그 웹이 가져다 쓸 수 있는 출발점이다. 앱 안의 화면(`RequestForm`·`RequestView`·설정·홈 목록)은 공개하지 않는다.

## 역할과 돈
| 역할 | 하는 일 | 돈 |
|---|---|---|
| 홍보자 | `/request?ref=<코드>` 링크·전단으로 가게 사장을 데려옴 | 자기 코드의 요청에 제안이 들어온 만큼(요금 발생분의 일부, 비율 미정). 간판다가 받은 돈 안에서 계좌이체 |
| 가게 사장 | 요청 올림(사진 1~3장·가게·지역·내용·전화·이메일 선택). 요청 페이지에서 제안 비교·승인 | 무료 |
| 가입 간판사 | 설정에서 "요청 받기" + 지역. 홈 "받은 요청"에서 [제안 만들기] → 프로젝트 → 제안 링크 | **제안 링크를 만들 때** 요금제의 제안 건수(무료 월 3건, 베이직·프로 무제한). 제안을 보내야 고객 연락처가 보임 |

## 흐름
1. **요청 올리기** `/request` (`RequestForm.svelte`, `request-form`): 가게 이름(`req-store`), 지역(`req-region`, 시/군/구까지 — 간판사 지역과 글자 그대로 맞춤, 공백 무시), 원하는 내용(`req-text`), 전화(`req-phone`, 숫자만 9~11자리), 이메일 선택(`req-email`), 사진 1~3장(`req-photos`, 필수). `?ref=` 는 숨겨 저장. 보내면(`req-submit`) `POST /api/requests` → 사진 `PUT /api/requests/:id/photos?key=` → **내 요청 페이지 주소**(`req-done-link`, `/r/<id>?key=<키>`)를 보여 주고 "저장해 두세요", 이메일을 넣었으면 메일로도 보냄.
   - 같은 전화번호의 열린 요청이 3건이면 `429 request_limit` → "이미 3건의 요청이 진행 중입니다".
2. **간판사 알림**: 요청이 오면 그 지역의 "요청 받기" 간판사들에게 이메일(운영: Email Sending, 로컬: 건너뜀). 홈 **받은 요청**(`request-list`, `request-item`)에도 보임: 가게·지역·내용·날짜·사진. 연락처는 **제안을 보낸 요청에만**(`request-phone`).
3. **제안 만들기**(`request-respond`): `POST /api/requests/:id/respond` → 요청 사진이 들어갈 프로젝트(`projects.request_id`)가 생기고 그 방으로 이동. 앱은 방에 들어가 **문서에 사진이 없으면 요청 사진을 가져와 올립니다**(`importRequestPhotos`: 소유자 용량에 쌓임). 이미 만든 프로젝트가 있으면 그 방으로.
4. **제안 보내기**: 평소와 같음(`ProposalDialog`). 서버는 `request_id` 가 있는 프로젝트의 제안 링크를 만들 때 `request_responses` 에 기록(간판사·프로젝트·제안 주소) — 이것이 **요금 발생·홍보자 정산의 근거**이고, 이때부터 그 간판사에게 연락처가 보입니다.
5. **고객 요청 페이지** `/r/:id?key=` (`RequestView.svelte`, `request-page`): 요청 내용·사진·상태, 받은 제안 목록(`request-proposal`: 간판사 이름 · [제안 보기] → 제안 링크). 제안을 승인하면(기존 승인 흐름) 요청 상태가 **승인됨**(`requests.status = 'approved'`, 어느 간판사인지).
6. **요청 받기 설정**(`Settings.svelte` `requests-section`): 켜기(`req-receive`) + 지역(`req-regions`, 쉼표로 여러 곳) → `PUT /api/me/request-settings`.

## 데이터 (D1, `server/migrations/0010_requests.sql`)
- `accounts.receive_requests`(0/1), `accounts.regions`(쉼표 구분 문자열)
- `projects.request_id` — 요청에서 만든 프로젝트
- `requests(id, key_hash, store, region, text, phone, email, ref, photos(JSON [{n, type, size}]), status open|approved, created_at, approved_at, approved_by)` — 고객 키는 해시만 저장
- `request_responses(request_id, account_id, project_id, proposal_url, created_at)` — 간판사당 요청 하나에 한 줄(제안을 다시 만들면 주소만 갱신). `proposal_url` 은 서버 기준 경로 `/p/<project>/<token>` (앱이 `SERVER_URL` 을 붙임 — 로컬 wrangler 가 origin 을 운영 도메인으로 바꿔 보여 주므로)
- 사진은 R2 `requests/<id>/<n>` (내용 해시 에셋과 별개, 계정 용량에 세지 않음). 간판사가 프로젝트로 가져오면 그때 보통 에셋이 되어 그 간판사 용량에 쌓임

## 권한
- 고객: `?key=` (요청 페이지·사진)
- 간판사(세션): 요청 받기가 켜져 있고 지역이 맞는 열린 요청, 또는 **자기가 답한 요청**(상태 무관). 사진 GET 은 `?session=` 도 받음(`<img>` 용)
- 전화번호: 제안을 보낸 간판사에게만

## 허위 요청 방지 (1차)
사진 필수, 전화번호당 열린 요청 3건. 전화 인증(SMS)·간판사 신고·환불은 남은 일.

## API
→ [../server/api.md](../server/api.md) "요청판" 절

## 남은 일
- 전화 인증(SMS), 간판사 "허위 요청" 신고 → 환불·홍보자 차감
- 홍보자 계정·코드 발급·정산 화면 (지금은 `requests.ref` 문자열만 기록)
- 지역을 글자 대신 행정구역 선택으로
- 고객에게 제안 도착 알림(이메일·문자)
- 간판사에게 푸시·카카오 알림

## 관련 테스트
`server/test/requests.test.ts`, `tests/e2e/requests.spec.ts`
