import { expect, test } from '@playwright/test';
import { openOwnedProject, uploadPhoto } from './helpers';

// 2026-10-19 V5 용어 통일: 품목에 연결된 공급사의 용어를 확인 창에 힌트로, 설정에서 용어집 CSV 내보내기
test('연결 공급사 용어 힌트와 용어집 내보내기', async ({ page, request }) => {
  await openOwnedProject(page, request);
  await uploadPhoto(page);
  await page.evaluate(async () => {
    const app = (window as unknown as { __ganpanda: { photos: { id: string }[]; project: { addObject(o: unknown): string }; selectObject(id: string): void; setPrices(p: unknown): void; prices: { links?: Record<string, string> } } }).__ganpanda;
    const path = '/src/lib/core/supplierPrices.ts';
    const { ALIDA, linkOf } = await import(/* @vite-ignore */ path);
    const halo = ALIDA.items.find((i: { name: string }) => i.name.includes('후광'));
    app.setPrices({ ...app.prices, links: { ...(app.prices.links ?? {}), 'ch-halo': linkOf(ALIDA, halo) } }); // 내 단가표에서 후광 채널을 알리다 품목에 연결
    app.selectObject(app.project.addObject({ photoId: app.photos[0].id, name: '정면', shape: 'rect', quad: [[200, 100], [800, 100], [800, 300], [200, 300]], sheetIds: [], productId: 'board-galva', parts: [{ id: 'c', kind: 'channel', type: 'ch-halo', items: [] }] }));
  });
  const spec = page.getByTestId('spec-input').first();
  await spec.getByTestId('spec-text').fill('오싸이');
  await spec.getByTestId('spec-parse').click();
  await expect(spec.getByTestId('spec-term')).toContainText("알리다 용어 '오사이'");
  await spec.getByTestId('spec-cancel').click();
  await page.getByTestId('open-settings').click();
  await page.getByTestId('settings-tab-rules').click();
  const download = page.waitForEvent('download');
  await page.getByTestId('glossary-export').click();
  const d = await download;
  expect(d.suggestedFilename()).toMatch(/^간판다 용어집 .*\.csv$/);
});
