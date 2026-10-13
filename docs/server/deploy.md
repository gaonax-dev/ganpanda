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

## 배포 (아직 안 함)
- Cloudflare 계정이 필요합니다: `npx wrangler login` → `npm run deploy`
- R2 버킷은 배포할 때 자동 생성되거나, `npx wrangler r2 bucket create ganpanda-assets`로 만듭니다.
- **인증이 붙기 전에는 공개 배포하지 않습니다** → [api.md](api.md)
