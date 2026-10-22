// 작업 탭 (2026-10-22 사용자: "사진보드, 러프디자인(2d,3d),사인물리스트, 컨펌 으로" → "러프를 디자인으로 변경하고 거기에 포함")
import { expect, test } from '@playwright/test';
import { openOwnedProject, uploadPhoto } from './helpers';

test('탭은 사진보드 · 디자인 · 사인물리스트 · 컨펌 — 처음은 사진보드(실측), 디자인 안에 2D·3D·디자인 파일, 컨펌은 제안 화면', async ({ page, request }) => {
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
  await page.getByTestId('view-confirm').click();
  await expect(page.getByTestId('proposal-page')).toBeVisible();
  await expect(page.getByTestId('view-confirm')).toHaveClass(/on/);
  await page.getByTestId('view-board').click();
  await expect(page.getByTestId('proposal-page')).toHaveCount(0);
  await expect(page.getByTestId('photo-zone')).toBeVisible();
});
