// 칼선 SVG (2026-11-05 roadmap 10-2, 사용자: "진행해줘") — 디자인 탭 SVG 창의 [칼선 SVG]: 채널·스카시 글자 윤곽만 CutContour 레이어에, 실물 1:1(mm)
/* eslint-disable @typescript-eslint/no-explicit-any */
import { expect, test } from '@playwright/test';
import { openOwnedProject, uploadPhoto } from './helpers';

test('[칼선 SVG] — 채널 글자 윤곽이 CutContour(마젠타 선, 채움 없음)에, 시트 글자는 빠지고 이름표는 따로', async ({ page, request }) => {
  await openOwnedProject(page, request);
  await uploadPhoto(page);
  await page.evaluate(() => {
    const g = (window as any).__ganpanda; const pid = g.photos[0].id;
    g.project.addObject({ photoId: pid, name: '정면 간판', shape: 'rect', quad: [[200, 100], [800, 100], [800, 300], [200, 300]], sheetIds: [], productId: 'body-none', widthMm: 3000, heightMm: 600,
      parts: [
        { id: 'c', kind: 'channel', type: 'ch-front', items: [{ id: 't', kind: 'text', text: '바로', x: 0, y: 0, h: 400 }] },
        { id: 'h', kind: 'sheet', type: 'sh-cut', items: [{ id: 'z', kind: 'text', text: '시트', x: 0, y: -250, h: 80 }] },
      ] });
  });
  await page.getByTestId('view-design').click();
  await page.getByTestId('design-bar').getByTestId('export-svg').click();
  const dl = page.waitForEvent('download');
  await page.getByTestId('cut-download').click();
  expect((await dl).suggestedFilename()).toMatch(/칼선 1-1\.svg$/);
  const svg: string = await page.evaluate(() => (window as any).__ganpanda.lastSvg);
  expect(svg).toMatch(/width="3000mm" height="600mm"/);
  const cut = /<g id="CutContour"[^>]*>(.*?)<\/g>/.exec(svg)!;
  expect(cut[0]).toContain('stroke="#ff00ff"');
  expect(cut[0]).toContain('fill="none"');
  expect((cut[1].match(/<path /g) ?? []).length).toBe(1);
  // '바로' 두 글자 = 바깥 윤곽 여러 개 (ㅂ 구멍 포함)
  expect((cut[1].match(/M/g) ?? []).length).toBeGreaterThan(3);
  // 글자 폭 = 상자 폭 96% → 가운데 둘레 안 (x 좌표가 카드 안)
  const xs = [...cut[1].matchAll(/[ML]([\d.]+),/g)].map((m) => Number(m[1]));
  expect(Math.min(...xs)).toBeGreaterThan(0);
  expect(Math.max(...xs)).toBeLessThan(3000);
  expect(svg).toContain('<g id="Labels"');
  expect(svg).toContain('정면 간판');
});
