import { expect, test, type Page } from '@playwright/test';
import { apiCreateInvite, dragOnPhoto, openInvited, openOwnedProject, uploadPhoto } from './helpers';

async function clickPhoto(page: Page, x: number, y: number) {
  const b = (await page.getByTestId('photo-img').first().boundingBox())!;
  const k = b.width / 1600;
  await page.mouse.click(b.x + x * k, b.y + y * k);
}

test('존 도구로 작업 존을 그리고, 변 중간 클릭으로 꼭짓점 추가, 꼭짓점 선택 후 Delete 로 삭제', async ({ page, request, browser }) => {
  const { session, projectId } = await openOwnedProject(page, request);
  await uploadPhoto(page);
  await page.keyboard.press('z');
  await expect(page.getByTestId('tool-zone')).toHaveClass(/on/);
  await dragOnPhoto(page, [200, 100], [1400, 900]);
  await expect(page.getByTestId('zone-shape')).toHaveCount(1);
  await expect(page.getByTestId('zone-vertex')).toHaveCount(4);
  await expect(page.getByTestId('zone-mid')).toHaveCount(4);

  // 위쪽 변 중간(800,100) 클릭 → 꼭짓점 5개
  await page.getByTestId('zone-mid').first().click();
  await expect(page.getByTestId('zone-vertex')).toHaveCount(5);

  // 새 꼭짓점을 아래로 끌어 모양을 바꾼다
  const v = page.getByTestId('zone-vertex').nth(1);
  const vb = (await v.boundingBox())!;
  await page.mouse.move(vb.x + vb.width / 2, vb.y + vb.height / 2);
  await page.mouse.down();
  await page.mouse.move(vb.x + vb.width / 2, vb.y + vb.height / 2 + 60, { steps: 5 });
  await page.mouse.up();
  const pts = (await page.getByTestId('zone-shape').getAttribute('points'))!.split(' ').map((p) => p.split(',').map(Number));
  expect(pts[1][1]).toBeGreaterThan(150);

  // 꼭짓점 선택 → Delete → 4개
  await page.getByTestId('zone-vertex').nth(1).click();
  await expect(page.getByTestId('zone-vertex').nth(1)).toHaveClass(/sel/);
  await page.keyboard.press('Delete');
  await expect(page.getByTestId('zone-vertex')).toHaveCount(4);

  // 3개 미만으로는 안 줄어든다
  await page.getByTestId('zone-vertex').nth(0).click(); await page.keyboard.press('Delete');
  await expect(page.getByTestId('zone-vertex')).toHaveCount(3);
  await page.getByTestId('zone-vertex').nth(0).click(); await page.keyboard.press('Delete');
  await expect(page.getByTestId('zone-vertex')).toHaveCount(3);

  // ⌘Z 로 되돌리기
  await page.getByTestId('board-canvas').hover();
  await page.keyboard.press('ControlOrMeta+z');
  await expect(page.getByTestId('zone-vertex')).toHaveCount(4);

  // 고객은 존을 보지만 핸들은 없다
  const guest = await openInvited(browser, await apiCreateInvite(request, session, projectId, 'viewer'));
  await expect(guest.getByTestId('zone-shape')).toHaveCount(1);
  await expect(guest.getByTestId('zone-vertex')).toHaveCount(0);
  await guest.ctx.close();
});

test('존은 여러 개: 드래그할 때마다 추가되고, 존을 선택해 Delete 하면 그 존만 지워진다', async ({ page, request }) => {
  await openOwnedProject(page, request);
  await uploadPhoto(page);
  await page.keyboard.press('z');
  await dragOnPhoto(page, [100, 100], [600, 400]);
  await page.keyboard.press('z');
  await dragOnPhoto(page, [700, 500], [1500, 900]);
  await expect(page.getByTestId('zone-shape')).toHaveCount(2);
  const second = (await page.getByTestId('zone-shape').nth(1).getAttribute('points'))!;
  expect(second.startsWith('700,500')).toBe(true);
  // 두 번째 존이 선택된 상태 → 핸들은 그 존 것만
  await expect(page.getByTestId('zone-vertex')).toHaveCount(4);
  await page.keyboard.press('Escape');
  await clickPhoto(page, 300, 200); // 첫 존 안쪽 클릭 → 첫 존 선택
  await expect(page.getByTestId('zone-vertex')).toHaveCount(4);
  await page.keyboard.press('Delete');
  await expect(page.getByTestId('zone-shape')).toHaveCount(1);
  expect((await page.getByTestId('zone-shape').getAttribute('points'))!.startsWith('700,500')).toBe(true);
  await clickPhoto(page, 300, 200); // 존 밖(선택 도구) → 선택 해제
  await expect(page.getByTestId('zone-vertex')).toHaveCount(0);
});
