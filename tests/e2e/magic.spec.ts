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
  await expect(page.getByTestId('tool-magic')).toHaveClass(/on/);
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
