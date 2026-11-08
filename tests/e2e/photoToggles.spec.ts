// 사진 머리글 (2026-11-08 사용자: "정보 구별선 제거 랜더링 주간야간 토글버튼") — 앞선 [정보]·[구별선] 토글(2026-10-24)은 대체됨.
// [렌더링]은 사진 위 3D 의 ☀ 주간 / 🌙 야간 토글이 되고, 렌더링 창(PNG 저장)은 사진 ⚙ 메뉴로
import { expect, test } from '@playwright/test';
import { openOwnedProject } from './helpers';

type G = { __ganpanda: { photos: { id: string }[]; project: { addObject(o: unknown): string }; photoNight: Record<string, boolean>; stageKey(id: string): string; stageRenders: Record<string, { key: string; url: string }> } };

async function setup(page: import('@playwright/test').Page, request: import('@playwright/test').APIRequestContext) {
  await openOwnedProject(page, request);
  const dataUrl = await page.evaluate(async () => { const path = '/src/lib/sim/sample.ts'; const { makeSamplePhoto } = await import(/* @vite-ignore */ path); return makeSamplePhoto().toDataURL('image/png') as string; });
  await page.getByTestId('photo-input').setInputFiles({ name: '매장.png', mimeType: 'image/png', buffer: Buffer.from(dataUrl.split(',')[1], 'base64') });
  await page.getByTestId('photo-zone').waitFor();
  await page.evaluate(async () => {
    const sp = '/src/lib/sim/sample.ts'; const { SAMPLE } = await import(/* @vite-ignore */ sp);
    const hp = '/src/lib/core/homography.ts'; const { applyHomography, solveHomography } = await import(/* @vite-ignore */ hp);
    const H = solveHomography([[0, SAMPLE.wallH], [SAMPLE.wallW, SAMPLE.wallH], [SAMPLE.wallW, 0], [0, 0]], SAMPLE.corners);
    const rect = (x: number, y: number, w: number, h: number) => [[x, y + h], [x + w, y + h], [x + w, y], [x, y]].map((p) => applyHomography(H, p as [number, number]));
    const g = (window as unknown as G).__ganpanda;
    g.project.addObject({ photoId: g.photos[0].id, name: '띠', shape: 'rect', quad: rect(0, 3700, 9000, 1000), sheetIds: [], widthMm: 9000, heightMm: 1000, productId: 'board-flex', text: '간판다' });
  });
}

test('머리글에 [정보]·[구별선]이 없고, [렌더링] 자리는 제안·디자인에서 주간/야간 토글 — 야간이면 사진 위 3D 가 야간 그림으로 바뀐다', async ({ page, request }) => {
  test.setTimeout(120_000);
  await setup(page, request);
  await expect(page.getByTestId('photo-toggle-info')).toHaveCount(0);
  await expect(page.getByTestId('photo-toggle-lines')).toHaveCount(0);
  await expect(page.getByTestId('photo-night')).toHaveCount(0); // 실측에는 3D 가 없다
  await page.getByTestId('view-propose').click();
  const night = page.getByTestId('photo-night');
  await expect(night).toHaveText(/주간/);
  await expect(night).toHaveAttribute('aria-pressed', 'false');
  const pid = await page.evaluate(() => (window as unknown as G).__ganpanda.photos[0].id);
  const render = () => page.evaluate((pid) => (window as unknown as G).__ganpanda.stageRenders['p:' + pid] ?? { key: '', url: '' }, pid);
  await expect.poll(async () => (await render()).url, { timeout: 60_000 }).toMatch(/^blob:/);
  const dayKey = (await render()).key;
  const brightness = async () => page.evaluate(async (url) => { const im = new Image(); im.src = url; await im.decode(); const c = document.createElement('canvas'); c.width = 64; c.height = 48; const g = c.getContext('2d')!; g.drawImage(im, 0, 0, 64, 48); const d = g.getImageData(0, 0, 64, 48).data; let s = 0; for (let i = 0; i < d.length; i += 4) s += d[i] + d[i + 1] + d[i + 2]; return s / (d.length / 4) / 3; }, (await render()).url);
  const day = await brightness();
  await night.click();
  await expect(night).toHaveText(/야간/);
  await expect(night).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate((pid) => (window as unknown as G).__ganpanda.photoNight[pid], pid)).toBe(true);
  await expect.poll(async () => { const r = await render(); return r.url && r.key !== dayKey && !r.key.startsWith('stale|'); }, { timeout: 60_000 }).toBeTruthy();
  expect(await brightness()).toBeLessThan(day * 0.85); // 야간 = 어둡다 (하늘이 많은 견본 사진 — 배경 0.2·간판 발광)
  await night.click();
  await expect(night).toHaveText(/주간/);
  await expect.poll(async () => (await render()).key, { timeout: 30_000 }).toBe(dayKey); // 주간 그림은 저장된 것 그대로
});

test('렌더링 창(PNG 저장)은 사진 ⚙ 메뉴의 [렌더링]', async ({ page, request }) => {
  await setup(page, request);
  await page.getByTestId('view-propose').click();
  await page.getByTestId('photo-menu').click();
  await page.getByTestId('render-open').click();
  await expect(page.getByTestId('render-dialog')).toBeVisible();
});

// 2026-11-08 사용자: "돌출간판의 라이팅 글로우가 컬러과 관계없이 나온다. 돌출간판의 경우 흰색영역에서 글로우가 생겨야 맞다. 버건디 컬러에서는 버건디 컬러로 글로우가 약하게 나와야한다"
test('상자 사인물의 번짐은 앞면 그림 색대로 — 흰 곳은 밝게, 버건디는 버건디로 약하게', async ({ page, request }) => {
  await openOwnedProject(page, request);
  const r = await page.evaluate(async () => {
    const sp = '/src/lib/sim/signs.ts'; const S = await import(/* @vite-ignore */ sp);
    const c = document.createElement('canvas'); c.width = 400; c.height = 200; const g = c.getContext('2d')!;
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, 200, 200); g.fillStyle = '#7b1e2b'; g.fillRect(200, 0, 200, 200); // 왼쪽 흰색 · 오른쪽 버건디
    const b = S.buildLightbox({ id: 'x', kind: 'lightbox', text: '', heightMm: 500, widthMm: 1000, depthMm: 100, letterSpacing: 0, lighting: 'front', faceColor: '#ffffff', sideColor: '#555555', textColor: '#000000' }, 'sans-serif', { image: c, sx: 0, sy: 0, sw: 400, sh: 200 });
    let glow: any = null; b.group.traverse((o: any) => { if (o.userData?.part === 'glow') glow = o; });
    const img = glow.material.map.image as HTMLCanvasElement; const x = img.getContext('2d')!;
    const at = (fx: number) => [...x.getImageData(Math.round(img.width * fx), Math.round(img.height * 0.5), 1, 1).data];
    return { white: at(0.17), burgundy: at(0.83) }; // 앞면 왼쪽·오른쪽 바깥 둘레
  });
  const lum = (p: number[]) => (p[0] + p[1] + p[2]) * (p[3] / 255);
  expect(lum(r.white)).toBeGreaterThan(lum(r.burgundy) * 2); // 흰 곳이 훨씬 밝게
  expect(r.burgundy[0]).toBeGreaterThan(r.burgundy[1] + 30); // 버건디는 버건디 빛(빨강이 초록보다)
  expect(r.white[0] - r.white[2]).toBeLessThan(25); // 흰 곳은 흰 빛
});
