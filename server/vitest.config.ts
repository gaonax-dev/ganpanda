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
          TEST_MIGRATIONS: migrations, AUTH_DEV_LINK: '1', APP_URL: 'http://localhost:5199', OPERATOR_EMAILS: 'op@example.com',
          // 운영자 복원 API (2026-10-21 백업 2단계)
          ADMIN_TOKEN: 'test-admin',
          // 소셜 로그인 테스트용 가짜 자격 (외부 호출은 fetchMock 으로 대체)
          GOOGLE_CLIENT_ID: 'g-client', GOOGLE_CLIENT_SECRET: 'g-secret',
          KAKAO_CLIENT_ID: 'k-client', KAKAO_CLIENT_SECRET: 'k-secret',
          NTS_API_KEY: 'test-nts', // 사업자 확인 (국세청 호출은 setNtsFetch 로 대체)
          // 결제 (토스 호출은 setTossFetch 로 대체)
          TOSS_CLIENT_KEY: 'test_ck_ganpanda', TOSS_SECRET_KEY: 'test_sk_ganpanda', TOSS_TEST_ALLOW_EMAILS: '', REQUEST_CREDITS: '', // 요청 크레딧 결제 (2026-10-24) — 운영처럼 기본 꺼짐, test/requestCredit.test.ts 가 켠다
          BILLING_ENC_KEY: '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff',
          APPLE_CLIENT_ID: 'kr.co.ganpanda.web', APPLE_TEAM_ID: 'TEAM123456', APPLE_KEY_ID: 'KEY123',
        },
      },
    }),
  ],
  test: { setupFiles: ['./test/setup.ts'] },
});
