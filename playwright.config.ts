import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  use: { baseURL: 'http://localhost:5199', channel: 'chrome', viewport: { width: 1440, height: 900 } },
  webServer: [
    { command: 'npx vite --port 5199 --strictPort', port: 5199, reuseExistingServer: true },
    // 동기화 서버 (Cloudflare Workers 로컬 시뮬레이션)
    { command: 'npx wrangler d1 migrations apply ganpanda --local && npx wrangler dev --port 8787 --var PAYMENTS_LIVE:1' /* 카드 결제 흐름 테스트 — 정식 결제 전 신청 흐름은 beta- 계정(개발 전용) */, cwd: 'server', port: 8787, reuseExistingServer: true, timeout: 90_000 },
  ],
});
