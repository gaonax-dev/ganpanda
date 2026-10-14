import { expect, test } from '@playwright/test';
import { dragOnPhoto, makePhoto, openObjectSettings, openOwnedProject, pickCategory, uploadPhoto } from './helpers';

test('두 사진의 같은 사인물: 연결하면 같은 규격·같은 속성창, 견적·리스트에는 하나만, 해제하면 독립', async ({ page, request }) => {
  await openOwnedProject(page, request);
  await uploadPhoto(page); // 정면
  await page.keyboard.press('r');
  await dragOnPhoto(page, [400, 200], [800, 300]);
  await pickCategory(page, 'sign');
  await openObjectSettings(page);
  await page.getByTestId('width-mm').fill('4000');
  await page.getByTestId('height-mm').fill('1000');
  await page.getByTestId('product-select').selectOption('ch-front');
  await page.getByTestId('sign-text').fill('간판다');
  await page.getByTestId('close-object-settings').click();
  const masterId = await page.evaluate(() => (window as unknown as { __ganpanda: { selectedId: string } }).__ganpanda.selectedId);

  // 측면 사진 추가 → 영역 그리기 → 기존 사인물과 연결
  const buffer = await makePhoto(page);
  await page.getByTestId('photo-input').setInputFiles({ name: '측면.png', mimeType: 'image/png', buffer });
  await expect(page.getByTestId('photo-zone')).toHaveCount(2);
  const copyId = await page.evaluate(() => {
    const app = (window as unknown as { __ganpanda: { project: { allPhotos(): { id: string }[]; addObject(o: unknown): string }; selectObject(id: string): void } }).__ganpanda;
    const side = app.project.allPhotos()[1].id;
    const id = app.project.addObject({ photoId: side, name: '사인물 2', shape: 'rect', quad: [[300, 300], [700, 320], [690, 420], [310, 400]], sheetIds: [] });
    app.selectObject(id);
    return id;
  });
  expect(copyId).not.toBe(masterId);
  await page.getByTestId('link-select').selectOption(masterId);

  // 같은 속성창: 이름·규격이 원본 것
  await expect(page.getByTestId('link-info')).toContainText('2곳');
  await expect(page.getByTestId('object-summary')).toContainText('채널 간판 (전광)');
  await expect(page.getByTestId('object-summary')).toContainText('4,000×1,000');
  await openObjectSettings(page);
  await expect(page.getByTestId('width-mm')).toHaveValue('4000');
  await expect(page.getByTestId('sign-text')).toHaveValue('간판다');
  await page.getByTestId('sign-text').fill('간판다 카페'); // 원본이 바뀐다
  await page.getByTestId('close-object-settings').click();
  await expect(page.getByTestId('sign-linked')).toHaveCount(1);
  await expect(page.getByTestId('sign-shape')).toHaveCount(2);
  // 같은 사인물은 다른 사진에서도 하이라이트 (핸들 없이)
  await expect(page.locator('[data-testid="sign-shape"][data-selected="true"]')).toHaveCount(1);
  await expect(page.locator('[data-testid="sign-shape"][data-same="true"]')).toHaveCount(1);
  await expect(page.getByTestId('sign-handle')).toHaveCount(4); // 선택한 영역의 핸들만

  // 리스트·견적에는 하나만
  await page.getByTestId('view-list').click();
  await expect(page.getByTestId('list-card')).toHaveCount(1);
  await expect(page.getByTestId('list-card')).toContainText('채널 간판 (전광)');
  await page.getByTestId('view-board').click();

  // 원본 쪽 대화와 같은 대화를 본다
  await page.evaluate((id) => (window as unknown as { __ganpanda: { selectObject(id: string): void } }).__ganpanda.selectObject(id), masterId);
  await page.getByTestId('chat-input').fill('연결 테스트');
  await page.getByTestId('chat-send').click();
  await page.evaluate((id) => (window as unknown as { __ganpanda: { selectObject(id: string): void } }).__ganpanda.selectObject(id), copyId);
  await expect(page.getByTestId('object-panel')).toContainText('연결 테스트');

  // 해제 → 독립 사인물 2개, 규격은 복사됨
  await page.getByTestId('unlink').click();
  await expect(page.getByTestId('link-info')).toHaveCount(0);
  await expect(page.getByTestId('object-summary')).toContainText('4,000×1,000');
  await page.getByTestId('view-list').click();
  await expect(page.getByTestId('list-card')).toHaveCount(2);
});
