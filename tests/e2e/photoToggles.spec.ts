// 사진 머리글의 [정보]·[구별선] 토글 (2026-10-24 사용자: "사진에 정보, 구별선 토글버튼으로 사진에서 표시제어")
import { expect, test } from '@playwright/test';
import { openOwnedProject, uploadPhoto } from './helpers';

test('[정보]를 끄면 사인물 이름·치수 글자와 실측 점이, [구별선]을 끄면 외곽선이 사라진다 — 고른 사인물은 그대로 보이고, 끈 상태는 이 기기에 남는다', async ({ page, request }) => {
  await openOwnedProject(page, request);
  await uploadPhoto(page);
  const [a, b] = await page.evaluate(() => {
    const g = (window as unknown as { __ganpanda: { photos: { id: string }[]; project: { addObject(o: unknown): string } } }).__ganpanda;
    return [0, 1].map((i) => g.project.addObject({ photoId: g.photos[0].id, name: `간판${i}`, shape: 'rect', quad: [[100 + i * 700, 100], [600 + i * 700, 100], [600 + i * 700, 300], [100 + i * 700, 300]], sheetIds: [] }));
  });
  const label = page.locator('[data-testid="sign-label"]');
  const info = page.getByTestId('photo-toggle-info'), lines = page.getByTestId('photo-toggle-lines');
  await expect(label).toHaveCount(2);
  await expect(info).toHaveAttribute('aria-pressed', 'true');
  await info.click();
  await expect(info).toHaveAttribute('aria-pressed', 'false');
  await expect(label).toHaveCount(0);
  await expect(page.getByTestId('sign-unmeasured')).toHaveCount(0);
  const stroke = (id: string) => page.locator(`[data-testid="sign-shape"][data-id="${id}"]`).evaluate((e) => getComputedStyle(e).strokeOpacity);
  expect(await stroke(a)).not.toBe('0');
  await lines.click();
  await expect(lines).toHaveAttribute('aria-pressed', 'false');
  expect(await stroke(a)).toBe('0');
  // 고른 사인물은 외곽선·글자가 보인다 (눌러서 고를 수 있다 — 투명해도 잡힌다)
  await page.locator(`[data-testid="sign-shape"][data-id="${b}"]`).click({ force: true });
  await expect.poll(() => page.evaluate(() => (window as unknown as { __ganpanda: { selectedId: string | null } }).__ganpanda.selectedId)).toBe(b);
  expect(await stroke(b)).not.toBe('0');
  await expect(label).toHaveCount(1);
  // 새로고침해도 그대로 (이 기기)
  await page.reload();
  await expect(page.getByTestId('photo-toggle-info')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByTestId('photo-toggle-lines')).toHaveAttribute('aria-pressed', 'false');
});

test('휴대폰 폭은 사진 ⚙ 메뉴에 [정보 숨기기]·[구별선 숨기기] (머리글이 좁다)', async ({ page, request }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await openOwnedProject(page, request);
  await uploadPhoto(page);
  await page.evaluate(() => { const g = (window as unknown as { __ganpanda: { photos: { id: string }[]; project: { addObject(o: unknown): string } } }).__ganpanda; g.project.addObject({ photoId: g.photos[0].id, name: '간판', shape: 'rect', quad: [[100, 100], [600, 100], [600, 300], [100, 300]], sheetIds: [] }); });
  await expect(page.getByTestId('photo-toggle-info')).toHaveCount(0);
  await expect(page.locator('[data-testid="sign-label"]')).toHaveCount(1);
  await page.getByTestId('photo-menu').click();
  await page.getByTestId('photo-menu-info').click();
  await expect(page.locator('[data-testid="sign-label"]')).toHaveCount(0);
  await page.getByTestId('photo-menu').click();
  await expect(page.getByTestId('photo-menu-info')).toContainText('정보 보이기');
});
