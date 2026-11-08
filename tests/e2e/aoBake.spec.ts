// 사인물 AO 굽기 (2026-11-09 사용자: "디자인 파일이 들어오면 occ를 구워서 계속 사용 가능하지 않을까?" → "1번 ProgressiveLightMap으로 진행해")
import { expect, test } from '@playwright/test';
import { openOwnedProject } from './helpers';

test('상자 위 입체 글자: 굽고 나면 앞면·벽에 AO 판 — 글자 옆은 어둡고 먼 곳은 흰색, 두 번째는 저장된 것을 쓴다(굽지 않음)', async ({ page, request }) => {
  test.setTimeout(120_000);
  await openOwnedProject(page, request);
  const r = await page.evaluate(async () => {
    const load = (p: string): Promise<any> => import(/* @vite-ignore */ p); // eslint-disable-line @typescript-eslint/no-explicit-any
    const S = await load('/src/lib/sim/signs.ts'), A = await load('/src/lib/render/aoBake.ts'), T = await load('/src/lib/core/textShapes.ts');
    const url = (await load('/node_modules/pretendard/dist/public/static/Pretendard-Bold.otf?url')).default;
    const font = await T.loadFont(url);
    const spec = { id: 'ao', kind: 'lightbox', text: '', heightMm: 600, widthMm: 2000, depthMm: 100, letterSpacing: 0, lighting: 'none', faceColor: '#ffffff', sideColor: '#555555', textColor: '#000000',
      letters: { text: '간판', heightMm: 400, depthMm: 80, lighting: 'front', faceColor: '#ff0000', sideColor: '#ff0000', letterSpacing: 0 } };
    const build = async () => { const b = S.buildSign(spec, font, 'sans-serif'); S.recessBox(b.group, spec.depthMm); const t0 = performance.now(); await A.attachAO(b.group, spec, { bake: true }); return { b, ms: performance.now() - t0 }; };
    const first = await build();
    const planes: any[] = []; first.b.group.traverse((o: any) => { if (o.userData?.part === 'ao') planes.push(o); });
    const face = planes.find((p) => Math.abs(p.position.z - 0.3) < 0.01);
    const img = face.material.map.image as HTMLCanvasElement; const x = img.getContext('2d')!;
    const px = (fx: number, fy: number) => x.getImageData(Math.round((img.width - 1) * fx), Math.round((img.height - 1) * fy), 1, 1).data[0];
    let darkest = 255; const d = x.getImageData(0, 0, img.width, img.height).data; for (let i = 0; i < d.length; i += 4) darkest = Math.min(darkest, d[i]);
    const second = await build();
    let again = 0; second.b.group.traverse((o: any) => { if (o.userData?.part === 'ao') again++; });
    return { planes: planes.length, darkest, corner: px(0.02, 0.02), firstMs: first.ms, secondMs: second.ms, again };
  });
  expect(r.planes).toBe(2); // 앞면 + 벽
  expect(r.darkest).toBeLessThan(200); // 글자 옆 접촉 그림자
  expect(r.corner).toBeGreaterThan(235); // 글자에서 먼 모서리는 거의 흰색
  expect(r.again).toBe(2);
  expect(r.secondMs).toBeLessThan(r.firstMs / 3); // 저장된 것 — 다시 굽지 않는다
});
