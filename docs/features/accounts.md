# 계정·로그인


## 이메일·비밀번호 (기본, 2026-10-15)
사용자: "로그인 방식 이메일 확인 방식이 정식 방법은 아니지?" → "oauth 는 유지하는데 기본 이메일 비밀번호 방식이 필요해".
- **로그인 창**(`LoginDialog.svelte`, `data-mode`): 기본 **로그인**(이메일·비밀번호) / **회원가입**(이메일·비밀번호 8자 이상·확인·이름) / **비밀번호 찾기**(재설정 메일) / **이메일 링크로 로그인**(기존 매직 링크). 카카오·구글·애플 버튼은 로그인·가입 화면 위에 그대로.
- **서버**: `POST /api/auth/signup`(201, 이미 있는 이메일 409), `POST /api/auth/login`(401 / 같은 이메일 15분에 10번 틀리면 429 잠금, `login_failures`), `POST /api/auth/email {reset:true}` → `/login?token=&reset=1` 재설정 메일, `POST /api/me/password {password, current?}`(비밀번호가 있으면 현재 비밀번호 필요 403, **재설정 링크로 만든 세션은 15분 동안 면제** `sessions.reset_until`). 해시는 PBKDF2-SHA256 10만 회 + 16바이트 salt(`server/src/password.ts`), 상수 시간 비교. `/api/me` 의 `account.hasPassword`.
- **가입 이메일 인증**(2026-10-15 사용자: "가입할 때 이메일 인증도 받게 해줘"): 가입하면 세션 대신 **인증 메일**(`/login?token=&verify=1`, 24시간 유효)을 보냅니다. 링크를 열면 인증되고 로그인되며 "이메일 인증이 끝났습니다" 안내. **인증 전 비밀번호 로그인은 403** → 로그인 창에 [인증 메일 다시 받기](`login-resend-verify`, `POST /api/auth/resend-verify` — 가입 여부를 드러내지 않게 항상 202). 인증 전 같은 이메일로 다시 가입하면 비밀번호를 덮고 메일을 다시 보냄(먼저 걸어 둔 남의 비밀번호가 남지 않음). 인증된 이메일은 409.
- **입력 창은 바깥을 눌러도 닫히지 않는다**(2026-10-24 사용자: "로그인, 회원가입 등 사용자가 입력하는 필드있는 같은류의 창이 외부를 터치해도 꺼진다. x마크로만 끄게하던가 알림을 주던가 해주고 비밀번호 쇼(눈아이콘) 버튼 있어야해"): 로그인·비밀번호·견적 요청·제안·설정·주문 정보·단가·프로젝트 속성 창은 바깥을 누르면 닫지 않고 ✕(`data-close`)를 흔들며 "✕ 를 눌러 닫아요"(`close-hint`, `ui/dialogGuard.ts nudgeClose`). 색 고르기처럼 고르기만 하는 창은 예전대로 바깥 = 닫기. **비밀번호 칸마다 눈 단추**(`PasswordField.svelte`, `<칸>-show`, `aria-pressed`) — 로그인·가입·비밀번호 바꾸기. 테스트 `tests/e2e/dialogGuard.spec.ts`.
- **이메일 가입 = 사업자 확인**(2026-10-24 사용자: "이메일 가입시에는 가판집, 가게사장 모두 사업자 등록증 확인 이유는 멋진걸로 적어줘" → "국세청을 빼고" → "확인된 사업자와"): 회원가입 화면에 **사업자 확인** 칸(`signup-business`: `biz-no` · `biz-owner` · `biz-start` · `biz-name` 선택)과 이유 문구(`signup-biz-why`: "간판다는 확인된 사업자와 만나는 곳입니다. 간판집은 진짜 가게의 요청만, 가게 사장은 진짜 간판집의 견적만 받도록 사업자등록을 한 번 확인합니다. 카카오로 가입하면 이 단계 없이 바로 시작합니다."). 간판집·가게 사장 똑같이. 서버 `POST /api/auth/signup {…, business}` 가 설정 화면과 같은 검사(`checkBusiness` — 형식·번호 중복·진위확인)를 거친 뒤에만 계정을 만들고 인증 메일을 보낸다(400 `business_required`·`bad_input`·`mismatch`·`not_registered` / 409 `taken` / 502 / 503 — 계정은 안 생김). 사업자는 가입 때 계정에 붙고 인증하면 그대로. **이메일 인증을 안 마친 가입이 잡아 둔 번호는 묶지 않는다**(다음 가입·확인이 가져감 — 남의 번호 선점 방지). **카카오 가입은 그대로**(카카오 계정이 이미 번호 인증 기반). **멤버 초대 링크로 가입하는 직원도 사업자 확인 없음**(2026-10-24 → [projects-invites.md](projects-invites.md)).
- **메일 링크는 가입한 계정만**(2026-10-24): `POST /api/auth/email`(로그인·재설정)은 처음 보는 이메일이면 404 `no_account` → 로그인 창 "가입된 계정이 없습니다" + [회원가입하기](`login-error-signup`). 링크 검증도 계정이 없으면 404 — 메일 링크로 사업자 확인을 건너뛰어 계정을 만들 수 없다.
- **메일 링크의 돌아갈 곳**(2026-10-24 사용자: "가계사장으로 계정생성했는데 사업자로 등록되었다"): 가게 사장 화면(`/estimate`)에서 가입·메일 로그인하면 링크에 `&next=/estimate` — 링크를 열면 그 화면으로 돌아온다(전엔 첫 화면 = 간판집 홈에 떨어져 프로젝트를 만들면 간판집이 됐다). 서버·앱 모두 같은 사이트 경로만 허용(`nextPath`/`safeNext`).
- **이메일 가로채기 방지**: 비밀번호 가입은 이메일 확인 전(`email_verified = 0`). 그 이메일의 주인이 메일 링크·소셜(공급자가 확인한 이메일)로 들어오면 확인 처리하면서 **확인 전에 걸린 비밀번호를 지웁니다**(`markEmailVerified`) — 남이 먼저 내 이메일로 비밀번호를 걸어 두는 것을 막음. 기존 계정은 모두 확인된 것으로 이전.
- **앱**: 재설정 링크로 들어오면 바로 "새 비밀번호 정하기"(`PasswordDialog.svelte`, 현재 비밀번호 없이). 계정 메뉴·설정 "계정" 탭에서 비밀번호 만들기/바꾸기(`open-password`, `settings-password`).
- 데이터: `server/migrations/0008_password.sql`. 테스트: `server/test/password.test.ts`, `tests/e2e/auth.spec.ts`.

## 요약
**이메일 매직링크**와 **소셜 로그인(카카오·Google·Apple)**입니다. 로그인하면 표시 이름이 계정 이름(없으면 기기 이름, 없으면 이메일 앞부분)이 되고, 대화·접속자 표시에 그 이름이 쓰입니다.

## 상태
구현됨 (1-2a, 2026-10-13). 이메일 발송은 Cloudflare Email Sending(`send_email` 바인딩 `EMAIL`, 발신 `login@ganpanda.co.kr`)으로 연결됨 — 도메인 온보딩이 끝나야 실제로 나갑니다(→ [../server/deploy.md](../server/deploy.md)).

## 동작
1. 상단 [로그인] → 이메일 입력 → [로그인 링크 받기] → 서버가 15분짜리 1회용 링크를 만듭니다. (2026-10-24부터 이미 가입한 계정만 — 위 "메일 링크는 가입한 계정만")
2. 메일의 링크 `https://ganpanda.co.kr/login?token=…`를 열면 앱이 토큰을 검증해 세션을 받고, 주소에서 토큰을 지웁니다(`?room=`이 있었으면 유지).
3. 세션은 `localStorage`의 `ganpanda.session`에 저장(90일). 새로고침해도 유지되고, 만료되면 자동으로 로그아웃 상태가 됩니다.
4. 계정 메뉴(상단 이름 버튼): 이메일·요금제, **저장 용량·멤버 수(2026-10-21 — 전엔 동시 작업 인원)·이번 달 제안 건수 사용량/한도**. 같은 아이디를 다른 기기에서 동시에 쓰면 [다른 곳 로그아웃]/[여기서 로그아웃]을 묻는다 → [../product/pricing.md](../product/pricing.md), 표시 이름 변경(계정에 저장), 로그아웃.
5. **개발 모드**(`AUTH_DEV_LINK=1`): 서버가 링크를 응답에 돌려주고, 로그인 창에 "개발 모드: 바로 로그인" 버튼이 나타납니다. E2E도 이 경로를 씁니다. 테스트 계정은 사업자 확인 가입으로 만든다(`tests/e2e/helpers.ts` `apiSignup` — 가짜 국세청 대표자 '홍길동', 기본은 가입 뒤 사업자를 뗀다; 서버 테스트는 `test/helpers.ts` `ensureAccount`).
6. 로그인 없이도 쓸 수 있습니다(이름만 설정). 초대받은 고객이 이 경로입니다(권한은 1-2b).

## 규칙
- 이메일은 소문자·공백 제거 후 비교합니다. 같은 이메일 = 같은 계정.
- 세션·링크 토큰은 서버에 해시로만 저장합니다 → [../server/api.md](../server/api.md)
- 세션이 있을 때 표시 이름을 바꾸면 `PATCH /api/me`로 계정에 저장합니다. 로그인 전 이름은 기기(`ganpanda.nickname`)에만 저장합니다.

## 관련 코드
- 앱: `src/lib/auth.ts`, `src/lib/ui/LoginDialog.svelte`, `src/App.svelte`(계정 메뉴), `src/lib/state.svelte.ts`(`initAuth`)
- 서버: `server/src/auth.ts`, `server/migrations/0001_accounts.sql`

## 관련 테스트
- `server/test/auth.test.ts`, `tests/e2e/auth.spec.ts`

## 소셜 로그인 (1-2d, `server/src/social.ts`)
- 흐름: 앱의 버튼 → `GET /api/auth/{kakao|google|apple}/start?next=<돌아갈 경로>` → 서버가 state(10분, 1회용)를 D1 `oauth_states`에 저장하고 공급자 로그인 화면으로 → 공급자가 `…/api/auth/{p}/callback`으로 돌려주면(애플은 POST form_post) 서버가 code 를 교환해 사용자 정보를 얻고 → 세션을 만들어 **`APP_URL/login#session=…&next=…`**로 보냄 → 앱이 세션을 저장하고 `next`로 이동(주소에서 세션 제거).
- **계정 메뉴**(상단 이름 단추, `account-menu` → `account-menu-list`): 이메일·요금제·사용량·표시 이름·**⚙ 설정**(`open-settings`, 2026-10-22 상단 ⚙ 를 여기로 — 로그인 전에는 상단에 그대로)·비밀번호·로그아웃. **바깥을 누르거나 Esc 로 닫힌다**(2026-10-22 "사용자 닉 클릭으로 나온 창은 다른 곳을 누르면 꺼지게"). 상단 바가 `overflow: hidden`이라 휴대폰에서 메뉴가 잘려 로그아웃이 안 보이던 문제(2026-10-21 "사용자 누르면 나오는 정보가 모바일에서 가려진다", "로그아웃 기능이 없다") → 메뉴를 `position: fixed`로 바 바깥에(`tests/e2e/mobile.spec.ts` "계정 메뉴").
- **카카오가 기본**(2026-10-21 결정: 사람 = 카카오 로그인, 이메일은 대안, 문자 인증은 안 만든다 → [../product/decisions.md](../product/decisions.md)): 로그인 창에서 카카오 단추를 크게 맨 위에, 안내 "간판집·직원 모두 카카오로 시작하는 걸 권합니다"(`social-hint`). 서버에 카카오 키가 있을 때만 보인다.
- **계정 연결 규칙**(`identities` 테이블): 같은 공급자 ID → 기존 계정. 없으면 **공급자가 확인한 이메일**과 같은 계정에 연결(이메일 로그인 계정과 합쳐짐) — 카카오는 `is_email_verified` 일 때만, 확인 안 된 이메일은 없는 것으로 본다(남의 이메일 계정에 붙는 사고 방지, 2026-10-21). 둘 다 없으면 새 계정. 공급자가 이메일을 안 주면(카카오 동의 안 함·미확인) `kakao-<id>@noemail.ganpanda.co.kr` 같은 대체 이메일.
- 애플: client secret 은 `.p8` 키로 ES256 서명한 JWT(1시간), 돌아온 `id_token`은 애플 공개키(JWKS)로 서명·`iss`·`aud`·만료를 검증. 이름은 첫 로그인 때만 `user` 폼 필드로 옴. 이메일은 비공개 릴레이 주소일 수 있음.
- 자격이 없는 공급자는 `GET /api/auth/providers`에서 빠지고 앱이 버튼을 숨깁니다. 로컬 `.dev.vars`에는 자리값이 들어 있어 버튼은 보이지만 실제 로그인은 안 됩니다.
- 서버의 공급자 호출은 `setOauthFetch`로 바꿔 끼울 수 있어 테스트가 가짜 공급자로 전 흐름을 검사합니다(`server/test/social.test.ts`).

## 이메일 발송 규칙
- 메일: 제목 `[간판다] 로그인 링크`, 텍스트·HTML 둘 다, 버튼 + 주소 원문, "15분 유효·1회용" 안내.
- 바인딩이 없으면 503, 발송 실패(한도 초과 등)면 502 를 돌려주고 **그 토큰은 즉시 폐기**합니다(떠도는 링크 방지). 앱은 "잠시 후 다시 시도" 안내.
- 테스트는 `EMAIL.send`를 가짜로 바꿔 메시지 구성과 실패 처리를 검사합니다(`server/test/email.test.ts`).

## 사업자 확인 (2026-10-21, `server/src/business.ts` · `src/lib/business.ts` · `core/business.ts`)
결정: 로그인(사람 = 카카오/이메일) 위에 얹는 "어느 사업체인가" — 숨고·크몽 방식 → [../product/decisions.md](../product/decisions.md).
- **어디서**: 설정 → **계정** 탭 "사업자 확인"(`business-section`): 사업자등록번호(`biz-no`, 자동 하이픈·검증 자릿수 `isValidBizNo`) · 대표자 성명(`biz-owner`) · 개업일자(`biz-start`, 날짜 입력기 `type=date` — 2026-10-21 "날짜입력기 사용해줘") · 상호(선택 `biz-name`) → [확인](`biz-verify`). 확인되면 `biz-verified`(상호·번호·대표자·개업일·상태·확인일) + [확인 해제](`biz-remove`, 확인 창 — 배지가 사라지고 번호가 풀린다; 2026-10-21 "떼기는 뭔가?" → "확인 해제로 바꿔줘").
- **서버** `PUT /api/me/business {no, ownerName, startDate, name?}` → 국세청 공공데이터 API **진위확인**(`api.odcloud.kr/api/nts-businessman/v1/validate`, 키 `NTS_API_KEY` = data.go.kr 일반 인증키 Decoding). 응답: 200 `{business}` / 400 `{error: bad_input|mismatch|not_registered}` / 409 `taken`(다른 계정이 쓰는 번호 — 계정 하나 = 사업자 하나, 번호는 계정 사이에 유일) / 502 `nts_unavailable` / 503 `not_configured`. `DELETE` 로 해제. `GET /api/me` 에 `business`.
- **상태**: 국세청 `b_stt_cd` 01 계속(`active`) · 02 휴업(`suspended`) · 03 폐업(`closed`). 폐업·휴업도 저장하고 경고로 보인다. **재조회**: 매시간 cron 에서 `checked_at` 30일 지난 것 100개씩 **상태조회**(`/status`)로 갱신(`recheckBusinesses`).
- **제안 페이지 배지**: `/api/projects/:id/access` 에 소유자의 `business {name, status}` → 상태가 계속사업자면 제안 페이지 머리에 "✓ 사업자 확인된 간판집 · 상호"(`proposal-business`). 돈이 간판다를 거치지 않는 구조에서 고객이 믿을 근거.
- **업종은 확인 안 함**(API 가 안 줌). 대표자명 불일치 때 사업자등록증 사진 + 운영자 승인 경로는 아직 없음(안내 문구만) — 필요해지면 추가.
- **로컬·E2E**: `.dev.vars` `NTS_API_KEY=fake` → 가짜 응답(대표자명 "홍길동" = 일치, 번호가 999 로 시작 = 폐업). 테스트: `server/test/business.test.ts`(가짜 국세청 `setNtsFetch`), `tests/unit/business.test.ts`, `tests/e2e/business.spec.ts`.
- 아직 쓰이지 않는 것: 체험·요금 "사업자당 1번"은 체험 전환을 구현할 때 이 테이블을 쓴다 → [../product/pricing.md](../product/pricing.md).
- **사업장 주소**(2026-10-24): 사업자 확인에 사업장 주소(선택, `biz-address`) — 국세청은 주소를 확인하지 않는다. 확인된 뒤에도 주소만 바꾼다(`PATCH /api/me/business {address}`, `biz-address-edit`, 다시 확인 안 함). 요청 받기 기본 지역이 된다 → [requests.md](requests.md).

## 남은 일
- 운영 자격 등록: 카카오는 됨(2026-10-21). 구글·애플은 각 콘솔에 리디렉션 URI + `wrangler secret put` → [../server/deploy.md](../server/deploy.md)
- 매직링크 요청 횟수 제한, 계정 메뉴에서 연결된 공급자 보기

## 계정 종류 · 전환 · 삭제 (2026-10-22)
사용자: "사업자는 소비자 등록이 안된다. 소비자는 사업자로 변경하고 기존 데이터는 사업자로 이관된다, 계정삭제도 필요하다."

- **계정 종류** `accounts.kind`: `shop`(간판집) · `consumer`(가게 사장) · null(아직 안 정함). 처음 **프로젝트를 만들면 shop**, 처음 **견적 초안 방(/estimate)을 열면 consumer** (`server/src/accountKind.ts settleKind`). 종류가 없던 옛 계정이라도 보통 프로젝트가 있으면 shop.
- **간판집은 가게 사장 견적 요청을 못 쓴다**: `/api/estimate/project` → 403 `shop_account`, 앱은 `/estimate` 에 **"간판집 계정입니다"**(`consumer-blocked`) — 외주 요청(만들기 [외주] · ⋯ [다른 업체에 외주 요청])을 안내.
- **가게 사장은 프로젝트를 못 만든다**: `POST /api/projects` → 403 `consumer_account`. 홈은 프로젝트 대신 **가게 사장 계정** 카드(`consumer-home`: [견적 요청 하기] · [간판집(사업자)으로 전환]) + 내 견적 요청.
- **가게 사장 → 간판집 전환**(`POST /api/me/kind {kind:'shop'}`, 홈 카드·설정 계정 탭 `convert-section`, 되돌릴 수 없음): **견적 보드는 보통 프로젝트가 되어** 내 프로젝트에 나오고, 보낸 요청·등록한 사업자는 그대로. 간판집 → 가게 사장은 없다(400).
- **계정 삭제**(`DELETE /api/me {confirm:'삭제'}`, 설정 계정 탭 `delete-section` — "삭제" 를 적어야): 내 프로젝트(방·백업 포함)·그룹·팀(내 팀·남의 팀 멤버십)·사업자(stores·businesses)·사양 규칙·로그인 정보(세션·소셜 연결·메일 토큰)를 지운다. **내가 보낸 요청은 닫고(취소) 연락처·주소·사업자 정보를 지운다** — 받은 간판집 기록은 남되 개인정보 없음. 사진은 다른 계정이 쓰지 않는 것만 지운다(내용 해시로 공유). 같은 메일로 다시 가입하면 새 계정.
- **설정 탭도 종류에 맞게**: 가게 사장은 **계정 · 표시**만(멤버·사양 사전·요청 받기·단축키는 간판집 일), 계정 탭의 멤버 수·제안 건수와 "사업자 확인"(간판집 배지)도 감추고 대신 전환.

## 가입 동의 · 이용 정지 · 탈퇴 익명화 (2026-10-27)
- 가입 화면에 동의 안내(`ui/TermsNotice.svelte`), 계정을 만들 때 `terms_version`·`terms_at`(`server/src/auth.ts TERMS_VERSION`).
- 이용 정지: `accounts.suspended_until`(기간)·`banned`(영구)·`suspend_reason`. 서버 라우터가 정지된 계정의 로그인 요청을 403 `suspended` 로(상태 확인 `/api/me`·탈퇴·이의 신청 `/api/me/appeals`·인증 `/api/auth/*` 만). `/api/me` 의 `account.suspension` → 앱은 `SuspendedPage`. 운영자 조치·이의 신청은 [communication.md](communication.md) "신고 · 차단"과 `/ops`. 가입 계정 목록은 관리자 페이지 `/ops` 의 [회원] 탭 (2026-10-27).
- 탈퇴: 남의 프로젝트(`project_seen`·톡방)에 남긴 메시지를 "탈퇴한 회원"으로(`Room.anonymizeAuthor`). 영구 정지 상태로 탈퇴하면 이메일 해시를 1년 `banned_emails` — 다시 가입하면 403 `banned`.
- 근거: [../product/terms-amendment-2026-11.md](../product/terms-amendment-2026-11.md).
