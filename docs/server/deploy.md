# 로컬 실행과 배포

## 로컬
```bash
cd server
npm install
npm run dev      # wrangler dev --port 8787 (DO·R2 로컬 시뮬레이션, 계정 불필요)
npm test         # Workers 런타임 테스트
npm run types    # wrangler.jsonc 변경 후 타입 재생성
```

## 설정 (`server/wrangler.jsonc`)
- Durable Object 바인딩 `ROOM` → 클래스 `Room` (마이그레이션 `v1`, SQLite)
- R2 바인딩 `ASSETS` → 버킷 `ganpanda-assets`
- `observability.enabled = true`

## 앱에서 서버 지정
- 앱의 `VITE_SYNC_URL`(`.env`, 예시는 `.env.example`)에 서버 주소를 넣고 빌드합니다. 비우면 개발 중에는 `http://localhost:8787`, 운영 빌드에서는 서버 없이 로컬 모드로 동작합니다.
- E2E(`npm run e2e`)는 `wrangler dev`를 자동으로 띄웁니다.

## 배포
- 계정: Cloudflare (`npx wrangler whoami`로 확인). 배포 명령: `cd server && npm run deploy`
- **현재 배포 주소**: `https://ganpanda-sync.gaonax-dev.workers.dev` (2026-10-13 첫 배포, R2 버킷 `ganpanda-assets` 자동 생성)
- 배포 뒤 확인: `/api/health` 200, 실시간 접속·퇴장(`scratchpad` 프로브), 에셋 PUT 201 → GET 동일 바이트
- 앱에서 쓰려면 `.env`에 `VITE_SYNC_URL=https://ganpanda-sync.gaonax-dev.workers.dev`
- 서비스 도메인이 정해지면 `wrangler.jsonc`에 `routes`를 추가해 `sync.<도메인>` 같은 주소로 바꿉니다.
- **주의**: 인증(1-2)이 붙기 전까지는 방 ID만 알면 누구나 접속할 수 있습니다. 주소를 외부에 공유하지 않습니다 → [api.md](api.md)
