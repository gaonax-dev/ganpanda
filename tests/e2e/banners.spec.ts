import { expect, test } from '@playwright/test';
import { openOwnedProject } from './helpers';

// 안내 배너는 본문 위 겹층 — 나타나고 사라져도 화면이 밀리지 않는다 (2026-10-18 사용자: "동시접속 안내 … 화면이 재정렬되고 사라지면 다시 제위치로 간다. 이건 문제다")
test('안내 배너가 나타나도 도구 막대·본문 자리가 그대로다', async ({ page, request }) => {
  await openOwnedProject(page, request);
  const tools = page.getByRole('toolbar');
  await expect(tools).toBeVisible();
  const before = (await tools.boundingBox())!;
  await page.evaluate(() => { (window as unknown as { __ganpanda: { notice: string } }).__ganpanda.notice = '동시 작업 인원 한도 안내 (테스트)'; });
  const notice = page.getByTestId('notice');
  await expect(notice).toBeVisible();
  const after = (await tools.boundingBox())!;
  expect(after.y).toBe(before.y);
  expect(after.x).toBe(before.x);
  // 배너는 본문 맨 위에 떠 있다 (본문 안, 흐름 밖)
  const main = (await page.locator('main').boundingBox())!, nb = (await notice.boundingBox())!;
  expect(Math.abs(nb.y - main.y)).toBeLessThanOrEqual(1);
  await notice.getByRole('button').click();
  await expect(notice).toHaveCount(0);
  expect((await tools.boundingBox())!.y).toBe(before.y);
});
