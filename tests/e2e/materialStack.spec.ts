import { expect, test } from '@playwright/test';
import { clearAutoCamera, openOwnedProject, uploadPhoto } from './helpers';

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
  await page.locator('[data-testid="cs-block"][data-part="sc"]').last().click();
  await expect(page.locator('[data-testid="cs-part"][data-part="sc"]')).toHaveClass(/open/);
  await expect(page.locator('[data-testid="cs-part"][data-part="sc"] [data-testid="cs-part-sum"]')).toContainText('아크릴 8T');
  await expect(page.locator('[data-testid="cs-part"][data-part="ch"] [data-testid="cs-part-sum"]')).toContainText('아크릴 3T'); // 채널도 재료 층 (S2)
  // 펼침(분해도) 단추
  await page.getByTestId('cs-explode').click();
  await expect(page.getByTestId('cs-explode')).toHaveText('붙임');
  // 층의 [정면도] → 그 층 정면도 (아래 테스트)
  await expect(page.locator('[data-testid="cs-tier"][data-n="2"] [data-testid="cs-front"]')).toBeVisible();
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

// 2026-10-22 사용자: "스카시는 아직도 고무 스카시가 기본으로 나온다. 우선 스카시라는 허상에 재료나 구성을 추가해야한다. 고무를 사용하고 철판을 레이어로 올리고 그런데 컷팅이 스카시에 붙어서 하위 재료가 모두 적용된다."
// "레이어 쌓기가 … 위로 쌓기고 펼침도 위아래로 벌리는 방향", "스카시의 경우 바운드 박스와 커팅된 상태가 같이 나오게"
test('새 스카시는 빈 상태 — 고무를 올리고 그 위에 철판, 컷팅은 스카시에 붙어 모든 층에. 단면은 위로 쌓이고 펼치면 위아래로 벌어진다', async ({ page, request }) => {
  const id = await setup(page, request);
  await page.locator('[data-testid="cs-tier"][data-n="1"] [data-testid="cs-tier-row"]').click();
  await page.getByTestId('cs-add-scashi').click();
  const card = page.locator('[data-testid="cs-part"].open');
  await expect(card.getByTestId('part-type')).toHaveValue(''); // 직접 쌓기
  await expect(card.getByTestId('stack-layer')).toHaveCount(0);
  await card.getByTestId('stack-add-rubber').click();
  await card.getByTestId('stack-add-iron').click();
  await expect(card.getByTestId('stack-layer')).toHaveCount(2);
  await expect(card.getByTestId('stack-layer').first()).toHaveAttribute('data-material', 'iron'); // 위가 나중에 올린 것
  await card.getByTestId('part-option-cut').selectOption('laser');
  await expect(card.getByTestId('cs-part-sum')).toHaveText('고무 20T + 철판 1.5T');
  await expect(card.getByTestId('part-spec')).toContainText('레이저 컷팅 — 모든 층');
  const parts = await page.evaluate((oid) => (window as unknown as G).__ganpanda.objects.find((o) => o.id === oid)!.parts!, id);
  const sc = parts.filter((p) => p.kind === 'scashi').at(-1)!;
  expect(sc.stack!.map((l) => [l.material, l.thickness])).toEqual([['rubber', 20], ['iron', 1.5]]);
  // 그림: 고무가 아래, 철판이 위 — 펼치면 사이가 벌어진다 (화면 y 가 작을수록 위)
  const blocks = page.locator(`[data-testid="cs-block"][data-part="${(sc as { id: string }).id}"]`);
  await expect(blocks).toHaveCount(2);
  const ys = async () => Promise.all([0, 1].map(async (i) => (await blocks.nth(i).boundingBox())!.y));
  const [r0, i0] = await ys();
  expect(i0).toBeLessThan(r0);
  await page.getByTestId('cs-explode').click();
  const [r1, i1] = await ys();
  expect(r1 - i1).toBeGreaterThan(r0 - i0 + 10);
});

// 2026-10-22 사용자: "가로 세로 두께를 적용해 사실적으로 표시해줘"
test('단면은 실제 비율(가로·세로·두께 같은 축척) — 구성 요소를 고르면 그 부분을 확대하고, [전체]로 돌아온다', async ({ page, request }) => {
  await setup(page, request);
  await expect(page.getByTestId('cs-ratio')).toContainText('실제 비율');
  const vb = async () => (await page.getByTestId('cs-figure').getAttribute('viewBox'))!.split(' ').map(Number);
  const full = await vb();
  // 같은 축척: 프레임 앞면 다각형의 두께(화면 세로) / 가로(화면 가로) = 60 / 4000
  const pts = (await page.locator('[data-testid="cs-block"][data-part="frame"] polygon').first().getAttribute('points'))!.split(' ').map((p) => p.split(',').map(Number));
  const wpx = Math.max(...pts.map((p) => p[0])) - Math.min(...pts.map((p) => p[0]));
  const hpx = Math.max(...pts.map((p) => p[1])) - Math.min(...pts.map((p) => p[1]));
  expect(hpx / wpx).toBeCloseTo(60 / 4000, 2);
  await page.locator('[data-testid="cs-block"][data-part="sc"]').last().click();
  const zoomed = await vb();
  expect(zoomed[2]).toBeLessThan(full[2] * 0.7);
  await page.getByTestId('cs-zoom-all').click();
  expect((await vb())[2]).toBeCloseTo(full[2], 0);
});

// 2026-10-22 사용자: "해당 층을 클릭하면 정면도로 활용 가능하다" → "층 정면도 진행해줘"
test('층 정면도: 그 층만 고치고(바탕 = 올라간 면), 아래 층은 흐리게, 위 층은 숨긴다 — 구성 요소를 누르면 그 구성 요소 정면도, [← 단면]으로 돌아온다', async ({ page, request }) => {
  const id = await setup(page, request);
  const dlg = page.getByTestId('object-settings');
  // 2층 (갈바 판 위: 채널 "카페", 스카시 "CAFE")
  await page.locator('[data-testid="cs-tier"][data-n="2"] [data-testid="cs-tier-row"]').click();
  await page.locator('[data-testid="cs-tier"][data-n="2"] [data-testid="cs-front"]').click();
  await expect(page.getByTestId('cs-tier-front')).toBeVisible();
  await expect(page.getByTestId('cs-front-title')).toContainText('2층');
  await expect(page.getByTestId('cs-figure')).toHaveCount(0);
  await expect(dlg.getByTestId('front-item')).toHaveCount(2);
  await expect(dlg.getByTestId('front-back-item')).toHaveCount(0); // 프레임에는 글자가 없다
  await expect(dlg.getByTestId('front-area')).toHaveCount(0); // 위 층(채널 앞면 시트)은 숨김
  // 방향키로 옮기면 저장된다
  await dlg.getByTestId('front-item').filter({ hasText: 'CAFE' }).click();
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => page.evaluate((oid) => (window as unknown as { __ganpanda: { objects: { id: string; parts?: { id: string; items: { x: number }[] }[] }[] } }).__ganpanda.objects.find((o) => o.id === oid)!.parts!.find((p) => p.id === 'sc')!.items[0].x, id)).toBe(1210);
  // 구성 요소 정면도: 스카시만 고치고 채널은 흐리게
  await page.getByTestId('cs-front-part').filter({ hasText: '스카시' }).click();
  await expect(page.getByTestId('cs-front-title')).toContainText('스카시');
  await expect(dlg.getByTestId('front-item')).toHaveCount(1);
  await expect(dlg.getByTestId('front-back-item')).toHaveCount(1);
  await page.getByTestId('cs-front-up').click(); // ← 2층
  await expect(page.getByTestId('cs-front-title')).toContainText('2층');
  // 3층 (채널 앞면 시트): 아래 층 글자는 흐리게, 시트는 영역으로, 바탕은 채널 자리
  await page.getByTestId('cs-front-back').click(); // ← 단면
  await expect(page.getByTestId('cs-figure')).toBeVisible();
  await page.locator('[data-testid="cs-tier"][data-n="3"] [data-testid="cs-tier-row"]').click();
  await page.locator('[data-testid="cs-tier"][data-n="3"] [data-testid="cs-front"]').click();
  await expect(page.getByTestId('cs-front-title')).toContainText('3층');
  await expect(dlg.getByTestId('front-back-item')).toHaveCount(2);
  await expect(dlg.getByTestId('front-area')).toHaveCount(1);
  await expect(dlg.getByTestId('front-base')).toHaveCount(1);
});

// 2026-10-22 사용자: "시트 커팅에 글자를 넣었다. 그런데 커팅글자가 나오지 않앗어"
test('단면 그림: 시트(커팅)에 넣은 글자도 컷팅 모양으로 보인다 — 바운드 박스 + 글자', async ({ page, request }) => {
  await openOwnedProject(page, request);
  await uploadPhoto(page);
  await page.evaluate(() => {
    const a = (window as unknown as G).__ganpanda;
    const id = a.project.addObject({ photoId: a.photos[0].id, name: '유리 시트', shape: 'rect', quad: [[100, 100], [900, 100], [900, 300], [100, 300]], sheetIds: [], widthMm: 2000, heightMm: 1000, depthMm: 5, productId: 'board-foamex',
      parts: [{ id: 'sh', kind: 'sheet', type: 'sh-cut', on: 'frame', items: [{ id: 't', kind: 'text', text: '오픈세일', x: 0, y: 0, h: 300 }] }] });
    a.selectObject(id);
  });
  await page.getByTestId('object-settings-open').click();
  await page.getByTestId('object-settings').waitFor();
  const sheet = page.locator('[data-testid="cs-block"][data-part="sh"]');
  await expect(sheet.locator('text').filter({ hasText: '오픈세일' }).first()).toBeAttached();
});

// 2026-10-22 사용자: "시트 커팅에 글자를 넣었다. 그런데 커팅글자가 나오지 않앗어" → "시트 커팅도 스카시와 같게"
test('단면 그림: 시트 커팅도 스카시처럼 바운드 박스 + 컷팅 글자로 보인다', async ({ page, request }) => {
  await openOwnedProject(page, request);
  await uploadPhoto(page);
  await page.evaluate(() => {
    const a = (window as unknown as G).__ganpanda;
    const id = a.project.addObject({ photoId: a.photos[0].id, name: '정면 간판', shape: 'rect', quad: [[100, 100], [900, 100], [900, 300], [100, 300]], sheetIds: [], widthMm: 2000, heightMm: 1000, depthMm: 40, productId: 'board-galva',
      parts: [{ id: 'sh', kind: 'sheet', type: 'sh-cut', on: 'frame', items: [{ id: 't', kind: 'text', text: '오픈세일', x: 0, y: 0, h: 300 }] }] });
    a.selectObject(id);
  });
  await page.getByTestId('object-settings-open').click();
  await page.getByTestId('object-settings').waitFor();
  const sheet = page.locator('[data-testid="cs-block"][data-part="sh"]');
  await expect(sheet.locator('text', { hasText: '오픈세일' }).first()).toBeAttached();
  await expect(sheet.locator('polygon.bbox').first()).toBeAttached();
});

// 2026-10-22 사용자: "시트 2d 3d에서 안나온다" — 글자 없이 면 전체에 붙이는 시트
test('글자 없는 시트(UV·안개·재질 시트 컷팅 없음·옛 시트)는 2D 에서 면 전체로 칠해진다', async ({ page, request }) => {
  await openOwnedProject(page, request);
  await uploadPhoto(page);
  await page.evaluate(() => {
    const a = (window as unknown as G).__ganpanda;
    const pid = a.photos[0].id;
    const q = (x: number) => [[x, 200], [x + 300, 200], [x + 300, 700], [x, 700]];
    a.project.addObject({ photoId: pid, name: '큰시트', shape: 'rect', quad: q(50), sheetIds: [], widthMm: 2100, heightMm: 2100, parts: [{ id: 'a', kind: 'sheet', type: 'sh-print', on: 'frame', items: [] }] });
    a.project.addObject({ photoId: pid, name: '안개', shape: 'rect', quad: q(400), sheetIds: [], widthMm: 2100, heightMm: 2100, parts: [{ id: 'b', kind: 'sheet', type: 'sh-frost', on: 'frame', items: [] }] });
    a.project.addObject({ photoId: pid, name: '폴딩시트', shape: 'rect', quad: q(750), sheetIds: [], widthMm: 410, heightMm: 2010, parts: [{ id: 'c', kind: 'sheet', type: 'sh-cut', on: 'frame', options: { cut: '컷팅 없음', sheetSystem: '기본색', sheetCode: '검정' }, items: [] }] });
    a.project.addObject({ photoId: pid, name: '정면문시트', shape: 'rect', quad: q(1100), sheetIds: ['sh-cut'], widthMm: 870, heightMm: 2010 });
  });
  await page.getByTestId('stage-2d').click();
  const fills = async () => page.locator('[data-testid="photo-zone"] [data-testid="parts-overlay"] rect').evaluateAll((rs) => rs.map((r) => r.getAttribute('fill')));
  await expect.poll(fills).toEqual(expect.arrayContaining(['#d9d9d9', '#e9f0f5', '#141414', '#ffffff']));
});

// 2026-10-22 사용자: "시트는 도색이 없다. uv출력과 회사별 시트 코드가 있다. 맞아 미리보기 색상 따로 시트 제작사 시트코드가 필요해"
test('재질 시트: 제작사·시트 코드는 구성내역에, 미리보기 색은 화면(2D)에만 — 도색 칸 없음', async ({ page, request }) => {
  await openOwnedProject(page, request);
  await uploadPhoto(page);
  await page.evaluate(() => {
    const a = (window as unknown as G).__ganpanda;
    const id = a.project.addObject({ photoId: a.photos[0].id, name: '폴딩시트', shape: 'rect', quad: [[100, 200], [400, 200], [400, 700], [100, 700]], sheetIds: [], widthMm: 410, heightMm: 2010, parts: [{ id: 'sh', kind: 'sheet', type: 'sh-cut', on: 'frame', options: { cut: '컷팅 없음' }, items: [] }] });
    a.selectObject(id);
  });
  await page.getByTestId('object-settings-open').click();
  const dlg = page.getByTestId('object-settings');
  await dlg.getByTestId('quick-part').first().click();
  await expect(dlg.getByTestId('part-option-sheetSystem')).toHaveCount(0);
  await dlg.getByTestId('part-option-sheetMaker').fill('3M');
  await dlg.getByTestId('part-option-sheetMaker').press('Tab');
  await dlg.getByTestId('part-option-sheetNo').fill('7725-12');
  await dlg.getByTestId('part-option-sheetNo').press('Tab');
  await dlg.getByTestId('part-option-previewColor').fill('#ff0000');
  await expect(dlg.getByTestId('part-spec')).toContainText('3M 7725-12');
  await expect(dlg.getByTestId('part-spec')).not.toContainText('#ff0000');
  await page.getByTestId('close-object-settings').click();
  await page.getByTestId('stage-2d').click();
  await expect(page.getByTestId('photo-zone').getByTestId('baked-parts')).toHaveAttribute('data-colors', /#ff0000/); // 2D 는 구운 그림 (2026-10-29)
});

// 2026-10-22 사용자: "시트가 2d 3d에 적용이 안됐어" (푸르미도그 — 치수를 넣지 않은 시트 사인물·옛 시트)
test('치수 없는 시트 사인물도 2D 에 면·글자가 칠해진다 (추정 치수 없으면 외곽선 크기)', async ({ page, request }) => {
  await openOwnedProject(page, request);
  await uploadPhoto(page);
  await clearAutoCamera(page);
  await page.evaluate(() => {
    const a = (window as unknown as G).__ganpanda;
    const pid = a.photos[0].id;
    const q = (x: number, w: number) => [[x, 200], [x + w, 200], [x + w, 500], [x, 500]];
    a.project.addObject({ photoId: pid, name: '와이드', shape: 'rect', quad: q(50, 600), sheetIds: [], parts: [
      { id: 'legacy-sheet-sh-cut', kind: 'sheet', type: 'sh-cut', on: 'frame', items: [] },
      { id: 'b', kind: 'sheet', type: 'sh-cut', on: 'legacy-sheet-sh-cut', options: { cutMode: '반컷', sheetMat: '메탈', sheetSystem: '기본색', sheetCode: '파랑' }, items: [{ id: 't', kind: 'text', text: '푸르미도그', x: 0, y: 0, h: 171 }] }] });
    a.project.addObject({ photoId: pid, name: '윗창2', shape: 'rect', quad: q(700, 300), sheetIds: [], parts: [{ id: 'c', kind: 'sheet', type: 'sh-print', on: 'frame', items: [] }] });
    a.project.addObject({ photoId: pid, name: '도어', shape: 'rect', quad: q(1050, 200), sheetIds: ['sh-cut'], widthMm: 900, heightMm: 2100 });
  });
  await page.getByTestId('stage-2d').click();
  const fills = () => page.locator('[data-testid="photo-zone"] [data-testid="parts-overlay"] rect').evaluateAll((rs) => rs.map((r) => r.getAttribute('fill')));
  await expect.poll(fills).toEqual(expect.arrayContaining(['#ffffff', '#d9d9d9']));
  await expect(page.locator('[data-testid="photo-zone"] [data-testid="parts-overlay"] text', { hasText: '푸르미도그' }).first()).toBeAttached();
});

// 2026-10-22 사용자: "안개는 블러처리하면되는데"
test('안개 시트는 2D·3D 에서 뒤를 흐리게(블러) — 다른 시트에는 블러 없음', async ({ page, request }) => {
  await openOwnedProject(page, request);
  await uploadPhoto(page);
  await page.evaluate(() => {
    const a = (window as unknown as G).__ganpanda;
    const pid = a.photos[0].id;
    const q = (x: number) => [[x, 680], [x + 300, 680], [x + 300, 980], [x, 980]];
    a.project.addObject({ photoId: pid, name: '안개', shape: 'rect', quad: q(400), sheetIds: [], widthMm: 1000, heightMm: 1000, parts: [{ id: 'f', kind: 'sheet', type: 'sh-frost', on: 'frame', items: [] }] });
    a.project.addObject({ photoId: pid, name: '통시트', shape: 'rect', quad: q(800), sheetIds: [], widthMm: 1000, heightMm: 1000, parts: [{ id: 'c', kind: 'sheet', type: 'sh-cut', on: 'frame', options: { cut: '컷팅 없음' }, items: [] }] });
  });
  await page.getByTestId('view-board').click();
  await expect(page.getByTestId('frost')).toHaveCount(0); // 실측(원본)에는 없음
  await page.getByTestId('stage-2d').click();
  await expect(page.getByTestId('frost')).toHaveCount(1);
  // 흐림은 미리 만든 흐린 그림으로 — CSS 블러 필터를 쓰지 않는다 (2026-10-29 아이폰 줌 오류: 필터 층이 확대 배율만큼 커졌다). 흐림 정도는 그대로 30px 상당
  const frost = page.getByTestId('frost');
  await expect(frost).toHaveAttribute('data-blurred', 'true');
  expect(await frost.evaluate((e) => getComputedStyle(e).filter)).toBe('none');
  expect(await frost.evaluate((e) => (e as HTMLImageElement).naturalWidth)).toBeLessThanOrEqual(400); // 작은 흐린 그림을 늘려 쓴다
  await page.getByTestId('stage-3d').click();
  await expect(page.getByTestId('photo-overlay')).toHaveCount(0); // 시트뿐인 사진은 3D 로 바꾸지 않고 2D 그대로 (2026-10-29 "시트처럼 2d인 경우는 3d로 변환할 이유가 없다")
  await expect(page.getByTestId('frost')).toHaveCount(1);
});

// 재료 조합 S2 (2026-10-22): 채널도 재료 층 — 저장 전엔 3D 깊이의 기본 묶음을 보이고, 고치면 저장(깊이 = 두께 합)
test('채널 재료 층: 뒷판·LED·옆판·앞판이 보이고, 층을 고치면 저장되어 깊이가 두께 합이 된다', async ({ page, request }) => {
  const id = await setup(page, request);
  await page.locator('[data-testid="cs-tier"][data-n="2"] [data-testid="cs-tier-row"]').click();
  await page.locator('[data-testid="cs-part"][data-part="ch"] [data-testid="cs-part-row"]').click();
  const card = page.locator('[data-testid="cs-part"][data-part="ch"]');
  await expect(card.getByTestId('cs-part-sum')).toHaveText('갈바 1.2T + LED + 알루미늄 75.8T + 아크릴 3T');
  const layers = card.getByTestId('stack-layer');
  await expect(layers).toHaveCount(4);
  await expect(layers.first()).toHaveAttribute('data-material', 'acrylic'); // 위가 앞
  // 옆판(알루미늄) 두께를 100 으로 → 저장, 깊이 = 1.2 + 0 + 100 + 3
  await layers.nth(1).getByTestId('layer-thickness').fill('100');
  await layers.nth(1).getByTestId('layer-thickness').press('Enter');
  await expect.poll(() => page.evaluate((oid) => {
    const o = (window as unknown as G).__ganpanda.objects.find((x) => x.id === oid)!;
    const ch = o.parts!.find((p) => p.id === 'ch')!;
    return ch.stack ? ch.stack.reduce((t, l) => t + l.thickness, 0) : null;
  }, id)).toBeCloseTo(104.2);
});
