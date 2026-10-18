import { expect, test } from '@playwright/test';
import { openOwnedProject, uploadPhoto } from './helpers';

// 2026-10-19 사양 글 → 배치: 따옴표 글자·로고·위치어·"채널 위에 시트" 가 확인 창 항목이 되고, 적용하면 정면도 자리에 놓인다
test('퀵입력 "카페" 450 왼쪽 … 채널 위에 UV시트 로고 300 오른쪽 → 글자는 왼쪽, 로고 시트는 채널 앞면에', async ({ page, request }) => {
  await openOwnedProject(page, request);
  await uploadPhoto(page);
  await page.evaluate(() => {
    const app = (window as unknown as { __ganpanda: { photos: { id: string }[]; project: { addObject(o: unknown): string }; selectObject(id: string): void } }).__ganpanda;
    app.selectObject(app.project.addObject({ photoId: app.photos[0].id, name: '정면', shape: 'rect', quad: [[200, 100], [800, 100], [800, 300], [200, 300]], sheetIds: [], productId: 'board-galva' }));
  });
  const spec = page.getByTestId('spec-input').first();
  await spec.getByTestId('spec-text').fill('3000x600 전광채널 "카페" 450 왼쪽 채널 위에 UV시트 로고 300 오른쪽');
  await spec.getByTestId('spec-parse').click();
  const places = spec.getByTestId('spec-item').filter({ has: page.locator('[data-kind="place"]') }).or(spec.locator('[data-testid="spec-item"][data-kind="place"]'));
  await expect(spec.locator('[data-testid="spec-item"][data-kind="place"]')).toHaveCount(2);
  await expect(spec.locator('[data-testid="spec-item"][data-kind="place"]').first()).toContainText('글자 "카페" 450mm 왼쪽 (채널)');
  await expect(spec.locator('[data-testid="spec-item"][data-kind="place"]').nth(1)).toContainText('그림 자리 300mm 오른쪽 (UV 출력 시트, 채널 위)');
  await expect(spec.getByTestId('spec-ask')).toHaveCount(0); // 다 알아봤다
  await spec.getByTestId('spec-apply').click();
  const o = await page.evaluate(() => JSON.parse(JSON.stringify((window as unknown as { __ganpanda: { selected: unknown } }).__ganpanda.selected)));
  const ch = o.parts.find((p: { kind: string }) => p.kind === 'channel'), sh = o.parts.find((p: { kind: string }) => p.kind === 'sheet');
  expect(ch.items[0]).toMatchObject({ text: '카페', h: 450 });
  expect(ch.items[0].x).toBeLessThan(-500);
  expect(sh.on).toBe(ch.id);
  expect(sh.items[0].x).toBeGreaterThan(500);
  expect(o.widthMm).toBe(3000);
  void places;
});
