# 계정·로그인


## 이메일·비밀번호 (기본, 2026-10-15)
사용자: "로그인 방식 이메일 확인 방식이 정식 방법은 아니지?" → "oauth 는 유지하는데 기본 이메일 비밀번호 방식이 필요해".
- **로그인 창**(`LoginDialog.svelte`, `data-mode`): 기본 **로그인**(이메일·비밀번호) / **회원가입**(이메일·비밀번호 8자 이상·확인·이름) / **비밀번호 찾기**(재설정 메일) / **이메일 링크로 로그인**(기존 매직 링크). 카카오·구글·애플 버튼은 로그인·가입 화면 위에 그대로.
- **서버**: `POST /api/auth/signup`(201, 이미 있는 이메일 409), `POST /api/auth/login`(401 / 같은 이메일 15분에 10번 틀리면 429 잠금, `login_failures`), `POST /api/auth/email {reset:true}` → `/login?token=&reset=1` 재설정 메일, `POST /api/me/password {password, current?}`(비밀번호가 있으면 현재 비밀번호 필요 403, **재설정 링크로 만든 세션은 15분 동안 면제** `sessions.reset_until`). 해시는 PBKDF2-SHA256 10만 회 + 16바이트 salt(`server/src/password.ts`), 상수 시간 비교. `/api/me` 의 `account.hasPassword`.
- **가입 이메일 인증**(2026-10-15 사용자: "가입할 때 이메일 인증도 받게 해줘"): 가입하면 세션 대신 **인증 메일**(`/login?token=&verify=1`, 24시간 유효)을 보냅니다. 링크를 열면 인증되고 로그인되며 "이메일 인증이 끝났습니다" 안내. **인증 전 비밀번호 로그인은 403** → 로그인 창에 [인증 메일 다시 받기](`login-resend-verify`, `POST /api/auth/resend-verify` — 가입 여부를 드러내지 않게 항상 202). 인증 전 같은 이메일로 다시 가입하면 비밀번호를 덮고 메일을 다시 보냄(먼저 걸어 둔 남의 비밀번호가 남지 않음). 인증된 이메일은 409.
- **이메일 가로채기 방지**: 비밀번호 가입은 이메일 확인 전(`email_verified = 0`). 그 이메일의 주인이 메일 링크·소셜(공급자가 확인한 이메일)로 들어오면 확인 처리하면서 **확인 전에 걸린 비밀번호를 지웁니다**(`markEmailVerified`) — 남이 먼저 내 이메일로 비밀번호를 걸어 두는 것을 막음. 기존 계정은 모두 확인된 것으로 이전.
- **앱**: 재설정 링크로 들어오면 바로 "새 비밀번호 정하기"(`PasswordDialog.svelte`, 현재 비밀번호 없이). 계정 메뉴·설정 "계정 · 구독"에서 비밀번호 만들기/바꾸기(`open-password`, `settings-password`).
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
- **계정 연결 규칙**(`identities` 테이블): 같은 공급자 ID → 기존 계정. 없으면 같은 이메일의 계정에 연결(이메일 로그인 계정과 합쳐짐). 둘 다 없으면 새 계정. 공급자가 이메일을 안 주면(카카오 동의 안 함) `kakao-<id>@noemail.ganpanda.co.kr` 같은 대체 이메일.
- 애플: client secret 은 `.p8` 키로 ES256 서명한 JWT(1시간), 돌아온 `id_token`은 애플 공개키(JWKS)로 서명·`iss`·`aud`·만료를 검증. 이름은 첫 로그인 때만 `user` 폼 필드로 옴. 이메일은 비공개 릴레이 주소일 수 있음.
- 자격이 없는 공급자는 `GET /api/auth/providers`에서 빠지고 앱이 버튼을 숨깁니다. 로컬 `.dev.vars`에는 자리값이 들어 있어 버튼은 보이지만 실제 로그인은 안 됩니다.
- 서버의 공급자 호출은 `setOauthFetch`로 바꿔 끼울 수 있어 테스트가 가짜 공급자로 전 흐름을 검사합니다(`server/test/social.test.ts`).

## 이메일 발송 규칙
- 메일: 제목 `[간판다] 로그인 링크`, 텍스트·HTML 둘 다, 버튼 + 주소 원문, "15분 유효·1회용" 안내.
- 바인딩이 없으면 503, 발송 실패(한도 초과 등)면 502 를 돌려주고 **그 토큰은 즉시 폐기**합니다(떠도는 링크 방지). 앱은 "잠시 후 다시 시도" 안내.
- 테스트는 `EMAIL.send`를 가짜로 바꿔 메시지 구성과 실패 처리를 검사합니다(`server/test/email.test.ts`).

## 남은 일
- 운영 자격 등록(각 콘솔에 리디렉션 URI + `wrangler secret put`) → [../server/deploy.md](../server/deploy.md)
- 매직링크 요청 횟수 제한, 계정 메뉴에서 연결된 공급자 보기
