// 어중간한 폭(태블릿·폴더블 가로, 721~1100px)에서 상단 막대가 잘리던 문제 (2026-10-25 사용자: "안드로이드 프로젝트뷰에서 상단 헤더가 가로 보기에서 가려진다") — 옆으로 밀 수 있게
import { expect, test } from '@playwright/test';
import { openOwnedProject, uploadPhoto } from './helpers';

test('900px 폭: 상단 막대가 넘치면 옆으로 밀어 끝까지 볼 수 있다', async ({ page, request }) => {
  await page.setViewportSize({ width: 900, height: 700 });
  await openOwnedProject(page, request, '폴드 가로');
  await uploadPhoto(page);
  const nav = page.getByTestId('top-nav');
  const m = await nav.evaluate((el) => ({ over: el.scrollWidth > el.clientWidth, ox: getComputedStyle(el).overflowX }));
  expect(m.ox).toBe('auto');
  if (m.over) {
    await nav.evaluate((el) => (el.scrollLeft = el.scrollWidth));
    const last = nav.locator(':scope > *:last-child');
    const b = (await last.boundingBox())!, n = (await nav.boundingBox())!;
    expect(b.x + b.width).toBeLessThanOrEqual(n.x + n.width + 1); // 끝 항목이 보인다
  }
});
