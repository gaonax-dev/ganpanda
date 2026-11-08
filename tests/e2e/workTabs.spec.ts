// 작업 탭 (2026-10-22 사용자: "상단탭 실측,2d,3d,디자인,사인물리스트 / 디자인은 디자이너와 소통하는 곳으로 사진보드 그대로인데 사인물 디자인파일 연결하는 곳이다.
// 여기에 디자이너가 일러스트 파일도 올린다. 기존의 컨펌은 제거한다")
import { expect, test } from '@playwright/test';
import { openOwnedProject, uploadPhoto } from './helpers';

// 2026-11-08 "2d,3d를 하나로 통합한다. 그리고 제안이다. 실측, 제안, 견적, 디자인 + 완료된 결과물 올리는 사진보드"
test('탭은 실측 · 제안 · 견적 · 디자인 · 완료 — 처음은 실측, 디자인은 사진보드 그대로 + 디자인 싱크·컬러셋, 컨펌 없음', async ({ page, request }) => {
  await openOwnedProject(page, request);
  await uploadPhoto(page);
  // 순서 실측 · 제안 · 디자인 · 완료 | 견적 (2026-11-08 "실측 제안 디자인 완료 | 견적") — 견적 앞에 구분선
  await expect(page.getByTestId('work-tabs').locator('button')).toHaveText(['실측', '제안', '디자인', '완료', '견적']);
  const tx = async (id: string) => (await page.getByTestId(id).boundingBox())!.x;
  const sep = (await page.getByTestId('work-tabs-sep').boundingBox())!;
  expect(sep.x).toBeGreaterThan(await tx('view-done'));
  expect(sep.x).toBeLessThan(await tx('view-list'));
  await expect(page.getByTestId('view-confirm')).toHaveCount(0);
  await expect(page.getByTestId('stage-2d')).toHaveCount(0);
  await expect(page.getByTestId('stage-3d')).toHaveCount(0);
  await expect(page.getByTestId('view-board')).toHaveClass(/on/);
  await page.getByTestId('view-propose').click();
  await expect(page.getByTestId('view-propose')).toHaveClass(/on/);
  await page.getByTestId('view-design').click();
  await expect(page.getByTestId('view-design')).toHaveClass(/on/);
  await expect(page.getByTestId('photo-zone')).toBeVisible(); // 사진보드 그대로
  await expect(page.getByTestId('design-bar')).toBeVisible();
  // 디자인 탭 막대 = [디자인 파일] · [디자인 싱크] · [컬러셋] (2026-11-07 "디자인 싱크버튼을 따로 때내고 그자리에 디자인파일로 변경해줘")
  await expect(page.getByTestId('design-bar').locator('button')).toHaveText(['디자인 파일 0', '⇄ 디자인 싱크', '컬러셋']);
  // 작업 탭은 [제안 보내기] 바로 뒤, 디자인 막대는 그 뒤 (2026-11-06 "데스크탑에서 실측 2d 3d 디자인 견적은 제안보내기 버튼 다음에 위치하게")
  const px = async (id: string) => (await page.getByTestId(id).boundingBox())!.x;
  expect(await px('proposal-button')).toBeLessThan(await px('work-tabs'));
  expect(await px('work-tabs')).toBeLessThan(await px('design-bar'));
  await page.getByTestId('design-sync-open').click();
  await expect(page.getByTestId('design-sync-dialog')).toBeVisible();
  for (const p of ['illustrator', 'corel', 'svg']) await expect(page.getByTestId(`sync-program-${p}`)).toBeVisible();
  await expect(page.getByTestId('sync-design-files')).toHaveCount(0); // 디자인 파일은 막대로 (2026-11-07)
  await page.getByTestId('design-sync-close').click();
  await page.getByTestId('view-uv').click(); // 디자인 파일 화면(대지 카드 목록) — 여전히 디자인 탭
  await expect(page.getByTestId('design-files')).toBeVisible();
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

test('제안 = 3D 기본, 3D 를 못 만드는 사진(납작한 시트뿐)은 2D 로 (2026-11-08 (질문) "3D 기본, 안 되면 2D")', async ({ page, request }) => {
  await openOwnedProject(page, request);
  await uploadPhoto(page);
  await page.evaluate(() => { const a = (window as unknown as { __ganpanda: { photos: { id: string }[]; project: { addObject(o: unknown): string } } }).__ganpanda; a.project.addObject({ photoId: a.photos[0].id, name: '큰시트', shape: 'rect', quad: [[100, 100], [400, 100], [400, 500], [100, 500]], sheetIds: [], widthMm: 2100, heightMm: 2100, parts: [{ id: 'a', kind: 'sheet', type: 'sh-print', on: 'frame', items: [] }] }); });
  await page.getByTestId('view-propose').click();
  expect(await page.evaluate(() => (window as unknown as { __ganpanda: { stage: string } }).__ganpanda.stage)).toBe('3d'); // 3D 기본
  // 이 사진은 3D 로 만들 것이 없다 → 평면(2D) 겹침 (구운 그림의 data-colors 에 시트 색)
  await expect.poll(() => page.locator('[data-testid="photo-zone"] [data-colors]').evaluateAll((es) => es.flatMap((e) => (e.getAttribute('data-colors') ?? '').split(' ')))).toContain('#d9d9d9');
  await expect(page.getByTestId('tool-rect')).toBeDisabled(); // 그리기 도구는 실측 탭에서
});

test('완료 = 결과 사진만 올리는 따로 된 사진보드 — 작업 사진은 안 보이고, 결과 사진은 다른 탭에 안 나온다 (2026-11-08 (질문) "결과 사진만")', async ({ page, request }) => {
  await openOwnedProject(page, request);
  await uploadPhoto(page);
  await expect(page.getByTestId('photo-zone')).toHaveCount(1);
  await page.getByTestId('view-done').click();
  await expect(page.getByTestId('view-done')).toHaveClass(/on/);
  await expect(page.getByTestId('photo-zone')).toHaveCount(0);
  await expect(page.getByTestId('photo-empty')).toContainText('결과 사진');
  await uploadPhoto(page);
  await expect(page.getByTestId('photo-zone')).toHaveCount(1);
  const raw = await page.evaluate(() => (window as unknown as { __ganpanda: { project: { allPhotos(): { result?: boolean }[] } } }).__ganpanda.project.allPhotos().map((p) => !!p.result));
  expect(raw.sort()).toEqual([false, true]);
  await expect(page.getByTestId('tool-rect')).toBeDisabled(); // 결과 사진에는 영역을 그리지 않는다
  await page.getByTestId('view-board').click();
  await expect(page.getByTestId('photo-zone')).toHaveCount(1);
  await page.getByTestId('view-propose').click();
  await expect(page.getByTestId('photo-zone')).toHaveCount(1);
});
