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

// 2026-11-09 사용자: "핀볼 측면간판 그림자가 밀렸는데 어떤 이유인지 확인해 주고 디자인에서 가져온 위치값이 유지 되야한다" —
// 장면은 박스 방향으로 두께를 기울이는데(orientBox) AO 는 기울임 없이 구워, 떠 있는 글자의 그림자가 글자와 어긋났다
test('박스 방향(기울임)이 있으면 그 기울임으로 굽는다 — 그림자 중심이 글자가 기운 쪽으로 옮겨 가고, 저장 키도 따로', async ({ page, request }) => {
  test.setTimeout(120_000);
  await openOwnedProject(page, request);
  const r = await page.evaluate(async () => {
    const load = (p: string): Promise<any> => import(/* @vite-ignore */ p); // eslint-disable-line @typescript-eslint/no-explicit-any
    const S = await load('/src/lib/sim/signs.ts'), A = await load('/src/lib/render/aoBake.ts'), T = await load('/src/lib/core/textShapes.ts');
    const font = await T.loadFont((await load('/node_modules/pretendard/dist/public/static/Pretendard-Bold.otf?url')).default);
    const spec = { id: 'ao2', kind: 'lightbox', text: '', heightMm: 600, widthMm: 2000, depthMm: 100, letterSpacing: 0, lighting: 'none', faceColor: '#ffffff', sideColor: '#555555', textColor: '#000000',
      letterItems: [{ text: 'I', x: 0, y: 0, z: 150, heightMm: 400, depthMm: 80, lighting: 'halo', faceColor: '#ffcc00', sideColor: '#ffcc00', letterSpacing: 0 }] }; // 판에서 150mm 떠 있는 글자
    const centroidX = async (box?: unknown) => {
      const b = S.buildSign(spec, font, 'sans-serif'); S.recessBox(b.group, spec.depthMm);
      await A.attachAO(b.group, spec, { bake: true, box });
      let face: any = null; b.group.traverse((o: any) => { if (o.userData?.part === 'ao' && Math.abs(o.position.z - 0.3) < 0.01) face = o; });
      const img = face.material.map.image as HTMLCanvasElement; const d = img.getContext('2d')!.getImageData(0, 0, img.width, img.height).data;
      let sx = 0, sw = 0; for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) { const w = 255 - d[(y * img.width + x) * 4]; sx += x * w; sw += w; }
      return sx / sw / img.width; // 0~1
    };
    return { flat: await centroidX(), tilted: await centroidX({ dir: [0.5, 0, 0.85], flip: false }) };
  });
  expect(r.flat).toBeCloseTo(0.5, 1); // 기울임 없으면 가운데
  expect(r.tilted - r.flat).toBeGreaterThan(0.01); // 오른쪽으로 기울면 그림자도 오른쪽
});

// 2026-11-09 사용자: "핀볼 측면간판 그림자가 밀렸는데 어떤 이유인지 확인해 주고 디자인에서 가져온 위치값이 유지 되야한다"
// — 원인: ProgressiveLightMap 의 누적 평균(blendWindow)은 나중 빛일수록 무겁다. 하늘 방향은 꼭대기 → 지평선 차례라 낮게 비스듬한 빛에 쏠려 그림자가 한쪽으로 밀렸다
test('그림자는 글자 바로 밑 — 한쪽에 놓인 글자의 AO 중심이 그 글자 자리(가로·세로)', async ({ page, request }) => {
  test.setTimeout(120_000);
  await openOwnedProject(page, request);
  const r = await page.evaluate(async () => {
    const load = (p: string): Promise<any> => import(/* @vite-ignore */ p); // eslint-disable-line @typescript-eslint/no-explicit-any
    const S = await load('/src/lib/sim/signs.ts'), A = await load('/src/lib/render/aoBake.ts'), T = await load('/src/lib/core/textShapes.ts');
    const font = await T.loadFont((await load('/node_modules/pretendard/dist/public/static/Pretendard-Bold.otf?url')).default);
    const spec = { id: 'ao3', kind: 'lightbox', text: '', heightMm: 600, widthMm: 6000, depthMm: 120, letterSpacing: 0, lighting: 'none', faceColor: '#ffffff', sideColor: '#555555', textColor: '#000000',
      letterItems: [{ text: 'ㅁ', x: 1800, y: 100, z: 0, heightMm: 400, depthMm: 60, lighting: 'front', faceColor: '#ffcc00', sideColor: '#ffcc00', letterSpacing: 0 }] };
    const b = S.buildSign(spec, font, 'sans-serif'); S.recessBox(b.group, spec.depthMm);
    // 글자 입체의 실제 자리(앞면 위로 올라선 것)
    const lb = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity }; b.group.updateMatrixWorld(true);
    b.group.traverse((o: any) => { if (!o.isMesh) return; o.geometry.computeBoundingBox(); const bb = o.geometry.boundingBox, e = o.matrixWorld.elements; if (bb.min.z + e[14] < -1 || bb.max.z + e[14] <= 1) return; // 상자(앞면 z=0 뒤)는 빼고 앞면 위 글자만
      lb.minX = Math.min(lb.minX, bb.min.x + e[12]); lb.maxX = Math.max(lb.maxX, bb.max.x + e[12]); lb.minY = Math.min(lb.minY, bb.min.y + e[13]); lb.maxY = Math.max(lb.maxY, bb.max.y + e[13]); });
    await A.attachAO(b.group, spec, { bake: true });
    let face: any = null; b.group.traverse((o: any) => { if (o.userData?.part === 'ao' && Math.abs(o.position.z - 0.3) < 0.01) face = o; });
    const img = face.material.map.image as HTMLCanvasElement; const d = img.getContext('2d')!.getImageData(0, 0, img.width, img.height).data;
    // 테두리(상자 테의 그림자)는 빼고 진한 곳만
    let sx = 0, sy = 0, sw = 0; const m = Math.round(img.width * 0.02);
    for (let y = m; y < img.height - m; y++) for (let x = m; x < img.width - m; x++) { const w = Math.max(0, 150 - d[(y * img.width + x) * 4]); sx += x * w; sy += y * w; sw += w; }
    return { x: sx / sw / img.width, y: sy / sw / img.height, lx: ((lb.minX + lb.maxX) / 2 + 3000) / 6000, ly: (300 - (lb.minY + lb.maxY) / 2) / 600 };
  });
  console.log('AOC', JSON.stringify(r));
  expect(Math.abs(r.lx - (3000 + 1800) / 6000)).toBeLessThan(0.02); // 글자는 디자인의 x 자리
  expect(Math.abs(r.x - r.lx)).toBeLessThan(0.01); // 그림자 = 글자 자리 (가로·세로)
  expect(Math.abs(r.y - r.ly)).toBeLessThan(0.02);
});

// 같은 일의 진짜 원인 — AO 판이 꼭짓점 4개(삼각형 2개)라 사다리꼴(원근) 자리에 맞추면 안쪽이 원근이 아니라 직선 보간으로 늘어나, 글자(꼭짓점 많음)와 어긋났다.
// 판을 잘게 나눠 안쪽 점도 원근 변환(호모그래피)을 따르게 한다
test('AO 판은 원근(사다리꼴)에 맞춰도 안쪽 자리가 글자와 같은 변환을 따른다', async ({ page, request }) => {
  test.setTimeout(120_000);
  await openOwnedProject(page, request);
  const err = await page.evaluate(async () => {
    const load = (p: string): Promise<any> => import(/* @vite-ignore */ p); // eslint-disable-line @typescript-eslint/no-explicit-any
    const S = await load('/src/lib/sim/signs.ts'), A = await load('/src/lib/render/aoBake.ts'), T = await load('/src/lib/core/textShapes.ts'), Hm = await load('/src/lib/core/homography.ts');
    const font = await T.loadFont((await load('/node_modules/pretendard/dist/public/static/Pretendard-Bold.otf?url')).default);
    const W = 6000, Hh = 600;
    const spec = { id: 'ao4', kind: 'lightbox', text: '', heightMm: Hh, widthMm: W, depthMm: 120, letterSpacing: 0, lighting: 'none', faceColor: '#ffffff', sideColor: '#555555', textColor: '#000000',
      letterItems: [{ text: 'ㅁ', x: 0, y: 0, z: 0, heightMm: 400, depthMm: 60, lighting: 'front', faceColor: '#ffcc00', sideColor: '#ffcc00', letterSpacing: 0 }] };
    const b = S.buildSign(spec, font, 'sans-serif'); S.recessBox(b.group, spec.depthMm);
    await A.attachAO(b.group, spec, { bake: true });
    const corners: [number, number][] = [[-450, 3970], [5650, 4040], [5675, 3410], [-445, 3385]]; // 핀볼 측면간판 (왼쪽 높이 583, 오른쪽 628)
    S.warpToQuad(b.group, W, Hh, corners);
    const H = Hm.solveHomography([[-W / 2, Hh / 2], [W / 2, Hh / 2], [W / 2, -Hh / 2], [-W / 2, -Hh / 2]], corners);
    let face: any = null; b.group.traverse((o: any) => { if (o.userData?.part === 'ao' && Math.abs(o.position.z - 0.3) < 0.01) face = o; });
    const g = face.geometry, pos = g.attributes.position, uv = g.attributes.uv, idx = g.index.array;
    // 판의 uv (u,v) 자리가 실제로 그려지는 곳(삼각형 안 보간) vs 같은 자기 좌표 점의 원근 변환
    let worst = 0;
    for (const [u, v] of [[0.25, 0.5], [0.5, 0.5], [0.75, 0.3], [0.6, 0.8]]) {
      for (let t = 0; t < idx.length; t += 3) {
        const [i0, i1, i2] = [idx[t], idx[t + 1], idx[t + 2]];
        const ax = uv.getX(i0), ay = uv.getY(i0), bx = uv.getX(i1), by = uv.getY(i1), cx = uv.getX(i2), cy = uv.getY(i2);
        const den = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
        const l0 = ((by - cy) * (u - cx) + (cx - bx) * (v - cy)) / den, l1 = ((cy - ay) * (u - cx) + (ax - cx) * (v - cy)) / den, l2 = 1 - l0 - l1;
        if (l0 < -1e-9 || l1 < -1e-9 || l2 < -1e-9) continue;
        const px = l0 * pos.getX(i0) + l1 * pos.getX(i1) + l2 * pos.getX(i2), py = l0 * pos.getY(i0) + l1 * pos.getY(i1) + l2 * pos.getY(i2);
        const [ex, ey] = Hm.applyHomography(H, [(u - 0.5) * W, (v - 0.5) * Hh]);
        worst = Math.max(worst, Math.hypot(px - ex, py - ey));
        break;
      }
    }
    return worst;
  });
  expect(err).toBeLessThan(5); // mm (꼭짓점 4개일 때 수십 mm)
});

// 2026-11-10 사용자: "구운 그림자를 활용해야하는데 모바일에서는 굽지않고(기기확인) 데스크탑 앱에서만 굽게하고 디지자인과 구성(체널과 프레임의 위치만 재질은 상관없음))이 변하지 않으면 계속 사용하게"
test('색·재질만 바꾸면 구운 AO 를 그대로 쓰고, 글자 자리를 옮기면 새로 굽는다 — 구운 것은 프로젝트에 올라가 굽지 않는 기기가 받아 쓴다', async ({ page, request, browser }) => {
  test.setTimeout(180_000);
  await openOwnedProject(page, request);
  const r = await page.evaluate(async () => {
    const load = (p: string): Promise<any> => import(/* @vite-ignore */ p); // eslint-disable-line @typescript-eslint/no-explicit-any
    const S = await load('/src/lib/sim/signs.ts'), A = await load('/src/lib/render/aoBake.ts'), T = await load('/src/lib/core/textShapes.ts'), St = await load('/src/lib/aoStore.ts'), As = await load('/src/lib/assets.ts');
    const font = await T.loadFont((await load('/node_modules/pretendard/dist/public/static/Pretendard-Bold.otf?url')).default);
    const shared = new Map<string, string>();
    St.setAoStore({ get: (k: string) => shared.get(k), set: (k: string, id: string) => shared.set(k, id) });
    const base = { id: 'ao5', kind: 'lightbox', text: '', heightMm: 600, widthMm: 2400, depthMm: 100, letterSpacing: 0, lighting: 'none', faceColor: '#ffffff', sideColor: '#555555', textColor: '#000000' };
    const item = { text: '가', x: 0, y: 0, z: 0, heightMm: 400, depthMm: 60, lighting: 'front', faceColor: '#ffcc00', sideColor: '#ffcc00', letterSpacing: 0 };
    const planes = async (spec: any, bake: boolean) => {
      const b = S.buildSign(spec, font, 'sans-serif'); S.recessBox(b.group, spec.depthMm);
      await A.attachAO(b.group, spec, { bake });
      let n = 0; b.group.traverse((o: any) => { if (o.userData?.part === 'ao') n++; }); return n;
    };
    const first = await planes({ ...base, letterItems: [item] }, true);
    const recolored = await planes({ ...base, faceColor: '#123456', sideColor: '#ff0000', letterItems: [{ ...item, faceColor: '#00ff00', sideColor: '#0000ff', finish: 'mirror' }] }, false); // 굽지 않아도 있다
    const moved = await planes({ ...base, letterItems: [{ ...item, x: 600 }] }, false); // 자리가 바뀌면 저장된 것이 없다
    const out: Record<string, string> = {};
    for (const [k, id] of shared) {
      const url = await As.assetUrl(id);
      const blob = await (await fetch(url)).blob();
      out[k] = await new Promise<string>((ok) => { const fr = new FileReader(); fr.onload = () => ok(fr.result as string); fr.readAsDataURL(blob); });
    }
    return { first, recolored, moved, shared: out };
  });
  expect(r.first).toBe(2); // 앞면 + 벽
  expect(r.recolored).toBe(2);
  expect(r.moved).toBe(0);
  expect(Object.keys(r.shared)).toHaveLength(2); // 프로젝트에 올라감

  // 다른 기기(굽지 않음): 프로젝트에 올라온 에셋만으로 AO 가 붙는다
  const ctx = await browser.newContext();
  const phone = await ctx.newPage();
  await openOwnedProject(phone, request);
  const n = await phone.evaluate(async (shared) => {
    const load = (p: string): Promise<any> => import(/* @vite-ignore */ p); // eslint-disable-line @typescript-eslint/no-explicit-any
    const S = await load('/src/lib/sim/signs.ts'), A = await load('/src/lib/render/aoBake.ts'), T = await load('/src/lib/core/textShapes.ts'), St = await load('/src/lib/aoStore.ts'), As = await load('/src/lib/assets.ts');
    const font = await T.loadFont((await load('/node_modules/pretendard/dist/public/static/Pretendard-Bold.otf?url')).default);
    const map = new Map<string, string>();
    for (const [k, data] of Object.entries(shared)) map.set(k, await As.putAsset(await (await fetch(data)).blob())); // 동기화로 받은 에셋 대신
    St.setAoStore({ get: (k: string) => map.get(k), set: () => { throw new Error('굽지 않는 기기는 올리지 않는다'); } });
    const spec = { id: 'ao5', kind: 'lightbox', text: '', heightMm: 600, widthMm: 2400, depthMm: 100, letterSpacing: 0, lighting: 'none', faceColor: '#ffffff', sideColor: '#555555', textColor: '#000000',
      letterItems: [{ text: '가', x: 0, y: 0, z: 0, heightMm: 400, depthMm: 60, lighting: 'front', faceColor: '#ffcc00', sideColor: '#ffcc00', letterSpacing: 0 }] };
    const planes = async () => {
      const b = S.buildSign(spec, font, 'sans-serif'); S.recessBox(b.group, spec.depthMm);
      await A.attachAO(b.group, spec, { bake: false });
      let n = 0; b.group.traverse((o: any) => { if (o.userData?.part === 'ao') n++; }); return n;
    };
    let loaded = 0; St.onAoLoaded(() => loaded++);
    const before = await planes(); // 받기는 뒤에서 — 3D 를 기다리게 하지 않는다
    for (let t = 0; t < 100 && !loaded; t++) await new Promise((ok) => setTimeout(ok, 100));
    return { before, loaded, after: await planes() }; // 받았다고 알린 뒤 다시 지으면 붙는다
  }, r.shared);
  expect(n.before).toBe(0);
  expect(n.loaded).toBeGreaterThan(0);
  expect(n.after).toBe(2);
  await ctx.close();
});

// 2026-11-10 사용자: "모바일은 ao만 베이크되어야하는데 3d도 베이크된다" → "확대시 3d가 깍두기 생긴다" — 프로젝트에 적혔지만 아직 서버에 없는(올리는 중) AO 를
// 받으려고 실시간 3D 짓기가 재시도(수십 초)를 기다려, 그동안 저장된 3D 그림만 늘어나 깍두기. AO 받기는 3D 를 붙잡지 않는다 — 받으면 알리고 다음에 쓴다
test('굽지 않는 기기: 프로젝트의 AO 에셋이 아직 없어도 3D 짓기를 기다리게 하지 않는다', async ({ page, request }) => {
  test.setTimeout(120_000);
  await openOwnedProject(page, request);
  const ms = await page.evaluate(async () => {
    const load = (p: string): Promise<any> => import(/* @vite-ignore */ p); // eslint-disable-line @typescript-eslint/no-explicit-any
    const S = await load('/src/lib/sim/signs.ts'), A = await load('/src/lib/render/aoBake.ts'), T = await load('/src/lib/core/textShapes.ts'), St = await load('/src/lib/aoStore.ts');
    const font = await T.loadFont((await load('/node_modules/pretendard/dist/public/static/Pretendard-Bold.otf?url')).default);
    St.setAoStore({ get: () => '0123456789abcdef0123456789abcdef', set: () => undefined }); // 서버에 없는 에셋
    const spec = { id: 'ao6', kind: 'lightbox', text: '', heightMm: 600, widthMm: 2400, depthMm: 100, letterSpacing: 0, lighting: 'none', faceColor: '#ffffff', sideColor: '#555555', textColor: '#000000',
      letterItems: [{ text: '나', x: 0, y: 0, z: 0, heightMm: 400, depthMm: 60, lighting: 'front', faceColor: '#ffcc00', sideColor: '#ffcc00', letterSpacing: 0 }] };
    const b = S.buildSign(spec, font, 'sans-serif'); S.recessBox(b.group, spec.depthMm);
    const t0 = performance.now();
    await A.attachAO(b.group, spec, { bake: false });
    return performance.now() - t0;
  });
  expect(ms).toBeLessThan(500);
});

// 2026-11-11 핀볼 확인: 측면간판(6.1m)의 스카시 전화번호(글자 높이 약 63mm · 두께 3mm)는 AO 가 거의 흰색(252) — 192px 한 장을 6.1m 에 늘려 1픽셀 ≈ 33mm,
// 그림자 맵 편향(약 7mm)이 3mm 두께보다 커 그림자가 생기지 않았다 → "진행해줘": 긴 변 1픽셀 ≈ 5mm(최대 1024)로, 그림자 맵·편향도 그에 맞춰
test('가로로 긴 간판의 얇은 스카시(3mm)도 AO 접촉 그림자가 보인다', async ({ page, request }) => {
  test.setTimeout(120_000);
  await openOwnedProject(page, request);
  const r = await page.evaluate(async () => {
    const load = (p: string): Promise<any> => import(/* @vite-ignore */ p); // eslint-disable-line @typescript-eslint/no-explicit-any
    const S = await load('/src/lib/sim/signs.ts'), A = await load('/src/lib/render/aoBake.ts'), T = await load('/src/lib/core/textShapes.ts');
    const font = await T.loadFont((await load('/node_modules/pretendard/dist/public/static/Pretendard-Bold.otf?url')).default);
    const W = 6100, H = 600;
    const spec = { id: 'ao7', kind: 'lightbox', text: '', heightMm: H, widthMm: W, depthMm: 120, letterSpacing: 0, lighting: 'none', faceColor: '#ffffff', sideColor: '#555555', textColor: '#000000',
      letterItems: [{ text: '010-8132-8553', x: 1900, y: -215, z: 0, heightMm: 63, widthMm: 780, depthMm: 3, lighting: 'none', faceColor: '#333333', sideColor: '#333333', letterSpacing: 0 }] };
    const b = S.buildSign(spec, font, 'sans-serif'); S.recessBox(b.group, spec.depthMm);
    const t0 = performance.now();
    await A.attachAO(b.group, spec, { bake: true });
    const ms = performance.now() - t0;
    let face: any = null; b.group.traverse((o: any) => { if (o.userData?.part === 'ao' && Math.abs(o.position.z - 0.3) < 0.01) face = o; });
    const img = face.material.map.image as HTMLCanvasElement; const d = img.getContext('2d')!.getImageData(0, 0, img.width, img.height).data;
    // 전화번호 자리(가로 1510~2290, 세로 -247~-183 mm)의 가장 어두운 값
    const px = (mm: number) => Math.round(((mm + W / 2) / W) * img.width), py = (mm: number) => Math.round(((H / 2 - mm) / H) * img.height);
    let min = 255; for (let y = py(-183); y <= py(-247); y++) for (let x = px(1510); x <= px(2290); x++) min = Math.min(min, d[(y * img.width + x) * 4]);
    // 먼 곳(왼쪽 위 빈 판)은 흰색 그대로 (그림자 여드름 없음)
    let far = 255; for (let y = py(200); y <= py(100); y++) for (let x = px(-2800); x <= px(-1500); x++) far = Math.min(far, d[(y * img.width + x) * 4]);
    return { min, far, w: img.width, ms };
  });
  console.log('AO7', JSON.stringify(r));
  expect(r.min).toBeLessThan(235); // 얇은 글자 둘레도 어둡다
  expect(r.far).toBeGreaterThan(240);
});
