import { expect, test } from '@playwright/test';
import { apiCreateInvite, dragOnPhoto, openInvited, openObjectSettings, openOwnedProject, uploadPhoto } from './helpers';

test('채널 간판에 문구를 넣으면 입체 보기로 3D 글자를 보고, 폰트 기준 폭을 치수에 넣을 수 있다', async ({ page, request, browser }) => {
  const { session, projectId } = await openOwnedProject(page, request);
  await uploadPhoto(page);
  await page.keyboard.press('r');
  await dragOnPhoto(page, [400, 200], [800, 300]);
  await page.getByTestId('category-sign').click();
  await openObjectSettings(page);
  await page.getByTestId('product-select').selectOption('ch-halo');
  await expect(page.getByTestId('open-letter3d')).toHaveCount(0); // 문구·높이 전에는 없음
  await page.getByTestId('sign-text').fill('간판다 카페');
  await page.getByTestId('height-mm').fill('600');
  await page.getByTestId('open-letter3d').click();
  await expect(page.getByTestId('letter3d-canvas')).toBeVisible();
  await expect(page.getByTestId('letter3d-width')).toContainText('mm', { timeout: 20_000 });
  const widthText = (await page.getByTestId('letter3d-width').textContent())!;
  const mm = Number(widthText.replace(/[^\d]/g, ''));
  expect(mm).toBeGreaterThan(2000);

  await page.getByTestId('letter3d-depth').fill('120');
  await page.getByTestId('letter3d-night').click();
  await expect(page.getByTestId('letter3d-night')).toHaveClass(/on/);
  await page.getByTestId('letter3d-apply-width').click();
  await page.getByTestId('close-letter3d').click();
  await expect(page.getByTestId('width-mm')).toHaveValue(String(Math.round(mm / 10) * 10));

  // 설정이 저장되어 다시 열면 유지, 고객도 열어 볼 수 있다
  await page.getByTestId('open-letter3d').click();
  await expect(page.getByTestId('letter3d-depth')).toHaveValue('120');
  await page.getByTestId('close-letter3d').click();
  const guest = await openInvited(browser, await apiCreateInvite(request, session, projectId, 'viewer'));
  await guest.getByTestId('sign-shape').click();
  await openObjectSettings(guest);
  await guest.getByTestId('open-letter3d').click();
  await expect(guest.getByTestId('letter3d-canvas')).toBeVisible();
  await expect(guest.getByTestId('letter3d-depth')).toBeDisabled();
  await guest.ctx.close();
});
