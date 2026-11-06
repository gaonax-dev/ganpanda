// 작업 탭 (2026-10-22 사용자: "상단탭 실측,2d,3d,디자인,사인물리스트 / 디자인은 디자이너와 소통하는 곳으로 사진보드 그대로인데 사인물 디자인파일 연결하는 곳이다.
// 여기에 디자이너가 일러스트 파일도 올린다. 기존의 컨펌은 제거한다")
import { expect, test } from '@playwright/test';
import { openOwnedProject, uploadPhoto } from './helpers';

test('탭은 실측 · 2D · 3D · 디자인 · 사인물리스트 — 처음은 실측, 디자인은 사진보드 그대로 + 디자인 싱크·컬러셋, 컨펌 없음', async ({ page, request }) => {
  await openOwnedProject(page, request);
  await uploadPhoto(page);
  await expect(page.getByTestId('work-tabs').locator('button')).toHaveText(['실측', '2D', '3D', '디자인', '견적']); // 2026-10-26 "헤더의 리스트를 견적으로 변경"
  await expect(page.getByTestId('view-confirm')).toHaveCount(0);
  await expect(page.getByTestId('view-board')).toHaveClass(/on/);
  await page.getByTestId('stage-2d').click();
  await expect(page.getByTestId('stage-2d')).toHaveClass(/on/);
  await page.getByTestId('view-design').click();
  await expect(page.getByTestId('view-design')).toHaveClass(/on/);
  await expect(page.getByTestId('photo-zone')).toBeVisible(); // 사진보드 그대로
  await expect(page.getByTestId('design-bar')).toBeVisible();
  // 디자인 탭 막대 = [디자인 싱크] · [컬러셋] 만 (2026-11-06 "최종적으로 디자인 탭은 디자인싱크 컬러셋 만 남게")
  await expect(page.getByTestId('design-bar').locator('button')).toHaveText(['⇄ 디자인 싱크', '컬러셋']);
  // 작업 탭은 [제안 보내기] 바로 뒤, 디자인 막대는 그 뒤 (2026-11-06 "데스크탑에서 실측 2d 3d 디자인 견적은 제안보내기 버튼 다음에 위치하게")
  const px = async (id: string) => (await page.getByTestId(id).boundingBox())!.x;
  expect(await px('proposal-button')).toBeLessThan(await px('work-tabs'));
  expect(await px('work-tabs')).toBeLessThan(await px('design-bar'));
  await page.getByTestId('design-sync-open').click();
  await expect(page.getByTestId('design-sync-dialog')).toBeVisible();
  for (const p of ['illustrator', 'corel', 'svg']) await expect(page.getByTestId(`sync-program-${p}`)).toBeVisible();
  await expect(page.getByTestId('sync-design-files')).toContainText('디자인 파일 0');
  await page.getByTestId('sync-design-files').click(); // 디자인 파일 화면 — 여전히 디자인 탭
  await expect(page.getByTestId('design-sync-dialog')).toHaveCount(0);
  await expect(page.getByTestId('view-design')).toHaveClass(/on/);
  await page.getByTestId('view-uv-back').click();
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
