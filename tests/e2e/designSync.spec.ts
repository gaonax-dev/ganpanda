// 디자인 싱크 버튼 상태 (2026-11-06 사용자: "스크립트 다운로드가 시각화 되지 않아 계속누르게 된다. 나머지 버튼도 시각화와 완료상태 보여줘")
/* eslint-disable @typescript-eslint/no-explicit-any */
import { expect, test } from '@playwright/test';
import { openDesignSync, openOwnedProject, uploadPhoto } from './helpers';

test('보내기 버튼: 누르면 만드는 중 → 끝나면 ✓ 완료(창을 닫을 때까지), 다시 열면 처음 상태', async ({ page, request }) => {
  await openOwnedProject(page, request);
  await uploadPhoto(page);
  await page.evaluate(() => { const g = (window as any).__ganpanda; g.project.addObject({ photoId: g.photos[0].id, name: '정면', shape: 'rect', quad: [[200, 100], [800, 100], [800, 300], [200, 300]], sheetIds: [], widthMm: 3000, heightMm: 600 }); });
  await openDesignSync(page, 'illustrator');
  // 설치용 스크립트 — 바로 완료 표시
  const script = page.getByTestId('illustrator-script');
  await expect(script).toHaveAttribute('data-state', 'idle');
  const dl = page.waitForEvent('download');
  await script.click();
  await dl;
  await expect(script).toHaveAttribute('data-state', 'done');
  await expect(script).toContainText('✓');
  // 저장된 파일 이름과 위치·찾는 법 (2026-11-06 "다운로드 위치를 사용자가 브라우저에서 확인해야 된다")
  const saved = page.getByTestId('sync-saved');
  await expect(saved).toContainText('간판다.jsx');
  await expect(saved).toContainText('다운로드 폴더');
  // 대지 zip — 만드는 중(다른 보내기 버튼은 잠김) → 완료
  const zip = page.getByTestId('illustrator-download');
  const dl2 = page.waitForEvent('download');
  await zip.click();
  await expect(zip).toHaveAttribute('data-state', /busy|done/);
  await dl2;
  await expect(zip).toHaveAttribute('data-state', 'done');
  await expect(zip).toContainText('✓');
  await expect(saved).toContainText('테스트 매장 일러스트 대지.zip'); // 마지막으로 받은 파일
  await expect(saved).toContainText('간판다.jsx'); // 앞서 받은 것도 목록에
  // SVG 탭: 전개도·칼선도 같은 표시 (칼선은 낼 것이 없으면 실패 표시)
  await page.getByTestId('sync-program-svg').click();
  const svg = page.getByTestId('svg-download');
  const dl3 = page.waitForEvent('download');
  await svg.click();
  await dl3;
  await expect(svg).toHaveAttribute('data-state', 'done');
  await page.getByTestId('cut-download').click();
  await expect(page.getByTestId('cut-download')).toHaveAttribute('data-state', 'error');
  // 닫았다 열면 처음 상태
  await page.getByTestId('design-sync-close').click();
  await page.getByTestId('design-bar').getByTestId('design-sync-open').click();
  await expect(page.getByTestId('illustrator-script')).toHaveAttribute('data-state', 'idle');
});

test('받기: 파일을 고르면 창에 받는 중 표시, 끝나면 창이 닫히고 검토 패널', async ({ page, request }) => {
  await openOwnedProject(page, request);
  await uploadPhoto(page);
  const id = await page.evaluate(() => { const g = (window as any).__ganpanda; return g.project.addObject({ photoId: g.photos[0].id, name: '정면', shape: 'rect', quad: [[200, 100], [800, 100], [800, 300], [200, 300]], sheetIds: [], widthMm: 3000, heightMm: 600 }); });
  await openDesignSync(page, 'illustrator');
  const png = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 30; c.height = 6; c.getContext('2d')!.fillRect(0, 0, 30, 6); return c.toDataURL('image/png').split(',')[1]; });
  await page.getByTestId('sync-receive-input').setInputFiles({ name: 'a.ganpanda', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ format: 'ganpanda-illustrator-bundle', version: 2, items: [{ sign: id, part: 'design', kind: 'png', data: png }] })) });
  await expect(page.getByTestId('sync-review')).toBeVisible();
  await expect(page.getByTestId('design-sync-dialog')).toHaveCount(0);
});

test('빈(투명) 디자인을 받으면 검토에 경고하고 넣지 않는다 (2026-11-07 핀볼: 받은 디자인 PNG 가 모두 투명)', async ({ page, request }) => {
  await openOwnedProject(page, request);
  await uploadPhoto(page);
  const id = await page.evaluate(() => { const g = (window as any).__ganpanda; return g.project.addObject({ photoId: g.photos[0].id, name: '정면', shape: 'rect', quad: [[200, 100], [800, 100], [800, 300], [200, 300]], sheetIds: [], widthMm: 3000, heightMm: 600 }); });
  const blank = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 40; c.height = 8; return c.toDataURL('image/png').split(',')[1]; }); // 아무것도 안 그린 = 투명
  await openDesignSync(page, 'illustrator');
  await page.getByTestId('sync-receive-input').setInputFiles({ name: 'a.ganpanda', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ format: 'ganpanda-illustrator-bundle', version: 2, items: [{ sign: id, part: 'design', kind: 'png', data: blank }] })) });
  await expect(page.getByTestId('sync-review')).toBeVisible();
  await expect(page.locator(`[data-testid="sync-blank"][data-sign="${id}"]`)).toContainText('빈(투명)');
  await expect(page.locator(`[data-testid="sync-row"][data-sign="${id}"] [data-testid="sync-action"]`)).toHaveValue('skip');
  await page.getByTestId('sync-confirm').click();
  await expect(page.getByTestId('sync-review')).toHaveCount(0);
  expect(await page.evaluate((id) => (window as any).__ganpanda.project.object(id).design ?? null, id)).toBeNull();
});
