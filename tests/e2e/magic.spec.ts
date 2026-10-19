import { expect, test } from '@playwright/test';
import { openOwnedProject } from './helpers';

// 실제 SlimSAM 추론 (로컬 R2 의 모델 파일 사용). 모델 로드·분석에 수십 초 걸릴 수 있다.
// 단색 합성 사진에는 SAM 이 약하므로 명암·창문이 있는 샘플 건물 사진(1600×1100)을 쓴다.
test('자동 분리: 호버하면 물체 윤곽이 미리 보이고, 클릭하면 다각형 사인물이 된다', async ({ page, request }) => {
  test.setTimeout(180_000);
  await openOwnedProject(page, request);
  const dataUrl = await page.evaluate(async () => {
    const path = '/src/lib/sim/sample.ts'; // 개발 서버 모듈 (TS 가 해석하지 않도록 변수로)
    const { makeSamplePhoto } = await import(/* @vite-ignore */ path);
    return makeSamplePhoto().toDataURL('image/png') as string;
  });
  await page.getByTestId('photo-input').setInputFiles({ name: '매장.png', mimeType: 'image/png', buffer: Buffer.from(dataUrl.split(',')[1], 'base64') });
  await page.getByTestId('photo-zone').waitFor();
  await page.keyboard.press('a');
  await expect.poll(() => page.evaluate(() => (window as unknown as { __ganpanda: { tool: string } }).__ganpanda.tool)).toBe('magic'); // 단추는 빠졌고(2026-10-20) 단축키 A 로만
  await expect(page.getByTestId('ai-status')).toHaveCount(0, { timeout: 120_000 });
  await expect(page.getByTestId('photo-ai-status')).toHaveCount(0, { timeout: 120_000 });

  // 2층 첫 창문 위에 호버 (사진 px 약 450, 290)
  const b = (await page.getByTestId('photo-img').boundingBox())!;
  const k = b.width / 1600;
  const hover: [number, number] = [450, 290];
  await page.mouse.move(b.x + hover[0] * k, b.y + hover[1] * k);
  await page.mouse.move(b.x + (hover[0] + 3) * k, b.y + (hover[1] + 3) * k);
  await expect(page.getByTestId('magic-preview')).toBeVisible({ timeout: 30_000 });
  await page.mouse.click(b.x + (hover[0] + 3) * k, b.y + (hover[1] + 3) * k);
  await expect(page.getByTestId('sign-shape')).toHaveCount(1);
  await expect(page.getByTestId('sign-shape')).toHaveAttribute('data-shape', 'polygon');
  await expect(page.getByTestId('object-panel')).toBeVisible();

  // 윤곽은 호버 지점을 포함하고, 사진 전체가 아니라 창문 크기 정도여야 한다
  const pts = (await page.getByTestId('sign-shape').getAttribute('points'))!.split(' ').map((q) => q.split(',').map(Number));
  const xs = pts.map((q) => q[0]), ys = pts.map((q) => q[1]);
  const w = Math.max(...xs) - Math.min(...xs), h = Math.max(...ys) - Math.min(...ys);
  expect(Math.min(...xs)).toBeLessThan(hover[0]);
  expect(Math.max(...xs)).toBeGreaterThan(hover[0]);
  expect(Math.min(...ys)).toBeLessThan(hover[1]);
  expect(Math.max(...ys)).toBeGreaterThan(hover[1]);
  expect(w).toBeLessThan(1600 * 0.3);
  expect(h).toBeLessThan(1100 * 0.3);
});

test('작업 존이 있으면 존 안만 분석·분리하고, 존 밖에서는 미리보기가 없다', async ({ page, request }) => {
  test.setTimeout(180_000);
  await openOwnedProject(page, request);
  const dataUrl = await page.evaluate(async () => {
    const path = '/src/lib/sim/sample.ts';
    const { makeSamplePhoto } = await import(/* @vite-ignore */ path);
    return makeSamplePhoto().toDataURL('image/png') as string;
  });
  await page.getByTestId('photo-input').setInputFiles({ name: '매장.png', mimeType: 'image/png', buffer: Buffer.from(dataUrl.split(',')[1], 'base64') });
  await page.getByTestId('photo-zone').waitFor();
  // 존 = 간판 띠 주변 (사진 px 약 180..1380 × 330..580)
  await page.keyboard.press('z');
  const b = (await page.getByTestId('photo-img').boundingBox())!;
  const k = b.width / 1600;
  await page.mouse.move(b.x + 180 * k, b.y + 330 * k); await page.mouse.down();
  await page.mouse.move(b.x + 1380 * k, b.y + 580 * k, { steps: 5 }); await page.mouse.up();
  await expect(page.getByTestId('zone-shape')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await page.keyboard.press('a');
  await expect(page.getByTestId('ai-status')).toHaveCount(0, { timeout: 120_000 });
  await expect(page.getByTestId('photo-ai-status')).toHaveCount(0, { timeout: 120_000 });
  // 존 밖(2층 창문) → 미리보기 없음
  await page.mouse.move(b.x + 450 * k, b.y + 290 * k);
  await page.mouse.move(b.x + 453 * k, b.y + 293 * k);
  await page.waitForTimeout(800);
  await expect(page.getByTestId('magic-preview')).toHaveCount(0);
  // 존 안(간판 띠) → 미리보기, 윤곽이 존 안에만
  await page.mouse.move(b.x + 700 * k, b.y + 470 * k);
  await page.mouse.move(b.x + 703 * k, b.y + 473 * k);
  await expect(page.getByTestId('magic-preview')).toBeVisible({ timeout: 30_000 });
  const pts = (await page.getByTestId('magic-preview').getAttribute('points'))!.split(' ').map((q) => q.split(',').map(Number));
  expect(Math.min(...pts.map((q) => q[1]))).toBeGreaterThanOrEqual(329);
  expect(Math.max(...pts.map((q) => q[1]))).toBeLessThanOrEqual(581);
  expect(Math.min(...pts.map((q) => q[0]))).toBeGreaterThanOrEqual(179);
});
