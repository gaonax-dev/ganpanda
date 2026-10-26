// 설정 창 탭 (2026-10-21 사용자: "설정을 내용별로 탭으로 분리해줘")
import { expect, test } from '@playwright/test';
import { apiLogin, openOwnedProject, openSettings } from './helpers';

test('설정은 계정 · 멤버 · 사양 사전 · 표시 · 단축키 탭으로 나뉘고, 처음엔 계정 탭', async ({ page, request }) => {
  await openOwnedProject(page, request);
  await openSettings(page);
  const dlg = page.getByTestId('settings');
  await expect(dlg.locator('[data-testid^="settings-tab-"]')).toHaveText(['계정', '멤버', '사양 사전', '요청 받기', '표시', '단축키']); // 요청 받기 탭은 2026-10-21 "켜는 걸로 진행해줘" 부터
  await expect(dlg.getByTestId('account-section')).toBeVisible();
  await expect(dlg.getByTestId('team-section')).toHaveCount(0);
  await expect(dlg.getByTestId('shortcut-row-toolRect')).toHaveCount(0);
  await dlg.getByTestId('settings-tab-keys').click();
  await expect(dlg.getByTestId('shortcut-row-toolRect')).toBeVisible();
  await expect(dlg.getByTestId('shortcuts-reset-all')).toBeVisible();
  await expect(dlg.getByTestId('account-section')).toHaveCount(0);
  await dlg.getByTestId('settings-tab-team').click();
  await expect(dlg.getByTestId('member-email')).toBeVisible();
  await expect(dlg.getByTestId('shortcuts-reset-all')).toHaveCount(0); // 단축키 탭에만
  await dlg.getByTestId('settings-tab-display').click();
  await expect(dlg.getByTestId('warn-measure')).toBeVisible();
});

test('로그인 없이 열면 표시 · 단축키만', async ({ page }) => {
  await page.goto('/');
  await openSettings(page);
  const dlg = page.getByTestId('settings');
  await expect(dlg.locator('[data-testid^="settings-tab-"]')).toHaveText(['표시', '단축키']);
  await expect(dlg.getByTestId('warn-measure')).toBeVisible();
});

// 2026-10-27 버그: 설정을 열면 refreshMe 가 account 를 새 객체로 바꾸고, 그 account 를 읽는 효과가 다시 refreshMe — 모든 API 를 초당 수십 번 다시 불렀다
// (Toss 결제경로 캡처 중 발견, 운영에서 설정 열어 둔 8초에 /api/me 13번)
test('설정을 열어 두어도 계정·구독 정보를 한 번만 불러온다 (다시 부르기 고리 없음)', async ({ page, request }) => {
  const s = await apiLogin(request);
  await page.goto('/');
  await page.evaluate((x) => { localStorage.clear(); localStorage.setItem('ganpanda.session', x); }, s);
  await page.reload();
  await page.getByTestId('account-menu').waitFor();
  await page.waitForTimeout(1000);
  const cnt: Record<string, number> = {};
  page.on('request', (r) => { const p = new URL(r.url()).pathname; if (p.startsWith('/api/me')) cnt[p] = (cnt[p] ?? 0) + 1; });
  await page.getByTestId('account-menu').click();
  await page.getByTestId('open-settings').last().click();
  await page.getByTestId('settings-tab-account').click();
  await page.waitForTimeout(4000);
  expect(cnt['/api/me'] ?? 0).toBeLessThanOrEqual(3);
  expect(cnt['/api/me/billing'] ?? 0).toBeLessThanOrEqual(3);
});
