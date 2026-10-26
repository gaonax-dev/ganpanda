// 2026-10-23 사용자: "사진보드 정면도 사이물카드 컨트롤로의 선택과 해제를 두 컨트롤러 모두에게 주고 터치업에서 선택 해제되게
// 그리고 글과 버튼들을 상단 헤더의 창으로 이동해줘 여기에 정면도 사인물 고정 토글버튼도 추가해줘"
import { expect, test } from '@playwright/test';
import { openOwnedProject, uploadPhoto } from './helpers';

type G = { __ganpanda: { photos: { id: string }[]; objects: { id: string; listX?: number; listY?: number }[]; project: { addObject(o: unknown): string }; settings: { flatLocked?: boolean } } };

async function setup(page: import('@playwright/test').Page, request: import('@playwright/test').APIRequestContext) {
  await openOwnedProject(page, request);
  await uploadPhoto(page);
  await page.evaluate(() => {
    const a = (window as unknown as G).__ganpanda;
    a.project.addObject({ photoId: a.photos[0].id, name: '간판', shape: 'rect', quad: [[200, 200], [1000, 200], [1000, 450], [200, 450]], sheetIds: [], widthMm: 4000, heightMm: 900, listX: 0, listY: 0 });
  });
  await expect(page.getByTestId('board-card')).toHaveCount(1);
  await page.getByTestId('zoom-fit').click();
  await page.waitForTimeout(300);
}
const tap = async (page: import('@playwright/test').Page, id: string) => { const b = (await page.getByTestId(id).boundingBox())!; await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2); };

test('정면도 카드 묶음: ✥ 와 크기 손잡이 모두 누르면 배열 모드 켜고 끔, 빈 곳을 탭하면(손 뗄 때) 꺼짐 — 끌면 그대로', async ({ page, request }) => {
  await setup(page, request);
  const bar = page.getByTestId('flat-bar');
  await expect(bar).toHaveCount(0);
  await tap(page, 'flat-handle'); // 크기 손잡이도 켠다
  await expect(bar).toBeVisible();
  await expect(page.getByTestId('flat-outline')).toBeVisible();
  await tap(page, 'flat-handle');
  await expect(bar).toHaveCount(0);
  await tap(page, 'flat-move');
  await expect(bar).toBeVisible();
  // 빈 곳을 끌면(팬) 그대로, 탭하면 꺼짐
  const c = (await page.getByTestId('board-canvas').boundingBox())!;
  await page.mouse.move(c.x + 30, c.y + c.height - 140); await page.mouse.down(); await page.mouse.move(c.x + 90, c.y + c.height - 100, { steps: 5 }); await page.mouse.up();
  await expect(bar).toBeVisible();
  await page.mouse.click(c.x + 30, c.y + c.height - 140);
  await expect(bar).toHaveCount(0);
});

// 2026-10-26 "대지 제어툴바 하단으로 이동시켜줘" — 2026-10-23 상단 헤더 막대는 대체됨
// 같은 날 "재정렬, 간격, 비율,고정 만 보이게 그리고 간격과 비율의 +-는 버튼으로 디자인 변경해줘" — [완료]는 없음(빈 곳을 탭하면 끝)
test('대지 도구 막대(재정렬 · 간격 −/+ · 비율 −/+ · 고정)는 하단 도구 막대 위에, 상단 작업 탭은 그대로 — [고정]을 켜면 카드를 끌어도 움직이지 않는다', async ({ page, request }) => {
  await setup(page, request);
  await expect(page.getByTestId('flat-label')).toHaveCount(0);
  await tap(page, 'flat-move');
  const bar = page.getByTestId('flat-bar');
  for (const id of ['flat-rearrange', 'flat-gap-down', 'flat-gap-up', 'flat-scale-down', 'flat-scale-up', 'flat-lock']) await expect(bar.getByTestId(id)).toBeVisible();
  await expect(bar.getByTestId('flat-arrange-done')).toHaveCount(0);
  await expect(bar).toContainText('간격');
  await expect(bar).toContainText('비율');
  for (const id of ['flat-gap-up', 'flat-scale-up']) { const r = (await bar.getByTestId(id).boundingBox())!; expect(r.width).toBeGreaterThanOrEqual(30); expect(r.height).toBeGreaterThanOrEqual(30); } // −/+ 는 누르기 좋은 단추
  await expect(page.getByTestId('work-tabs')).toBeVisible(); // 상단은 그대로
  const vb = page.viewportSize()!, bb = (await bar.boundingBox())!, tb = (await page.locator('div.tools[role="toolbar"]').boundingBox())!;
  expect(bb.y).toBeGreaterThan(vb.height * 0.6); // 화면 아래쪽
  expect(bb.y + bb.height).toBeLessThanOrEqual(tb.y + 1); // 하단 도구 막대 바로 위 (겹치지 않음)
  await bar.getByTestId('flat-lock').click();
  await expect(bar.getByTestId('flat-lock')).toHaveClass(/on/);
  expect(await page.evaluate(() => (window as unknown as G).__ganpanda.settings.flatLocked)).toBe(true);
  const card = page.getByTestId('board-card').first();
  const b = (await card.boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.down(); await page.mouse.move(b.x + b.width / 2 + 80, b.y + b.height / 2 + 40, { steps: 4 }); await page.mouse.up();
  expect(await page.evaluate(() => { const o = (window as unknown as G).__ganpanda.objects[0]; return [o.listX, o.listY]; })).toEqual([0, 0]);
  const c = (await page.getByTestId('board-canvas').boundingBox())!;
  await page.mouse.click(c.x + 30, c.y + 30); // 빈 곳을 탭하면 끝
  await expect(bar).toHaveCount(0);
  await expect(page.getByTestId('work-tabs')).toBeVisible();
});

test.describe('휴대폰', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  test('사인물을 고른 채로 카드 묶음(대지)을 누르면 사인물 선택이 풀리고 대지 도구가 나온다 (2026-10-24 "사인물카드 대지선택하면 이전에 선택이 있는 경우 대지 툴이 나오지 않는다")', async ({ page, request }) => {
    await setup(page, request);
    await page.evaluate(() => { const a = (window as unknown as G & { __ganpanda: { selectObject(id: string): void } }).__ganpanda; a.selectObject(a.objects[0].id); });
    await expect(page.getByTestId('mobile-edit')).toBeVisible(); // 사인물 도구
    await page.getByTestId('flat-move').tap();
    await expect(page.getByTestId('flat-bar')).toBeVisible(); // 대지 도구
    for (const id of ['flat-rearrange', 'flat-gap-up', 'flat-scale-up', 'flat-lock']) expect((await page.getByTestId(id).boundingBox())!.x + (await page.getByTestId(id).boundingBox())!.width).toBeLessThanOrEqual(390); // 한 화면에 다 (2026-10-26)
    await expect(page.getByTestId('mobile-edit')).toHaveCount(0);
    expect(await page.evaluate(() => (window as unknown as { __ganpanda: { selectedId: string | null } }).__ganpanda.selectedId)).toBeNull();
  });
});
