// 데스크톱·모바일 앱(Tauri) 안에서 (2026-10-24 "카카오 앱으로 로그인 해야지"): 앱의 초기화 스크립트가 <html data-ganpanda-app="1"> 을 표시하면
// 카카오 로그인 링크는 app=1 을 붙여 시스템 브라우저(target=_blank)로 — 끝나면 서버가 ganpanda://login#session= 으로 앱을 다시 연다
import { expect, test } from '@playwright/test';

test('앱 안: 카카오 링크에 app=1 + 새 창', async ({ page }) => {
  await page.addInitScript(() => { (window as unknown as { __GANPANDA_APP__: boolean }).__GANPANDA_APP__ = true; });
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByTestId('landing-consumer').click();
  const gate = page.getByTestId('consumer-login-kakao');
  await expect(gate).toHaveAttribute('href', /app=1/, { timeout: 15_000 });
  await expect(gate).toHaveAttribute('target', '_blank');
  await page.getByTestId('consumer-login-other').click();
  await expect(page.getByTestId('social-kakao')).toHaveAttribute('href', /app=1/);
  await expect(page.getByTestId('social-kakao')).toHaveAttribute('target', '_blank');
});

test('웹(브라우저)에서는 app=1 도 새 창도 없다', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByTestId('landing-consumer').click();
  const gate = page.getByTestId('consumer-login-kakao');
  await expect(gate).toHaveAttribute('href', /kakao\/start/, { timeout: 15_000 });
  expect(await gate.getAttribute('href')).not.toContain('app=1');
  expect(await gate.getAttribute('target')).toBeNull();
});
