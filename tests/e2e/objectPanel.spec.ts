import { expect, test } from '@playwright/test';
import { dragOnPhoto, openOwnedProject, uploadPhoto } from './helpers';

test('사인물 패널은 분류(간판/스카시/시트)와 요약만, 세부 설정은 따로 열리는 창', async ({ page, request }) => {
  await openOwnedProject(page, request);
  await uploadPhoto(page);
  await page.keyboard.press('t');
  await dragOnPhoto(page, [400, 200], [800, 300]);
  const panel = page.getByTestId('object-panel');
  await expect(panel).toBeVisible();
  // 분류는 셀렉터로 (버튼이 바로 바꾸면 여러 사람이 쓸 때 실수가 남) — 처음 선택은 바로
  const cat = panel.getByTestId('category-select');
  await expect(cat).toBeVisible();
  await expect(cat).toHaveValue('');
  await expect(page.getByTestId('width-mm')).toHaveCount(0); // 세부 항목은 패널에 없음
  await expect(page.getByTestId('chat-input')).toBeVisible(); // 대화는 패널에

  // 스카시 → 기본 제품이 스카시, 요약에 표시
  await cat.selectOption('scashi');
  await expect(panel.getByTestId('category-confirm')).toHaveCount(0);
  await expect(panel.getByTestId('object-summary')).toContainText('스카시');
  // 이미 분류가 있으면 변경은 확인 창을 거친다: 취소하면 그대로, 바꾸기면 적용
  await cat.selectOption('sheet');
  await expect(panel.getByTestId('category-confirm')).toBeVisible();
  await panel.getByTestId('category-confirm-cancel').click();
  await expect(panel.getByTestId('object-summary')).toContainText('스카시');
  await cat.selectOption('sheet');
  await panel.getByTestId('category-confirm-ok').click();
  await expect(panel.getByTestId('object-summary')).not.toContainText('스카시');
  await page.getByTestId('object-settings-open').click();
  const dlg = page.getByTestId('object-settings');
  await expect(dlg).toBeVisible();
  await dlg.getByTestId('part-type').selectOption('sh-print'); // 시트 분류 = 시트 구성 요소 (2026-10-16)
  await dlg.getByTestId('width-mm').fill('1000');
  await dlg.getByTestId('height-mm').fill('500');
  await expect(panel.getByTestId('object-summary')).toContainText('돔보 커팅');
  await expect(panel.getByTestId('object-summary')).toContainText('1,000×500');
  await page.keyboard.press('Escape');
  // 이름을 치고 바로 보드 빈 곳을 눌러 패널이 닫혀도 이름이 남는다 (입력 즉시 저장)
  await panel.getByTestId('object-name').fill('출입문 시트');
  await page.getByTestId('board-canvas').click({ position: { x: 20, y: 20 } });
  await expect(panel).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => (window as unknown as { __ganpanda: { objects: { name: string }[] } }).__ganpanda.objects[0].name)).toBe('출입문 시트');
  // 창은 보드 조작을 막지 않는다: 다른 사인물을 그리면 창이 그 사인물로 바뀐다
  await page.keyboard.press('Escape');
  await expect(dlg).toHaveCount(0);
  await page.keyboard.press('t');
  await dragOnPhoto(page, [900, 400], [1200, 500]);
  await page.getByTestId('object-settings-open').click();
  await expect(page.getByTestId('object-settings')).toContainText('사인물 2');
});
