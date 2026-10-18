import { expect, test } from '@playwright/test';
import { openOwnedProject, uploadPhoto } from './helpers';

// 2026-10-18 사용자: "메모로 전환하는 글만 모아서 ai로 전환하는 방식으로" — 못 알아본 글이 있으면 보내기 체크가 보이고, 적용하면 서버로 간다
test('퀵입력에서 못 알아본 글은 체크해 두면 표본으로 보내진다', async ({ page, request }) => {
  await openOwnedProject(page, request);
  await uploadPhoto(page);
  await page.evaluate(() => {
    const app = (window as unknown as { __ganpanda: { photos: { id: string }[]; project: { addObject(o: unknown): string }; selectObject(id: string): void } }).__ganpanda;
    app.selectObject(app.project.addObject({ photoId: app.photos[0].id, name: '정면', shape: 'rect', quad: [[200, 100], [800, 100], [800, 300], [200, 300]], sheetIds: [], productId: 'board-galva' }));
  });
  const sent: unknown[] = [];
  await page.route('**/api/spec-samples', async (route) => { sent.push(route.request().postDataJSON()); await route.fulfill({ status: 201, contentType: 'application/json', body: '{"id":"x"}' }); });
  const spec = page.getByTestId('spec-input').first();
  await spec.getByTestId('spec-text').fill('갈바 흰색 로고는 왼쪽 아래');
  await spec.getByTestId('spec-parse').click();
  await expect(spec.getByTestId('spec-share')).toBeVisible();
  await spec.getByTestId('spec-apply').click();
  await expect.poll(() => sent.length).toBe(1);
  expect(sent[0]).toMatchObject({ text: '갈바 흰색 로고는 왼쪽 아래', productId: 'board-galva' });
  expect((sent[0] as { leftover: string }).leftover).toContain('로고는');
  // 전부 알아본 글이면 보내기 체크가 없다
  await spec.getByTestId('spec-text').fill('후렉스 비조명');
  await spec.getByTestId('spec-parse').click();
  await expect(spec.getByTestId('spec-share')).toHaveCount(0);
  await spec.getByTestId('spec-cancel').click();
});
