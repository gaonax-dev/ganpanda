import path from 'node:path';
import { defineConfig } from 'vitest/config';
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin';

const migrations = await readD1Migrations(path.join(import.meta.dirname, 'migrations'));

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './wrangler.jsonc' },
      miniflare: {
        // 테스트에서는 이메일 대신 링크를 응답에 돌려준다
        bindings: {
          TEST_MIGRATIONS: migrations, AUTH_DEV_LINK: '1', APP_URL: 'http://localhost:5199',
          // 운영자 복원 API (2026-10-21 백업 2단계)
          ADMIN_TOKEN: 'test-admin',
          // 소셜 로그인 테스트용 가짜 자격 (외부 호출은 fetchMock 으로 대체)
          GOOGLE_CLIENT_ID: 'g-client', GOOGLE_CLIENT_SECRET: 'g-secret',
          KAKAO_CLIENT_ID: 'k-client', KAKAO_CLIENT_SECRET: 'k-secret',
          APPLE_CLIENT_ID: 'kr.co.ganpanda.web', APPLE_TEAM_ID: 'TEAM123456', APPLE_KEY_ID: 'KEY123',
        },
      },
    }),
  ],
  test: { setupFiles: ['./test/setup.ts'] },
});
