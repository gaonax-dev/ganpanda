// 작업 탭 (2026-10-22 사용자: "사진보드, 러프디자인(2d,3d),사인물리스트, 컨펌 으로" → "러프를 디자인으로 변경하고 거기에 포함")
import { expect, test } from '@playwright/test';
import { openOwnedProject, uploadPhoto } from './helpers';

test('탭은 사진보드 · 디자인 · 사인물리스트 · 컨펌 — 처음은 사진보드(실측), 디자인 안에 2D·3D·디자인 파일, 컨펌은 표시 없는 사진보드 + 진행 동의', async ({ page, request }) => {
  await openOwnedProject(page, request);
  await uploadPhoto(page);
  await expect(page.getByTestId('work-tabs').locator('button')).toHaveText(['사진보드', '디자인', '사인물리스트', '컨펌']);
  await expect(page.getByTestId('view-board')).toHaveClass(/on/);
  await expect(page.getByTestId('stage-2d')).toHaveCount(0); // 디자인 탭 밖에는 없다
  await page.getByTestId('view-design').click();
  await expect(page.getByTestId('stage').locator('button')).toHaveText(['2D', '3D', '디자인 파일']);
  await expect(page.getByTestId('stage-2d')).toHaveClass(/on/);
  await page.getByTestId('view-uv').click();
  await expect(page.getByTestId('view-design')).toHaveClass(/on/); // 디자인 파일도 디자인 탭
  await page.getByTestId('view-list').click();
  await expect(page.getByTestId('view-list')).toHaveClass(/on/);
  // 컨펌 = 표시 없는 사진보드 + [진행 동의] → 제작 (2026-10-22 "사진보드와 같은데 이런저런 표시없이 … 여기에 진행동의를 누르면 제작을 한다")
  await page.evaluate(() => { const a = (window as unknown as { __ganpanda: { photos: { id: string }[]; project: { addObject(o: unknown): string } } }).__ganpanda; for (const n of ['간판', '돌출']) a.project.addObject({ photoId: a.photos[0].id, name: n, shape: 'rect', quad: [[100, 100], [400, 100], [400, 200], [100, 200]], sheetIds: [], widthMm: 3000, heightMm: 1000 }); });
  await page.getByTestId('view-confirm').click();
  await expect(page.getByTestId('view-confirm')).toHaveClass(/on/);
  await expect(page.getByTestId('photo-zone')).toHaveAttribute('data-clean', 'true');
  await expect(page.getByTestId('tool-rect')).toBeHidden(); // 도구 없음
  await expect(page.getByTestId('photo-zone').locator('.header')).toBeHidden(); // 사진 머리 없음
  await expect(page.getByTestId('confirm-state')).toContainText('진행 동의 전');
  // 멤버 확인 (2026-10-22 "컨펌에 맴버컴펌도 필요하다") — 팀 안 확인, 내용이 바뀌면 다시 확인
  await page.getByTestId('member-check').click();
  await expect(page.getByTestId('member-check-ok')).toHaveCount(1);
  await expect(page.getByTestId('member-check')).toHaveCount(0);
  await page.evaluate(() => { const a = (window as unknown as { __ganpanda: { objects: { id: string }[]; project: { updateObject(id: string, p: unknown): void } } }).__ganpanda; a.project.updateObject(a.objects[0].id, { widthMm: 3500 }); });
  await expect(page.getByTestId('member-check-stale')).toContainText('다시 확인');
  await page.getByTestId('member-check').click();
  await expect(page.getByTestId('member-check-ok')).toHaveCount(1);
  await page.getByTestId('confirm-sign').filter({ hasText: '돌출' }).click(); // 빼기
  page.once('dialog', (d) => d.accept());
  await page.getByTestId('confirm-consent').click();
  await expect(page.getByTestId('confirm-bar')).toHaveAttribute('data-status', 'approved');
  await expect(page.getByTestId('confirm-state')).toContainText('1개 제외');
  await expect(page.getByTestId('confirm-state')).toContainText('제작');
  await page.getByTestId('view-board').click();
  await expect(page.getByTestId('confirm-bar')).toHaveCount(0);
  await expect(page.getByTestId('photo-zone')).not.toHaveAttribute('data-clean', 'true');
  await expect(page.getByTestId('tool-rect')).toBeVisible();
  // 동의하면 프로젝트는 진행중(제작)
  await page.goto('/');
  await expect(page.locator('[data-testid="project-item"]').first()).toHaveAttribute('data-status', 'ongoing');
});
