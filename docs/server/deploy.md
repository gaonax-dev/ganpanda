# 로컬 실행과 배포

## 로컬
```bash
cd server
npm install
npm run dev      # wrangler dev --port 8787 (DO·R2 로컬 시뮬레이션, 계정 불필요)
npm test         # Workers 런타임 테스트
npm run types    # wrangler.jsonc 변경 후 타입 재생성
```

## D1 (계정 데이터)
- 데이터베이스 `ganpanda` (id `071b8dc9-…`), 마이그레이션 `server/migrations/`.
- 로컬: `npx wrangler d1 migrations apply ganpanda --local` (E2E 는 자동). 운영: `npx wrangler d1 migrations apply ganpanda --remote` 를 배포 전에 실행.
- 테스트는 `vitest.config.ts` 에서 마이그레이션을 읽어 `test/setup.ts` 로 적용합니다.

## 설정 (`server/wrangler.jsonc`)
- Durable Object 바인딩 `ROOM` → 클래스 `Room` (마이그레이션 `v1`, SQLite)
- R2 바인딩 `ASSETS` → 버킷 `ganpanda-assets`
- D1 바인딩 `DB` → `ganpanda`, `vars.APP_URL` = 매직링크가 가리킬 앱 주소
- `.dev.vars`(커밋 안 함): `AUTH_DEV_LINK=1`, `APP_URL=http://localhost:5173`
- `observability.enabled = true`

## 앱에서 서버 지정
- 앱의 `VITE_SYNC_URL`(`.env`, 예시는 `.env.example`)에 서버 주소를 넣고 빌드합니다. 비우면 개발 중에는 `http://localhost:8787`, 운영 빌드에서는 서버 없이 로컬 모드로 동작합니다.
- E2E(`npm run e2e`)는 `wrangler dev`를 자동으로 띄웁니다.

## 배포 (서버)
- 계정: Cloudflare (`npx wrangler whoami`). 명령: `cd server && npm run deploy`
- 주소: **`https://sync.ganpanda.co.kr`** (커스텀 도메인) + 비상용 `https://ganpanda-sync.gaonax-dev.workers.dev` (`workers_dev: true`)
- 배포 전 `npx wrangler d1 migrations apply ganpanda --remote`. 2026-10-13 1차 전체(인증·프로젝트·한도·이메일·모델 제공) 배포 완료.
- R2 버킷 `ganpanda-assets`는 첫 배포(2026-10-13) 때 자동 생성
- 배포 뒤 확인: `/api/health` 200, 실시간 접속·퇴장 프로브, 에셋 PUT 201 → GET 동일 바이트

## 배포 (앱)
- 루트 `wrangler.jsonc`: Workers 정적 에셋 호스팅(`assets.directory = dist`, SPA 폴백). Cloudflare Pages는 쓰지 않습니다(2026-10-13 결정).
- 명령: `npm run deploy` (= `npm run build && wrangler deploy`). 빌드는 `.env.production`의 `VITE_SYNC_URL=https://sync.ganpanda.co.kr`을 씁니다.
- 주소: **`https://ganpanda.co.kr`**, `https://www.ganpanda.co.kr` + 비상용 `https://ganpanda.gaonax-dev.workers.dev`
- 도메인 전파 전에는 workers.dev 서버 주소로 임시 빌드했었음 — 전파 뒤에는 `npm run deploy`(= `.env.production`의 `sync.ganpanda.co.kr`)로 배포.

## AI 모델·런타임 파일 (R2)
- `server/scripts/models.sh --local`(개발·E2E) / `--remote`(운영): SlimSAM 양자화 파일 4개(`models/slimsam/`)와 onnxruntime-web 런타임 8개(`models/ort/`, `.mjs`는 `text/javascript`, `.wasm`은 `application/wasm`)를 R2 에 올립니다. 운영 업로드 2026-10-13 완료.
- 런타임을 앱 정적 에셋으로 넣지 않는 이유: `asyncify.wasm`이 25.6MiB 로 Workers 정적 에셋 한도(25MiB)를 넘습니다. 워커는 `wasmPaths = <서버>/api/models/ort/`로 받습니다.
- Vite 가 onnxruntime-web 의 `import.meta.url` 참조 때문에 wasm 을 `dist/assets/`에 내보내므로, `npm run build`가 끝에 `scripts/strip-ort.mjs`로 제거합니다(안 지우면 배포가 "Asset too large"로 실패).

## 이메일 발송 (Cloudflare Email Sending)
- `wrangler.jsonc`의 `send_email: [{ name: "EMAIL" }]`. 발신 주소 `login@ganpanda.co.kr`.
- **요금제**: 불특정 주소로 보내려면 Workers Paid(월 $5, 월 3,000통 포함, 초과 1,000통당 $0.35). 2026-10-13 Paid 로 전환.
- **도메인 온보딩(한 번, 완료)**: 대시보드 → Compute & AI → Email Service → Email Sending → Onboard Domain → `ganpanda.co.kr` → Add records and onboard. CLI(`wrangler email sending enable`)는 토큰에 `email_sending:write` 권한이 필요합니다. 온보딩 직후 첫 발송은 502 가 날 수 있고 잠시 뒤 정상(실제 겪음).
- 로컬 `wrangler dev`는 기본이 시뮬레이션(콘솔 로그, 실제 발송 없음). 실제 발송을 테스트하려면 바인딩에 `remote: true`.
- 운영 메일 한도·반송 관리 → Cloudflare 문서 Limits / Deliverability.

## 소셜 로그인 자격 (운영 등록 절차)
공급자 콘솔에 **리디렉션 URI** `https://sync.ganpanda.co.kr/api/auth/<공급자>/callback`를 등록하고, 아래 비밀값을 `cd server && npx wrangler secret put <이름>`으로 넣습니다(로컬은 `.dev.vars`). xlpop 의 자격을 재사용할 수 있습니다(콘솔에 URI 만 추가).
| 공급자 | 콘솔 설정 | 비밀값 |
|---|---|---|
| 카카오 | 카카오 디벨로퍼스 → 앱 → 카카오 로그인 활성화, Redirect URI 등록, 동의항목 이메일·닉네임, 보안 Client Secret 사용 | `KAKAO_CLIENT_ID`(REST API 키), `KAKAO_CLIENT_SECRET` |
| Google | Cloud Console → OAuth 클라이언트(웹) → 승인된 리디렉션 URI 추가 | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` |
| Apple | Developer → Identifiers → Services ID(또는 기존 것) → Sign in with Apple 설정에 도메인 `ganpanda.co.kr`·`sync.ganpanda.co.kr`과 Return URL 추가, Keys 의 Sign in with Apple 키(.p8) | `APPLE_CLIENT_ID`(Services ID), `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY`(.p8 전체, 줄바꿈은 `\n` 가능) |
- `.p8`은 `npx wrangler secret put APPLE_PRIVATE_KEY < AuthKey_XXXX.p8`로 파일에서 넣습니다.
- 배포 전 `npx wrangler d1 migrations apply ganpanda --remote`(0004_identities).

## 도메인 `ganpanda.co.kr`
- Cloudflare 영역에 추가됨. 커스텀 도메인(`routes[].custom_domain`)은 배포 시 DNS 레코드가 자동 생성됩니다.
- 2026-10-13 네임서버 전파 완료(`titan`/`venus.ns.cloudflare.com`). `ganpanda.co.kr`, `www`, `sync` 모두 동작.
- **주의**: 인증(1-2) 전까지는 방 ID만 알면 누구나 접속할 수 있으니 주소를 외부에 공유하지 않습니다 → [api.md](api.md)
