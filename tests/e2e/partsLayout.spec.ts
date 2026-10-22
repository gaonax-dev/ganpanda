// 조합형 4단계: 정면도 배치를 3D·실사 합성·평면도 카드·리스트·PDF 에 반영 (2026-10-16 사용자: "4단계 진행해")
import { expect, test, type Page } from '@playwright/test';
import { openOwnedProject } from './helpers';

/** 합성 건물 사진 + 9000×1000 갈바 간판: 왼쪽(-3000)에 전광 채널 글자, 오른쪽(+3000)에 파란 그림(UV 출력 시트) */
async function setup(page: Page, request: Parameters<typeof openOwnedProject>[1]) {
  await openOwnedProject(page, request, '배치 반영');
  const dataUrl = await page.evaluate(async () => {
    const path = '/src/lib/sim/sample.ts';
    const { makeSamplePhoto } = await import(/* @vite-ignore */ path);
    return makeSamplePhoto().toDataURL('image/png') as string;
  });
  await page.getByTestId('photo-input').setInputFiles({ name: '매장.png', mimeType: 'image/png', buffer: Buffer.from(dataUrl.split(',')[1], 'base64') });
  await page.getByTestId('photo-zone').waitFor();
  await expect(page.getByTestId('sync-status')).toHaveAttribute('data-status', 'online');
  return page.evaluate(async () => {
    // 경로를 변수로 두어 타입 검사가 브라우저 모듈 경로를 찾지 않게 (render.spec 과 같음)
    const [sp, hp, ap] = ['/src/lib/sim/sample.ts', '/src/lib/core/homography.ts', '/src/lib/assets.ts'];
    const { SAMPLE } = await import(/* @vite-ignore */ sp);
    const { applyHomography, solveHomography } = await import(/* @vite-ignore */ hp);
    const { putAsset } = await import(/* @vite-ignore */ ap);
    const c = document.createElement('canvas'); c.width = 64; c.height = 64;
    const g = c.getContext('2d')!; g.fillStyle = '#0040ff'; g.fillRect(0, 0, 64, 64);
    const blob: Blob = await new Promise((res) => c.toBlob((b) => res(b!), 'image/png'));
    const assetId: string = await putAsset(blob);
    const H = solveHomography([[0, SAMPLE.wallH], [SAMPLE.wallW, SAMPLE.wallH], [SAMPLE.wallW, 0], [0, 0]], SAMPLE.corners);
    const rect = (x: number, y: number, w: number, h: number) => [[x, y + h], [x + w, y + h], [x + w, y], [x, y]].map((p) => applyHomography(H, p as [number, number]));
    const app = (window as unknown as { __ganpanda: { project: { allPhotos(): { id: string }[]; addObject(o: unknown): string } } }).__ganpanda;
    app.project.addObject({
      photoId: app.project.allPhotos()[0].id, name: '띠', shape: 'rect', quad: rect(0, 3700, 9000, 1000), sheetIds: [], widthMm: 9000, heightMm: 1000, productId: 'board-galva',
      parts: [
        { id: 'c', kind: 'channel', type: 'ch-front', items: [{ id: 't', kind: 'text', text: '간판', x: -3000, y: 0, h: 700 }] },
        { id: 'h', kind: 'sheet', type: 'sh-print', on: 'frame', items: [{ id: 'i', kind: 'image', image: { assetId, name: 'blue.png' }, x: 3000, y: 0, h: 800, w: 800 }, { id: 'e', kind: 'shape', shape: 'ellipse', fill: '#ff0000', x: 1500, y: 0, h: 300, w: 300 }] }, // 도형 (2단계)
        { id: 'r', kind: 'sheet', type: 'sh-cut', on: 'c', items: [{ id: 'r1', kind: 'shape', shape: 'rect', fill: '#ffffff', x: -3000, y: 420, h: 100, w: 600 }] }, // 채널 앞면 위 시트 → 3D 에서 채널 두께만큼 올라선 판 (2단계)
      ],
    });
    return { left: applyHomography(H, [1500, 4200]) as [number, number], right: applyHomography(H, [7500, 4200]) as [number, number], mid: applyHomography(H, [4500, 4200]) as [number, number] };
  });
}

async function samplePixels(page: Page, dataUrl: string, at: [number, number], radius: number) {
  return page.evaluate(async ({ dataUrl, at, radius }) => {
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = dataUrl; });
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const g = c.getContext('2d')!; g.drawImage(img, 0, 0);
    const k = img.width / 1600;
    const d = g.getImageData(Math.round(at[0] * k - radius), Math.round(at[1] * k - radius), radius * 2, radius * 2).data;
    const out: [number, number, number][] = [];
    for (let i = 0; i < d.length; i += 4) out.push([d[i], d[i + 1], d[i + 2]]);
    return out;
  }, { dataUrl, at, radius });
}

test('실사 합성: 채널 글자는 정면도의 왼쪽 자리에 입체로, 그림 객체는 오른쪽 자리 앞면에', async ({ page, request }) => {
  const at = await setup(page, request);
  await page.getByTestId('render-open').click();
  const dlg = page.getByTestId('render-dialog');
  await expect(dlg.getByTestId('render-count')).toContainText('1', { timeout: 20_000 });
  await page.waitForTimeout(1000);
  const hook = () => (window as unknown as { __ganpanda: { lastRender: string } }).__ganpanda.lastRender;
  await dlg.getByTestId('render-save').click();
  await expect.poll(() => page.evaluate(hook)).toMatch(/^data:image\/png/);
  const url = await page.evaluate(hook);
  const red = (px: [number, number, number][]) => px.filter(([r, g, b]) => r > 150 && r - g > 50 && r - b > 50).length;
  const blue = (px: [number, number, number][]) => px.filter(([r, g, b]) => b > 150 && b - r > 80 && b - g > 50).length;
  const left = await samplePixels(page, url, at.left, 30), right = await samplePixels(page, url, at.right, 20), mid = await samplePixels(page, url, at.mid, 20);
  expect(red(left)).toBeGreaterThan(30); // 글자는 왼쪽에
  expect(red(mid)).toBe(0); // 가운데에 이어 붙이지 않는다
  expect(blue(right)).toBeGreaterThan(100); // 그림은 오른쪽 앞면에
});

test('평면도 카드·리스트 카드·PDF 에 정면도 배치가 보인다', async ({ page, request }) => {
  await setup(page, request);
  await page.getByTestId('stage-2d').click(); // 2D 탭 (2026-10-22 작업 탭 실측·2D·3D·디자인·리스트)
  // 사진 위 외곽선 안에도 같은 배치 (원본 단계, 2026-10-17)
  await expect(page.getByTestId('photo-zone').getByTestId('parts-overlay').locator('text')).toHaveText('간판');
  const card = page.getByTestId('board-card').first();
  await expect(card.getByTestId('parts-overlay')).toBeVisible();
  await expect(card.getByTestId('parts-overlay').locator('text')).toHaveText('간판');
  await expect(card.getByTestId('parts-overlay').locator('image')).toHaveCount(1);
  await expect(card.getByTestId('parts-overlay').locator('ellipse')).toHaveCount(1); // 도형 (2단계)
  // 글자는 카드 왼쪽 1/3 쯤 (−3000 / 9000)
  const cb = (await card.boundingBox())!, tb = (await card.getByTestId('parts-overlay').locator('text').boundingBox())!;
  expect((tb.x + tb.width / 2 - cb.x) / cb.width).toBeCloseTo(1 / 6, 1);
  await page.getByTestId('view-list').click();
  await expect(page.getByTestId('list-card').getByTestId('parts-overlay').locator('text')).toHaveText('간판');
  const popup = page.waitForEvent('popup');
  await page.getByTestId('export-pdf').click();
  const w = await popup;
  const svg = await page.evaluate(() => (window as unknown as { __ganpanda: { lastSvg: string } }).__ganpanda.lastSvg);
  expect(svg).toContain('data-items=');
  expect(svg).toContain('>간판</text>');
  expect(svg).toMatch(/<ellipse [^>]*fill="#ff0000"/); // 도형은 전개도 SVG 에도
  expect(svg).toMatch(/<image xlink:href="data:image\/png;base64,[^"]+" href="data:image\/png;base64,[^"]+" x=/); // 일러스트레이터용 xlink:href (2026-10-18)
  await w.close();
});
