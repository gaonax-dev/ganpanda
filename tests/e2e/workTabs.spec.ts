// 작업 탭 (2026-10-22 사용자: "상단탭 실측,2d,3d,디자인,사인물리스트 / 디자인은 디자이너와 소통하는 곳으로 사진보드 그대로인데 사인물 디자인파일 연결하는 곳이다.
// 여기에 디자이너가 일러스트 파일도 올린다. 기존의 컨펌은 제거한다")
import { expect, test } from '@playwright/test';
import { openOwnedProject, uploadPhoto } from './helpers';

test('탭은 실측 · 2D · 3D · 디자인 · 사인물리스트 — 처음은 실측, 디자인은 사진보드 그대로 + 디자인 파일 올리기·연결, 컨펌 없음', async ({ page, request }) => {
  await openOwnedProject(page, request);
  await uploadPhoto(page);
  await expect(page.getByTestId('work-tabs').locator('button')).toHaveText(['실측', '2D', '3D', '디자인', '사인물리스트']);
  await expect(page.getByTestId('view-confirm')).toHaveCount(0);
  await expect(page.getByTestId('view-board')).toHaveClass(/on/);
  await page.getByTestId('stage-2d').click();
  await expect(page.getByTestId('stage-2d')).toHaveClass(/on/);
  await page.getByTestId('view-design').click();
  await expect(page.getByTestId('view-design')).toHaveClass(/on/);
  await expect(page.getByTestId('photo-zone')).toBeVisible(); // 사진보드 그대로
  await expect(page.getByTestId('design-bar')).toBeVisible();
  await expect(page.getByTestId('design-upload')).toContainText('일러스트');
  await expect(page.getByTestId('view-uv')).toContainText('디자인 파일 0');
  await page.getByTestId('view-uv').click(); // 디자인 파일 화면 — 여전히 디자인 탭
  await expect(page.getByTestId('view-design')).toHaveClass(/on/);
  await expect(page.getByTestId('view-uv')).toContainText('사진보드');
  await page.getByTestId('view-uv').click();
  await expect(page.getByTestId('photo-zone')).toBeVisible();
  await page.getByTestId('view-list').click();
  await expect(page.getByTestId('design-bar')).toHaveCount(0);
});

test('사인물을 하나 고른 채 화면을 끌어도(팬) 선택이 유지되고, 빈 곳을 탭하면 풀린다 (2026-10-22 "개별선택시 화면 팬이나 줌시 선택유지 되게")', async ({ page, request }) => {
  await openOwnedProject(page, request);
  await uploadPhoto(page);
  const id = await page.evaluate(() => { const a = (window as unknown as { __ganpanda: { photos: { id: string }[]; project: { addObject(o: unknown): string } } }).__ganpanda; return a.project.addObject({ photoId: a.photos[0].id, name: '간판', shape: 'rect', quad: [[100, 100], [300, 100], [300, 200], [100, 200]], sheetIds: [] }); });
  await page.locator(`[data-testid="sign-shape"][data-id="${id}"]`).click();
  const sel = () => page.evaluate(() => (window as unknown as { __ganpanda: { selectedId: string | null } }).__ganpanda.selectedId);
  expect(await sel()).toBe(id);
  // 사진의 빈 곳에서 끌기 = 팬
  const z = (await page.getByTestId('photo-zone').boundingBox())!;
  const x = z.x + z.width * 0.8, y = z.y + z.height * 0.8;
  await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x - 80, y - 40, { steps: 6 }); await page.mouse.up();
  expect(await sel()).toBe(id);
  // 보드 바깥 빈 곳에서 끌기도
  await page.mouse.move(20, 300); await page.mouse.down(); await page.mouse.move(120, 340, { steps: 6 }); await page.mouse.up();
  expect(await sel()).toBe(id);
  // 탭은 풀린다
  const z2 = (await page.getByTestId('photo-zone').boundingBox())!;
  await page.mouse.click(z2.x + z2.width * 0.8, z2.y + z2.height * 0.8);
  expect(await sel()).toBeNull();
});
