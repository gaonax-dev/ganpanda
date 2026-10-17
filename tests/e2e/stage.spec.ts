import { expect, test } from '@playwright/test';
import { openOwnedProject } from './helpers';

/** 합성 건물 사진 + 띠 영역(치수 입력 → 3D 벽면 있음) */
async function setup(page: import('@playwright/test').Page, request: import('@playwright/test').APIRequestContext) {
  await openOwnedProject(page, request);
  const dataUrl = await page.evaluate(async () => { const path = '/src/lib/sim/sample.ts'; const { makeSamplePhoto } = await import(/* @vite-ignore */ path); return makeSamplePhoto().toDataURL('image/png') as string; });
  await page.getByTestId('photo-input').setInputFiles({ name: '매장.png', mimeType: 'image/png', buffer: Buffer.from(dataUrl.split(',')[1], 'base64') });
  await page.getByTestId('photo-zone').waitFor();
  await expect(page.getByTestId('sync-status')).toHaveAttribute('data-status', 'online');
  await page.evaluate(async () => {
    const sp = '/src/lib/sim/sample.ts';
    const { SAMPLE } = await import(/* @vite-ignore */ sp);
    const hp = '/src/lib/core/homography.ts';
    const { applyHomography, solveHomography } = await import(/* @vite-ignore */ hp);
    const H = solveHomography([[0, SAMPLE.wallH], [SAMPLE.wallW, SAMPLE.wallH], [SAMPLE.wallW, 0], [0, 0]], SAMPLE.corners);
    const rect = (x: number, y: number, w: number, h: number) => [[x, y + h], [x + w, y + h], [x + w, y], [x, y]].map((p) => applyHomography(H, p as [number, number]));
    const app = (window as unknown as { __ganpanda: { project: { allPhotos(): { id: string }[]; addObject(o: unknown): string } } }).__ganpanda;
    const photoId = app.project.allPhotos()[0].id;
    app.project.addObject({ photoId, name: '띠', shape: 'rect', quad: rect(0, 3700, 9000, 1000), sheetIds: [], widthMm: 9000, heightMm: 1000, productId: 'board-flex', text: '간판다' });
  });
}

test('3D 단계: 사진 위에 합성 결과가 겹치고 영역 편집은 숨는다, 내용이 바뀌면 다시 그리고, 원본으로 돌아오면 사라진다', async ({ page, request }) => {
  await setup(page, request);
  await expect(page.getByTestId('photo-overlay')).toHaveCount(0);
  await expect(page.getByTestId('sign-shape')).toHaveCount(1);
  // 단계 원본 / 2D / 3D (2026-10-17 "2d가 현재 보여주는 형식이고 원본은 실측만"): 기본 2D 에는 바탕이 그려지고, 원본은 외곽선·치수만
  await expect(page.getByTestId('stage-2d')).toHaveClass(/on/);
  await expect(page.getByTestId('sign-fill')).toHaveCount(1);
  expect(await page.getByTestId('sign-fill').evaluate((e) => getComputedStyle(e).backgroundColor)).toBe('rgb(255, 248, 230)'); // 후렉스 기본 바탕
  await page.getByTestId('stage-original').click();
  await expect(page.getByTestId('sign-fill')).toHaveCount(0);
  await expect(page.getByTestId('sign-shape')).toHaveCount(1);
  await page.getByTestId('stage-2d').click();
  await expect(page.getByTestId('sign-fill')).toHaveCount(1);
  await page.getByTestId('stage-3d').click();
  // 3D 에서는 그리기·존·자동 도구가 흐려지고(비활성), 선택·핀·사진 추가는 그대로 (2026-10-17 "3d에서는 툴바에서 작동하지 않는 기능이 있다")
  for (const t of ['tool-rect', 'tool-ellipse', 'tool-zone', 'tool-magic']) await expect(page.getByTestId(t)).toBeDisabled();
  await expect(page.getByTestId('tool-select')).toBeEnabled();
  await expect(page.getByTestId('tool-pin')).toBeEnabled();
  const overlay = page.getByTestId('photo-overlay');
  await expect(overlay).toHaveCount(1, { timeout: 30_000 });
  await expect(overlay).toHaveAttribute('src', /^data:image\/png/);
  const first = await overlay.getAttribute('src');
  // 영역은 보이지 않게(투명) 남아 눌러 고를 수 있다 — 라벨은 숨김
  expect(await page.getByTestId('sign-shape').evaluate((e) => getComputedStyle(e).stroke)).toMatch(/rgba\(0, 0, 0, 0\)|transparent/);
  // 사인물 내용이 바뀌면 그 사진만 다시 합성
  await page.evaluate(() => { const app = (window as unknown as { __ganpanda: { objects: { id: string }[]; project: { updateObject(id: string, p: unknown): void } } }).__ganpanda; app.project.updateObject(app.objects[0].id, { text: '카페' }); });
  await expect.poll(() => page.getByTestId('photo-overlay').getAttribute('src'), { timeout: 30_000 }).not.toBe(first);
  // 정면도(구성 요소 글자 위치·크기)가 바뀌어도 다시 합성 (2026-10-17 사용자: "3d가 아직 정면도의 변경을 따르지 않는다")
  const second = await overlay.getAttribute('src');
  await page.evaluate(() => { const app = (window as unknown as { __ganpanda: { objects: { id: string }[]; project: { updateObject(id: string, p: unknown): void } } }).__ganpanda; app.project.updateObject(app.objects[0].id, { parts: [{ id: 'c', kind: 'channel', type: 'ch-front', options: {}, items: [{ id: 't', kind: 'text', text: '카페', x: 0, y: 0, h: 300 }] }] }); });
  await expect.poll(() => page.getByTestId('photo-overlay').getAttribute('src'), { timeout: 30_000 }).not.toBe(second);
  const third = await overlay.getAttribute('src');
  await page.evaluate(() => { const app = (window as unknown as { __ganpanda: { objects: { id: string }[]; project: { updateObject(id: string, p: unknown): void } } }).__ganpanda; app.project.updateObject(app.objects[0].id, { parts: [{ id: 'c', kind: 'channel', type: 'ch-front', options: {}, items: [{ id: 't', kind: 'text', text: '카페', x: -900, y: 0, h: 450 }] }] }); });
  await expect.poll(() => page.getByTestId('photo-overlay').getAttribute('src'), { timeout: 30_000 }).not.toBe(third);
  // 렌더링 버튼은 사진마다 그대로 (디자인 포함 최종 합성 창)
  await expect(page.getByTestId('render-open')).toContainText('렌더링');
  await page.getByTestId('stage-original').click();
  await expect(page.getByTestId('photo-overlay')).toHaveCount(0);
  await expect(page.getByTestId('sign-shape')).toHaveCount(1);
  await expect(page.getByTestId('tool-rect')).toBeEnabled();
});
