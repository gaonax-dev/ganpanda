import { expect, test } from '@playwright/test';
import { openOwnedProject, uploadPhoto } from './helpers';

type G = { __ganpanda: { photos: { id: string }[]; objects: { id: string; parts?: { id: string; kind: string; on?: string; stack?: { material: string; thickness: number }[] }[] }[]; selectObject(id: string): void; project: { addObject(o: unknown): string } } };

/** 갈바 프레임 위에 채널(왼쪽)·아크릴 스카시(오른쪽), 채널 앞면에 시트 */
async function setup(page: import('@playwright/test').Page, request: import('@playwright/test').APIRequestContext) {
  await openOwnedProject(page, request);
  await uploadPhoto(page);
  const id = await page.evaluate(() => {
    const a = (window as unknown as G).__ganpanda;
    const t = (id: string, x: number, h: number, text: string) => ({ id, kind: 'text', text, x, y: 0, h });
    const id = a.project.addObject({ photoId: a.photos[0].id, name: '정면 간판', shape: 'rect', quad: [[100, 100], [900, 100], [900, 300], [100, 300]], sheetIds: [], widthMm: 4000, heightMm: 900, depthMm: 60, productId: 'board-galva',
      parts: [
        { id: 'ch', kind: 'channel', type: 'ch-front', items: [t('t1', -1000, 500, '카페')] },
        { id: 'sc', kind: 'scashi', type: 'ch-scashi', items: [t('t2', 1200, 300, 'CAFE')] },
        { id: 'sh', kind: 'sheet', type: 'sh-cut', on: 'ch', items: [] },
      ] });
    a.selectObject(id);
    return id;
  });
  await page.getByTestId('object-settings-open').click();
  await page.getByTestId('object-settings').waitFor();
  return id;
}

// 2026-10-22 재료 조합 S1: "단면 쌓기는 2.5d가 좋을것 같아", "단면 하단에 폴딩으로 속성은", "단면쌓기는 인터페이스야", "갈바 위에 체널과 아크릴스카시가 있다면 두개가 같은 층에 있다", "해당 층을 클릭하면 정면도로 활용 가능하다"
test('설정 창 첫 화면은 단면 쌓기 — 갈바 위의 채널·스카시는 같은 2층, 채널 앞면 시트는 3층, 그림을 누르면 아래 접이가 펼쳐진다', async ({ page, request }) => {
  await setup(page, request);
  await expect(page.getByTestId('object-settings').getByTestId('quick-stack')).toHaveClass(/on/);
  await expect(page.getByTestId('cs-figure')).toBeVisible();
  // 층 줄: 앞이 위 — 3층, 2층, 1층(프레임)
  await expect(page.getByTestId('cs-tier')).toHaveCount(3);
  expect(await page.getByTestId('cs-tier').evaluateAll((els) => els.map((e) => e.getAttribute('data-n')))).toEqual(['3', '2', '1']);
  await expect(page.locator('[data-testid="cs-tier"][data-n="2"]')).toContainText('채널, 스카시');
  await expect(page.locator('[data-testid="cs-tier"][data-n="1"]')).toContainText('갈바');
  // 그림에서 스카시를 누르면 2층·스카시가 펼쳐지고 재료 층이 보인다
  await page.locator('[data-testid="cs-block"][data-part="sc"]').first().click();
  await expect(page.locator('[data-testid="cs-part"][data-part="sc"]')).toHaveClass(/open/);
  await expect(page.locator('[data-testid="cs-part"][data-part="sc"] [data-testid="cs-part-sum"]')).toContainText('아크릴 8T');
  await expect(page.locator('[data-testid="cs-part"][data-part="ch"] [data-testid="cs-part-sum"]')).toContainText('채널');
  // 펼침(분해도) 단추
  await page.getByTestId('cs-explode').click();
  await expect(page.getByTestId('cs-explode')).toHaveText('붙임');
  // 층의 [정면도] → 배치 탭
  await page.getByTestId('cs-front').click();
  await expect(page.getByTestId('object-settings').getByTestId('quick-layout')).toHaveClass(/on/);
});

test('단면에서 쌓기: 프레임 면 위에 스카시 더하기, 채널 위에 시트 더하기 — 층이 늘고 문서에 저장된다', async ({ page, request }) => {
  const id = await setup(page, request);
  await page.locator('[data-testid="cs-tier"][data-n="1"] [data-testid="cs-tier-row"]').click();
  await page.getByTestId('cs-add-scashi').click();
  await expect(page.locator('[data-testid="cs-tier"][data-n="2"] [data-testid="cs-part"]')).toHaveCount(3);
  await page.locator('[data-testid="cs-tier"][data-n="2"] [data-testid="cs-part"][data-part="sc"] [data-testid="cs-part-row"]').click();
  await expect(page.locator('[data-testid="cs-part"][data-part="sc"]')).toHaveClass(/open/);
  await page.locator('[data-testid="cs-part"][data-part="ch"] [data-testid="cs-part-row"]').click();
  await page.getByTestId('cs-add-on').click();
  await expect(page.locator('[data-testid="cs-tier"][data-n="3"] [data-testid="cs-part"]')).toHaveCount(2);
  const parts = await page.evaluate((oid) => (window as unknown as G).__ganpanda.objects.find((o) => o.id === oid)!.parts!, id);
  expect(parts.filter((p) => p.kind === 'scashi')).toHaveLength(2);
  expect(parts.filter((p) => p.kind === 'sheet' && p.on === 'ch')).toHaveLength(2);
});
