// 채널 라이브러리 (2026-10-23 사용자: "간판 선택하고 채널 나오면 사용자들이 퀵으로 선택하고 여기에서 디테일을 추가하거나 빼는 방향으로")
import { expect, test, type Page } from '@playwright/test';
import { dragOnPhoto, openObjectSettings, openOwnedProject, pickCategory, uploadPhoto } from './helpers';

const partOf = (page: Page) => page.evaluate(() => JSON.parse(JSON.stringify((window as unknown as { __ganpanda: { objects: { parts?: unknown[] }[] } }).__ganpanda.objects[0].parts?.[0] ?? null)));

test('채널을 넣으면 15종 사진이 나오고, 고르면 종류·옵션이 들어가고, 세부를 고치면 "직접 고침"', async ({ page, request }) => {
  await openOwnedProject(page, request, '채널 라이브러리');
  await uploadPhoto(page);
  await page.keyboard.press('t');
  await dragOnPhoto(page, [400, 200], [800, 300]);
  await pickCategory(page, 'sign');
  await openObjectSettings(page);
  await page.getByTestId('object-settings').getByTestId('quick-add').click();
  await page.getByTestId('add-part-channel').click();
  const ch = page.getByTestId('part-card').filter({ has: page.locator('[data-kind="channel"]') });
  // 새 채널: 사진 고르기가 펼쳐져 있다
  await expect(ch.getByTestId('preset-pick')).toHaveCount(15);
  await expect(ch.getByTestId('preset-pick').first().locator('img')).toHaveAttribute('src', '/channel-types/01.webp');
  await ch.getByTestId('preset-pick').nth(6).click(); // 07 캡 전후광
  // 고르면 접히고 고른 것이 보인다 · 세부 칸에 값
  await expect(ch.getByTestId('preset-pick')).toHaveCount(0);
  await expect(ch.getByTestId('preset-current')).toContainText('캡 전후광 채널');
  await expect(ch.getByTestId('preset-gap')).toContainText('띄움 거리');
  await expect(ch.getByTestId('part-type')).toHaveValue('ch-both');
  await expect(ch.getByTestId('part-option-chType')).toHaveValue('캡');
  await expect(ch.getByTestId('part-option-bracket')).toBeChecked();
  expect((await partOf(page)).options).toMatchObject({ faceCode: '빨강', capCode: '검정' });
  // 세부를 빼면 묶음 그대로가 아님 → "직접 고침"
  await ch.getByTestId('part-option-bracket').uncheck();
  await expect(ch.getByTestId('preset-current')).toContainText('직접 고침');
  // 다시 펼쳐 다른 것으로
  await ch.getByTestId('preset-open').click();
  await ch.getByTestId('preset-pick').nth(8).click(); // 09 후광
  await expect(ch.getByTestId('part-type')).toHaveValue('ch-halo');
  await expect(ch.getByTestId('preset-current')).toContainText('후광 채널');
});
