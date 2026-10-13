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
        bindings: { TEST_MIGRATIONS: migrations, AUTH_DEV_LINK: '1', APP_URL: 'http://localhost:5199' },
      },
    }),
  ],
  test: { setupFiles: ['./test/setup.ts'] },
});
