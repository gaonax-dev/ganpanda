// 기기별 프로젝트 화면 기억 (2026-10-25 사용자: "기기별로 사용자 설정을 기록해서 다시 돌아올때 해당 셋팅으로 돌아오게 해줘
// 헤더 텝의 상태를 돌아왔을때 복원하고 뷰도 떠날때 위치로") — 작업 탭과 보드의 확대·위치를 이 기기에 남겨 두고, 다시 열면 그대로
import { expect, test } from '@playwright/test';
import { openOwnedProject, uploadPhoto } from './helpers';

test('작업 탭을 바꾸고 떠났다 돌아오면 그 탭 — 주소의 view 가 있으면 주소가 우선', async ({ page, request }) => {
  const { projectId } = await openOwnedProject(page, request);
  await uploadPhoto(page);
  await expect(page.getByTestId('view-board')).toHaveClass(/on/);
  await page.getByTestId('stage-2d').click();
  await expect(page.getByTestId('stage-2d')).toHaveClass(/on/);
  await page.reload();
  await expect(page.getByTestId('stage-2d')).toHaveClass(/on/);
  await page.getByTestId('view-list').click();
  await page.goto('/');
  await page.goto(`/?room=${projectId}`);
  await expect(page.getByTestId('view-list')).toHaveClass(/on/);
  await page.goto(`/?room=${projectId}&view=board`);
  await expect(page.getByTestId('view-board')).toHaveClass(/on/);
});

test('보드의 확대·위치를 기억 — 리스트에 갔다 와도, 다시 열어도 같은 자리', async ({ page, request }) => {
  await openOwnedProject(page, request);
  await uploadPhoto(page);
  const fit = await page.getByTestId('zoom-label').textContent();
  await page.mouse.move(700, 450);
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, -300);
  await page.keyboard.up('Control');
  await expect(page.getByTestId('zoom-label')).not.toHaveText(fit!);
  const zoomed = (await page.getByTestId('zoom-label').textContent())!;
  const box = (await page.getByTestId('photo-img').boundingBox())!;
  // 리스트 탭 → 실측 탭: 전체 보기로 돌아가지 않고 그 자리
  await page.getByTestId('view-list').click();
  await page.getByTestId('view-board').click();
  await expect(page.getByTestId('zoom-label')).toHaveText(zoomed);
  expect(Math.abs((await page.getByTestId('photo-img').boundingBox())!.x - box.x)).toBeLessThan(2);
  // 다시 열어도
  await page.reload();
  await expect(page.getByTestId('zoom-label')).toHaveText(zoomed);
  expect(Math.abs((await page.getByTestId('photo-img').boundingBox())!.x - box.x)).toBeLessThan(2);
});
