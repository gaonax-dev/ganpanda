import { expect, test } from '@playwright/test';
import { openObjectSettings, openOwnedProject } from './helpers';

/**
 * 샘플 건물 사진(원근 있음)에서 간판 띠(9000×1000)·출입문(1000×2900)을 정확한 모서리로 만들고,
 * 띠를 가로 기준, 문을 세로 기준으로 → AI 평가 → 전체 적용 → 창문(1500×850)의 추정 치수가 10% 안.
 * 사인물의 정확한 사각 영역은 개발용 훅(window.__ganpanda)으로 넣는다.
 */
test('실측 기준선: 가로·세로 기준을 따로 지정 → AI 평가 → 전체 적용 → 다른 영역 추정', async ({ page, request }) => {
  await openOwnedProject(page, request);
  const dataUrl = await page.evaluate(async () => {
    const path = '/src/lib/sim/sample.ts';
    const { makeSamplePhoto } = await import(/* @vite-ignore */ path);
    return makeSamplePhoto().toDataURL('image/png') as string;
  });
  await page.getByTestId('photo-input').setInputFiles({ name: '매장.png', mimeType: 'image/png', buffer: Buffer.from(dataUrl.split(',')[1], 'base64') });
  await page.getByTestId('photo-zone').waitFor();
  await expect(page.getByTestId('sync-status')).toHaveAttribute('data-status', 'online');

  // 벽 mm 좌표 → 사진 px 로 사각 영역을 만들어 넣는다 (띠·문·창)
  const ids = await page.evaluate(async () => {
    const path = '/src/lib/sim/sample.ts';
    const { SAMPLE } = await import(/* @vite-ignore */ path);
    const hp = '/src/lib/core/homography.ts';
    const { applyHomography, solveHomography } = await import(/* @vite-ignore */ hp);
    const H = solveHomography([[0, SAMPLE.wallH], [SAMPLE.wallW, SAMPLE.wallH], [SAMPLE.wallW, 0], [0, 0]], SAMPLE.corners);
    const rect = (x: number, y: number, w: number, h: number) => [[x, y + h], [x + w, y + h], [x + w, y], [x, y]].map((p) => applyHomography(H, p as [number, number]));
    const app = (window as unknown as { __ganpanda: { project: { allPhotos(): { id: string }[]; addObject(o: unknown): string } } }).__ganpanda;
    const photoId = app.project.allPhotos()[0].id;
    return {
      band: app.project.addObject({ photoId, name: '띠', shape: 'rect', quad: rect(0, 3700, 9000, 1000), sheetIds: [], widthMm: 9000, heightMm: 1000 }),
      door: app.project.addObject({ photoId, name: '문', shape: 'rect', quad: rect(4000, 0, 1000, 2900), sheetIds: [], widthMm: 1000, heightMm: 2900 }),
      win: app.project.addObject({ photoId, name: '창', shape: 'rect', quad: rect(600, 4950, 1500, 850), sheetIds: [] }),
    };
  });
  await expect(page.getByTestId('sign-shape')).toHaveCount(3);
  const select = (id: string) => page.evaluate((i) => (window as unknown as { __ganpanda: { selectObject(id: string): void } }).__ganpanda.selectObject(i), id);

  // 띠 → 가로 기준, 문 → 세로 기준
  await select(ids.band);
  await openObjectSettings(page);
  await page.getByTestId('ref-h').check();
  await select(ids.door);
  await openObjectSettings(page);
  await page.getByTestId('ref-v').check();
  await page.getByTestId('close-object-settings').click();

  // 기준선 패널: 평가 전 → 적용 불가
  await expect(page.getByTestId('calib-panel')).toBeVisible();
  await expect(page.getByTestId('calib-apply')).toBeDisabled();
  await page.getByTestId('calib-eval').click();
  await expect(page.getByTestId('calib-ref')).toHaveCount(4, { timeout: 15_000 });
  await expect(page.getByTestId('calib-apply')).toBeEnabled();
  await page.getByTestId('calib-apply').click();
  await expect(page.getByTestId('calib-status')).toContainText('적용됨');

  // 창문 추정 치수가 1500×850 의 10% 안
  await select(ids.win);
  await openObjectSettings(page);
  const w = Number((await page.getByTestId('width-mm').getAttribute('placeholder'))!.replace(/[^\d]/g, ''));
  const h = Number((await page.getByTestId('height-mm').getAttribute('placeholder'))!.replace(/[^\d]/g, ''));
  expect(Math.abs(w - 1500) / 1500).toBeLessThan(0.1);
  expect(Math.abs(h - 850) / 850).toBeLessThan(0.1);

  // 기준을 바꾸면(문 세로 기준 해제) 다시 평가 필요
  await select(ids.door);
  await openObjectSettings(page);
  await page.getByTestId('ref-v').uncheck();
  await page.getByTestId('close-object-settings').click();
  await expect(page.getByTestId('calib-status')).toContainText('다시 평가');
});

test('AI 가 잡은 기준선을 사람이 창에서 직접 끌어 고치고 적용한다', async ({ page, request }) => {
  await openOwnedProject(page, request);
  const dataUrl = await page.evaluate(async () => {
    const path = '/src/lib/sim/sample.ts';
    const { makeSamplePhoto } = await import(/* @vite-ignore */ path);
    return makeSamplePhoto().toDataURL('image/png') as string;
  });
  await page.getByTestId('photo-input').setInputFiles({ name: '매장.png', mimeType: 'image/png', buffer: Buffer.from(dataUrl.split(',')[1], 'base64') });
  await page.getByTestId('photo-zone').waitFor();
  const ids = await page.evaluate(async () => {
    const path = '/src/lib/sim/sample.ts';
    const { SAMPLE } = await import(/* @vite-ignore */ path);
    const hp = '/src/lib/core/homography.ts';
    const { applyHomography, solveHomography } = await import(/* @vite-ignore */ hp);
    const H = solveHomography([[0, SAMPLE.wallH], [SAMPLE.wallW, SAMPLE.wallH], [SAMPLE.wallW, 0], [0, 0]], SAMPLE.corners);
    const rect = (x: number, y: number, w: number, h: number) => [[x, y + h], [x + w, y + h], [x + w, y], [x, y]].map((p) => applyHomography(H, p as [number, number]));
    const app = (window as unknown as { __ganpanda: { project: { allPhotos(): { id: string }[]; addObject(o: unknown): string } } }).__ganpanda;
    const photoId = app.project.allPhotos()[0].id;
    return { band: app.project.addObject({ photoId, name: '띠', shape: 'rect', quad: rect(0, 3700, 9000, 1000), sheetIds: [], widthMm: 9000, heightMm: 1000, refH: true, refV: true }) };
  });
  await page.getByTestId('calib-eval').click();
  await expect(page.getByTestId('calib-status')).toContainText('평가됨');
  const before = await page.evaluate((id) => (window as unknown as { __ganpanda: { calibEvals: Record<string, { snapped: Record<string, [number, number][]> }>; project: { object(id: string): { quad: [number, number][]; photoId: string } } } }).__ganpanda.calibEvals[(window as unknown as { __ganpanda: { project: { object(id: string): { photoId: string } } } }).__ganpanda.project.object(id).photoId].snapped[id] ?? (window as unknown as { __ganpanda: { project: { object(id: string): { quad: [number, number][] } } } }).__ganpanda.project.object(id).quad, ids.band);

  // 창 열기 → 첫 꼭짓점(좌상)을 오른쪽 아래로 끌기
  await page.getByTestId('calib-edit').click();
  const dlg = page.getByTestId('calib-edit-dialog');
  await expect(dlg).toBeVisible();
  await expect(dlg.getByTestId('calib-vertex')).toHaveCount(4);
  const v = dlg.getByTestId('calib-vertex').first();
  const b = (await v.boundingBox())!;
  const scale = Number(await dlg.getByTestId('calib-edit-svg').getAttribute('data-scale')); // 화면 px / 사진 px
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2 + 30 * scale, b.y + b.height / 2 + 12 * scale, { steps: 5 });
  await page.mouse.up();
  await expect(dlg.getByTestId('calib-ref').first()).toContainText('직접');

  // 적용 → 영역의 좌상 꼭짓점이 끈 만큼 (±2px) 이동
  await dlg.getByTestId('calib-edit-apply').click();
  await expect(dlg).toHaveCount(0);
  await expect(page.getByTestId('calib-status')).toContainText('적용됨');
  const after = await page.evaluate((id) => (window as unknown as { __ganpanda: { project: { object(id: string): { quad: [number, number][] } } } }).__ganpanda.project.object(id).quad, ids.band);
  expect(Math.abs(after[0][0] - (before[0][0] + 30))).toBeLessThanOrEqual(2);
  expect(Math.abs(after[0][1] - (before[0][1] + 12))).toBeLessThanOrEqual(2);
  expect(after[2]).toEqual(before[2]); // 다른 꼭짓점은 그대로
});
