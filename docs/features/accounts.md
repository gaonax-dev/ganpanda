# 계정·로그인


## 이메일·비밀번호 (기본, 2026-10-15)
사용자: "로그인 방식 이메일 확인 방식이 정식 방법은 아니지?" → "oauth 는 유지하는데 기본 이메일 비밀번호 방식이 필요해".
- **로그인 창**(`LoginDialog.svelte`, `data-mode`): 기본 **로그인**(이메일·비밀번호) / **회원가입**(이메일·비밀번호 8자 이상·확인·이름) / **비밀번호 찾기**(재설정 메일) / **이메일 링크로 로그인**(기존 매직 링크). 카카오·구글·애플 버튼은 로그인·가입 화면 위에 그대로.
- **서버**: `POST /api/auth/signup`(201, 이미 있는 이메일 409), `POST /api/auth/login`(401 / 같은 이메일 15분에 10번 틀리면 429 잠금, `login_failures`), `POST /api/auth/email {reset:true}` → `/login?token=&reset=1` 재설정 메일, `POST /api/me/password {password, current?}`(비밀번호가 있으면 현재 비밀번호 필요 403, **재설정 링크로 만든 세션은 15분 동안 면제** `sessions.reset_until`). 해시는 PBKDF2-SHA256 10만 회 + 16바이트 salt(`server/src/password.ts`), 상수 시간 비교. `/api/me` 의 `account.hasPassword`.
- **가입 이메일 인증**(2026-10-15 사용자: "가입할 때 이메일 인증도 받게 해줘"): 가입하면 세션 대신 **인증 메일**(`/login?token=&verify=1`, 24시간 유효)을 보냅니다. 링크를 열면 인증되고 로그인되며 "이메일 인증이 끝났습니다" 안내. **인증 전 비밀번호 로그인은 403** → 로그인 창에 [인증 메일 다시 받기](`login-resend-verify`, `POST /api/auth/resend-verify` — 가입 여부를 드러내지 않게 항상 202). 인증 전 같은 이메일로 다시 가입하면 비밀번호를 덮고 메일을 다시 보냄(먼저 걸어 둔 남의 비밀번호가 남지 않음). 인증된 이메일은 409.
- **이메일 가로채기 방지**: 비밀번호 가입은 이메일 확인 전(`email_verified = 0`). 그 이메일의 주인이 메일 링크·소셜(공급자가 확인한 이메일)로 들어오면 확인 처리하면서 **확인 전에 걸린 비밀번호를 지웁니다**(`markEmailVerified`) — 남이 먼저 내 이메일로 비밀번호를 걸어 두는 것을 막음. 기존 계정은 모두 확인된 것으로 이전.
- **앱**: 재설정 링크로 들어오면 바로 "새 비밀번호 정하기"(`PasswordDialog.svelte`, 현재 비밀번호 없이). 계정 메뉴·설정 "계정" 탭에서 비밀번호 만들기/바꾸기(`open-password`, `settings-password`).
- 데이터: `server/migrations/0008_password.sql`. 테스트: `server/test/password.test.ts`, `tests/e2e/auth.spec.ts`.

## 요약
**이메일 매직링크**와 **소셜 로그인(카카오·Google·Apple)**입니다. 로그인하면 표시 이름이 계정 이름(없으면 기기 이름, 없으면 이메일 앞부분)이 되고, 대화·접속자 표시에 그 이름이 쓰입니다.

## 상태
구현됨 (1-2a, 2026-10-13). 이메일 발송은 Cloudflare Email Sending(`send_email` 바인딩 `EMAIL`, 발신 `login@ganpanda.co.kr`)으로 연결됨 — 도메인 온보딩이 끝나야 실제로 나갑니다(→ [../server/deploy.md](../server/deploy.md)).

## 동작
1. 상단 [로그인] → 이메일 입력 → [로그인 링크 받기] → 서버가 15분짜리 1회용 링크를 만듭니다.
2. 메일의 링크 `https://ganpanda.co.kr/login?token=…`를 열면 앱이 토큰을 검증해 세션을 받고, 주소에서 토큰을 지웁니다(`?room=`이 있었으면 유지).
3. 세션은 `localStorage`의 `ganpanda.session`에 저장(90일). 새로고침해도 유지되고, 만료되면 자동으로 로그아웃 상태가 됩니다.
4. 계정 메뉴(상단 이름 버튼): 이메일·요금제, **저장 용량·멤버 수(2026-10-21 — 전엔 동시 작업 인원)·이번 달 제안 건수 사용량/한도**. 같은 아이디를 다른 기기에서 동시에 쓰면 [다른 곳 로그아웃]/[여기서 로그아웃]을 묻는다 → [../product/pricing.md](../product/pricing.md), 표시 이름 변경(계정에 저장), 로그아웃.
5. **개발 모드**(`AUTH_DEV_LINK=1`): 서버가 링크를 응답에 돌려주고, 로그인 창에 "개발 모드: 바로 로그인" 버튼이 나타납니다. E2E도 이 경로를 씁니다.
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
- **계정 메뉴**(상단 이름 단추): 이메일·요금제·사용량·표시 이름·비밀번호·로그아웃. 상단 바가 `overflow: hidden`이라 휴대폰에서 메뉴가 잘려 로그아웃이 안 보이던 문제(2026-10-21 "사용자 누르면 나오는 정보가 모바일에서 가려진다", "로그아웃 기능이 없다") → 메뉴를 `position: fixed`로 바 바깥에(`tests/e2e/mobile.spec.ts` "계정 메뉴").
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
- **어디서**: 설정 → **계정** 탭 "사업자 확인"(`business-section`): 사업자등록번호(`biz-no`, 자동 하이픈·검증 자릿수 `isValidBizNo`) · 대표자 성명(`biz-owner`) · 개업일자(`biz-start`, 2020-01-05 / 20200105) · 상호(선택 `biz-name`) → [확인](`biz-verify`). 확인되면 `biz-verified`(상호·번호·대표자·개업일·상태·확인일) + [떼기](`biz-remove`, 확인 창).
- **서버** `PUT /api/me/business {no, ownerName, startDate, name?}` → 국세청 공공데이터 API **진위확인**(`api.odcloud.kr/api/nts-businessman/v1/validate`, 키 `NTS_API_KEY` = data.go.kr 일반 인증키 Decoding). 응답: 200 `{business}` / 400 `{error: bad_input|mismatch|not_registered}` / 409 `taken`(다른 계정이 쓰는 번호 — 계정 하나 = 사업자 하나, 번호는 계정 사이에 유일) / 502 `nts_unavailable` / 503 `not_configured`. `DELETE` 로 뗀다. `GET /api/me` 에 `business`.
- **상태**: 국세청 `b_stt_cd` 01 계속(`active`) · 02 휴업(`suspended`) · 03 폐업(`closed`). 폐업·휴업도 저장하고 경고로 보인다. **재조회**: 매시간 cron 에서 `checked_at` 30일 지난 것 100개씩 **상태조회**(`/status`)로 갱신(`recheckBusinesses`).
- **제안 페이지 배지**: `/api/projects/:id/access` 에 소유자의 `business {name, status}` → 상태가 계속사업자면 제안 페이지 머리에 "✓ 사업자 확인된 간판집 · 상호"(`proposal-business`). 돈이 간판다를 거치지 않는 구조에서 고객이 믿을 근거.
- **업종은 확인 안 함**(API 가 안 줌). 대표자명 불일치 때 사업자등록증 사진 + 운영자 승인 경로는 아직 없음(안내 문구만) — 필요해지면 추가.
- **로컬·E2E**: `.dev.vars` `NTS_API_KEY=fake` → 가짜 응답(대표자명 "홍길동" = 일치, 번호가 999 로 시작 = 폐업). 테스트: `server/test/business.test.ts`(가짜 국세청 `setNtsFetch`), `tests/unit/business.test.ts`, `tests/e2e/business.spec.ts`.
- 아직 쓰이지 않는 것: 체험·요금 "사업자당 1번"은 체험 전환을 구현할 때 이 테이블을 쓴다 → [../product/pricing.md](../product/pricing.md).

## 남은 일
- 운영 자격 등록: 카카오는 됨(2026-10-21). 구글·애플은 각 콘솔에 리디렉션 URI + `wrangler secret put` → [../server/deploy.md](../server/deploy.md)
- 매직링크 요청 횟수 제한, 계정 메뉴에서 연결된 공급자 보기
