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
- R2 버킷 `ganpanda-assets`는 첫 배포(2026-10-13) 때 자동 생성
- 배포 뒤 확인: `/api/health` 200, 실시간 접속·퇴장 프로브, 에셋 PUT 201 → GET 동일 바이트

## 배포 (앱)
- 루트 `wrangler.jsonc`: Workers 정적 에셋 호스팅(`assets.directory = dist`, SPA 폴백). Cloudflare Pages는 쓰지 않습니다(2026-10-13 결정).
- 명령: `npm run deploy` (= `npm run build && wrangler deploy`). 빌드는 `.env.production`의 `VITE_SYNC_URL=https://sync.ganpanda.co.kr`을 씁니다.
- 주소: **`https://ganpanda.co.kr`**, `https://www.ganpanda.co.kr` + 비상용 `https://ganpanda.gaonax-dev.workers.dev`
- 임시 조치: 도메인 전파 전에는 `VITE_SYNC_URL=https://ganpanda-sync.gaonax-dev.workers.dev npx vite build && npx wrangler deploy`로 올려 두었습니다. 전파 뒤 `npm run deploy`로 되돌립니다.

## AI 모델 파일 (R2)
- `server/scripts/models.sh --local`(개발·E2E) / `--remote`(운영): SlimSAM 양자화 파일 4개를 R2 `models/slimsam/` 아래에 올립니다. 운영 업로드는 2026-10-13 완료.
- 앱의 `npm run dev`/`build`는 `npm run ort`로 onnxruntime wasm 을 `public/ort/`에 복사합니다(커밋 안 함).

## 도메인 `ganpanda.co.kr`
- Cloudflare 영역에 추가됨. 커스텀 도메인(`routes[].custom_domain`)은 배포 시 DNS 레코드가 자동 생성됩니다.
- **등록기관 네임서버를 Cloudflare 것으로 바꿔야 외부에서 접속됩니다.** 전파 확인: `dig +short NS ganpanda.co.kr`에 `*.ns.cloudflare.com`이 나오면 완료.
- **주의**: 인증(1-2) 전까지는 방 ID만 알면 누구나 접속할 수 있으니 주소를 외부에 공유하지 않습니다 → [api.md](api.md)
