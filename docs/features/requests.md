# 요청판 (견적 요청 → 가입 간판사 → 제안 링크)

## 요약
가게 사장이 **로그인 없이** 사진과 내용으로 간판 견적을 요청하면, 그 지역에서 **"요청 받기"를 켠 간판사**들에게 전달됩니다. 간판사는 요청에서 바로 프로젝트를 만들어(사진이 들어온 채로) 평소처럼 사인물을 그리고 **제안 링크**로 답합니다. 고객은 요청 페이지에서 받은 제안들을 나란히 보고 하나를 승인합니다. 계약·시공·돈은 고객과 간판사 사이에서 직접 — 간판다는 전달·기록만. 홍보자(아르바이트)는 자기 코드가 붙은 링크로 요청을 데려오고, 그 요청에 제안이 들어온 만큼 수수료를 받습니다(지급은 밖에서, 기록만). 결정 → [../product/decisions.md](../product/decisions.md) 2026-10-17, 과금 → [../product/pricing.md](../product/pricing.md).

## 상태
1차 구현됨 (2026-10-17), **2026-10-21 켬** — 사용자: "시작(로그인전) 사업자 소비자 구분해서 소비자는 간판견적을 보고 견적 요청하는 방식 … 현재 사업자 버전의 도형그리기 사이즈 그리고 메모로 견적을 요청하게" → "켜는 걸로 진행해줘". 2026-10-17 의 "숨김·독립 웹" 결정은 대체됨(→ [../product/decisions.md](../product/decisions.md)). 끄려면 빌드 `VITE_REQUESTS=0`.

## 소비자 견적 요청 모드 (`/estimate`, 2026-10-21)
- **입구 로그인**(2026-10-21 사용자: "카카오톡으로 로그인하게해줘 인증이되야 할거 같아" → "입구 카카오 견적요청 사본으로 자동입력"): `/estimate` 는 로그인 전이면 보드 대신 **입구**(`consumer-gate`: [카카오로 시작] `consumer-login-kakao` `next=/estimate` / [다른 방법으로 로그인])를 보인다. 로그인하면 보드. [견적 요청] 창에도 같은 문(`estimate-login`)이 안전장치로 남아 있다. 서버 `POST /api/requests` 는 세션 없으면 401 `login_required`, 요청에 `account_id` 를 붙인다(`0023_request_account.sql`). 요청한 계정은 **키 없이도** 세션으로 요청 페이지·사진을 보고(`customerOk`), 홈에 **"내 견적 요청"**(`my-request-list`, `GET /api/requests/mine`: 제안 수·승인 여부) 이 뜬다. 옛 `/request` 폼은 없애고 `/estimate` 로 보낸다.
- **주소·사업자번호**(2026-10-21 "사업자번호 인증도 가능한가? 이건 주소만 필요해서" → "둘다 작성하는 걸로"): 요청 폼에 **가게 주소**(선택, `est-address` — 국세청 API 는 주소를 주지 않으므로 직접 입력)와 **사업자등록번호**(선택, `est-bizno`, 자동 하이픈·검증 자릿수). 번호가 있으면 서버가 **번호만으로 국세청 상태조회**(`business.ts fetchStatuses`, 대표자명·개업일 없이) → 계속사업자면 `biz_status = active` → 간판사 "받은 요청"에 **✓ 사업자 확인** 배지(`request-biz`), 주소(`request-address`). 폐업이면 400 `biz_closed`, 자릿수 틀리면 `bad_biz_no`, 조회가 안 되면 확인 없이 받는다(`biz_status` null). `0024_request_biz.sql`.
- **검증 요소**(2026-10-21 "사업자등록증 무조건" → "사본이 없으면 직접입력 필요한 우리가 필요한 검증 요소만 입력"): **사본을 올리거나**, 없으면 **사업자등록번호 + 대표자 성명(`est-owner`) + 개업일자(`est-start`)** 를 넣어 국세청 **진위확인**(`validateBusiness`, 일치 → `biz_verified = 1`, 간판사 배지 "✓ 사업자 확인"; 번호만 상태조회면 "✓ 번호 확인"). 둘 다 없으면 앱이 막고 서버도 400 `verification_required`(앱은 사본을 이어서 올릴 때 `bizDocPending: true`). 불일치 400 `mismatch`, 미등록 `not_registered`, 폐업 `biz_closed`. 사본을 읽으면 대표자·개업일도 채워져 진위확인까지 간다. `0026_request_owner.sql`.
- **사업자등록증 사본**(2026-10-21 "사업자 사본 받아야 겠다"): 요청 폼의 파일(`est-bizdoc`, 그림·PDF 8MB) → `PUT /api/requests/:id/biz-doc?key=`(R2 `requests/<id>/biz-doc`, 메타 `requests.biz_doc` JSON, `0025_request_biz_doc.sql`). 간판사 "받은 요청"에 "📄 사업자등록증 사본"(`request-bizdoc`) — **파일은 제안을 보낸(연락처가 열린) 간판사만** `GET …/biz-doc?session=`(`request-bizdoc-open`), 그 전엔 "제안을 보내면 열립니다". 고객은 키·세션으로 자기 것을 본다. 등록증에는 대표자 생년월일·주소가 있어 연락처와 같은 기준으로 가린다.
- **사본 자동 읽기**(2026-10-21 "분석 실패하면 수동입력"): 사본을 고르면 바로 `POST /api/requests/doc-scan`(로그인, 그림 8MB; PDF 는 안 읽음) → `server/src/docScan.ts` 가 **Workers AI 비전 모델**(`@cf/meta/llama-3.2-11b-vision-instruct`, `wrangler.jsonc ai.binding AI`)에 "사업자등록번호·상호·대표자·소재지·개업연월일 JSON" 을 묻고 `parseScan` 으로 정리(번호는 검증 자릿수가 맞을 때만) → **빈 칸만** 채운다(번호·상호·주소, `est-scan` "읽었습니다 — 확인해 주세요"). 못 읽으면 404 `scan_failed` → "자동 인식이 안 됐습니다 — 직접 입력". 로컬·E2E 는 `.dev.vars DOC_SCAN=fake`(고정 결과), 테스트는 `setDocScanner`. 운영 비용: Workers AI(계정 무료 할당 안에서 소량). **모델 라이선스**: Workers AI 는 계정당 1회 `agree` 프롬프트로 Llama 3.2 커뮤니티 라이선스 동의를 요구(오류 5016) — 서버가 처음 쓸 때 자동으로 보내고 다시 시도(2026-10-21 사용자 승인). 실제 등록증(스캔본)으로 확인: 번호·대표자·개업일·주소는 정확, 상호는 한 글자 오독 가능(사용자가 확인·수정) — 모델이 `response` 를 JSON 객체로 주기도 하고, 생년월일을 개업일·주소로 섞어 읽던 것은 생년월일 칸(`birthDate`, 저장 안 함)을 따로 두고 주소다움·성명다움 검사로 걸렀다. 국세청 진위확인에는 상호(`b_nm`)를 보내지 않는다 — 등록 상호와 표기가 달라 불일치가 나지 않게.
- **지역은 주소에서**(2026-10-21 "지역입력은 주소와 중복된다"): 요청 폼에 지역 칸이 없고 **가게 주소(필수)** 에서 `core/region.ts regionOfAddress` 로 "시/도 짧은 이름 + 시/군/구(+구)"(예: 경기도 성남시 중원구 성남대로… → 경기 성남시 중원구)를 뽑아 보낸다(서버도 지역이 비면 주소에서). 간판사 지역과는 **포함 관계**로 맞춘다(`regionMatches`: "성남시" ⊂ "경기 성남시 중원구", 긴 이름·공백 무시 — 전엔 공백만 뺀 완전 일치). **사본 파일 선택**은 작은 기본 입력 대신 단추(`est-bizdoc-pick` "📄 사진·파일 고르기" + 파일 이름, 2026-10-21 "파일업로드 잘 안보여").
- **보내기 전 안내**(`estimate-advice`, 2026-10-21 "견적 넣기전에 사인물 수량 확인하고 실사이즈가 없으면 견적 응답이 적을수 있습니다. 안내"): 사인물이 없으면 "사진 위에 간판 자리를 그려 주면…", 실제 크기(가로·세로)가 없는 사인물이 있으면 "N개 중 M개는 크기가 없습니다 — 견적 응답이 적을 수 있습니다". 막지는 않는다.
- **적던 내용 보존**(2026-10-21 "사업자등록정보 등록했는데 사라져"): 요청 폼의 글 칸(가게·전화·이메일·내용·주소·사업자번호·대표자·개업일)은 기기 `localStorage ganpanda.estimateDraft` 에 남아 창을 닫거나 로그인으로 돌아와도 그대로, 보내면 지운다. 파일(사본)은 다시 골라야 한다.
- **운영자 수동 처리**(2026-10-21 사용자: "가게 사장님이 보낸 견적요청을 아직 받을 간판 가게가 없다. 일정 기간 수동으로 처리해야 한다"): `wrangler.jsonc vars.OPERATOR_EMAILS`(쉼표 구분)의 계정은 요청 받기 설정·지역과 상관없이 **모든 열린 요청**을 홈 "받은 요청"에서 보고 [제안 만들기]로 답하며, 요청 알림 메일도 받는다(`isOperator`). 가입 간판집이 생기면 목록에서 빼면 된다. 운영자에게는 홈 "받은 요청" 자리가 요청이 없어도 보인다(2026-10-22 "받은 요청 페이지가 어디에 있나?" — 홈 맨 위, 내 프로젝트 위). 고객 완료 문구에도 "지역에 가입 간판집이 아직 없으면 간판다가 직접 확인해 연결"을 적었다.
- **시작 화면 분기**(`Home.svelte` `landing`): [간판집입니다 → 로그인](`landing-shop`) / [가게 사장입니다 → 견적 요청](`landing-consumer` → `/estimate`).
- **`/estimate`** = 로그인 없이 **기기에만 두는 보드**(`app.consumer`, 방 `estimate`, IndexedDB 만, 서버 방·동기화 없음, 에셋도 올리지 않음 `setAssetsLocalOnly`). 사업자 보드와 같은 도구에서 **말풍선·존만 뺌**. 단가는 예시표(`mergePrices(null)`)로 **자동 계산** → 리스트 뷰 견적에 "참고 금액"(`quote-reference`), 상단 배지 `consumer-badge`. 버전·초대·제안 단추 대신 **[견적 요청]**(`estimate-button`, 사진이 있어야 켜짐).
- **[견적 요청]**(`EstimateRequestDialog.svelte`, `estimate-dialog`): 가게 이름·지역·전화(필수), 이메일·요청 내용(선택). 보내면 `POST /api/requests` 에 **그린 사인물**(`signs`: 요청 사진 번호 `photo`, 이름, 모양, 영역 `quad`(사진 px), 둥글기, 가로·세로 mm, 종류 `productId`, 메모 — `core/requestSigns.ts serializeRequestSigns`, 연결 영역 제외, 50개까지)을 싣고, 보드의 사진을 왼쪽부터 번호대로 `PUT /photos`(3장까지). 끝나면 요청 페이지 주소(`estimate-done-link`, 기기 `ganpanda.myRequests` 에도 기억).
- **간판사**: 홈 "받은 요청"에 **사인물 수·치수 수**(`request-signs`). [제안 만들기]로 연 프로젝트에 사진과 함께 **사인물이 그대로 그려진다**(`importRequestPhotos` → `materializeRequestSigns`, 문서에 사인물이 없을 때만). 서버 `requests.signs`(JSON, `0022_request_signs.sql`, `server/src/requestSigns.ts` 로 검사 — 앱과 같은 규칙, 틀리면 400).
- 테스트: `tests/unit/requestSigns.test.ts`, `server/test/requests.test.ts`(signs), `tests/e2e/estimate.spec.ts`.

## 역할과 돈
| 역할 | 하는 일 | 돈 |
|---|---|---|
| 홍보자 | `/request?ref=<코드>` 링크·전단으로 가게 사장을 데려옴 | 자기 코드의 요청에 제안이 들어온 만큼(요금 발생분의 일부, 비율 미정). 간판다가 받은 돈 안에서 계좌이체 |
| 가게 사장 | 요청 올림(사진 1~3장·가게·지역·내용·전화·이메일 선택). 요청 페이지에서 제안 비교·승인 | 무료 |
| 가입 간판사 | 설정에서 "요청 받기" + 지역. 홈 "받은 요청"에서 [제안 만들기] → 프로젝트 → 제안 링크 | **제안 링크를 만들 때** 요금제의 제안 건수(무료 월 3건, 베이직·프로 무제한). 제안을 보내야 고객 연락처가 보임 |

## 흐름
1. ~~**요청 올리기** `/request` (`RequestForm.svelte`)~~ → 2026-10-21부터 `/estimate` 소비자 보드(위). 옛 설명: 가게 이름(`req-store`), 지역(`req-region`, 시/군/구까지 — 간판사 지역과 글자 그대로 맞춤, 공백 무시), 원하는 내용(`req-text`), 전화(`req-phone`, 숫자만 9~11자리), 이메일 선택(`req-email`), 사진 1~3장(`req-photos`, 필수). `?ref=` 는 숨겨 저장. 보내면(`req-submit`) `POST /api/requests` → 사진 `PUT /api/requests/:id/photos?key=` → **내 요청 페이지 주소**(`req-done-link`, `/r/<id>?key=<키>`)를 보여 주고 "저장해 두세요", 이메일을 넣었으면 메일로도 보냄.
   - 같은 전화번호의 열린 요청이 3건이면 `429 request_limit` → "이미 3건의 요청이 진행 중입니다".
2. **간판사 알림**: 요청이 오면 그 지역의 "요청 받기" 간판사들에게 이메일(운영: Email Sending, 로컬: 건너뜀). 홈 **받은 요청**(`request-list`, `request-item`)에도 보임: 가게·지역·내용·날짜·사진. 연락처는 **제안을 보낸 요청에만**(`request-phone`).
3. **제안 만들기**(`request-respond`): `POST /api/requests/:id/respond` → 요청 사진이 들어갈 프로젝트(`projects.request_id`)가 생기고 그 방으로 이동. 앱은 방에 들어가 **문서에 사진이 없으면 요청 사진을 가져와 올립니다**(`importRequestPhotos`: 소유자 용량에 쌓임). 이미 만든 프로젝트가 있으면 그 방으로.
4. **제안 보내기**: 평소와 같음(`ProposalDialog`). 서버는 `request_id` 가 있는 프로젝트의 제안 링크를 만들 때 `request_responses` 에 기록(간판사·프로젝트·제안 주소) — 이것이 **요금 발생·홍보자 정산의 근거**이고, 이때부터 그 간판사에게 연락처가 보입니다.
5. **고객 요청 페이지** `/r/:id?key=` (`RequestView.svelte`, `request-page`): 요청 내용·사진·상태, 받은 제안 목록(`request-proposal`: 간판사 이름 · [제안 보기] → 제안 링크). 제안을 승인하면(기존 승인 흐름) 요청 상태가 **승인됨**(`requests.status = 'approved'`, 어느 간판사인지).
6. **요청 받기 설정**(`Settings.svelte` "요청 받기" 탭 `requests-section`, 요청판이 켜져 있을 때만): 켜기(`req-receive`) + 지역(`req-regions`, 쉼표로 여러 곳) → `PUT /api/me/request-settings`.

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
