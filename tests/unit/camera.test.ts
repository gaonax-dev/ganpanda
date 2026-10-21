import { describe, expect, it } from 'vitest';
import { calibrationOf, proposeAxisLines, snapSetup, solveCamera, type CameraSetup, type Line } from '../../src/lib/core/camera';
import { pointsTo, type Segment } from '../../src/lib/core/lines';
import { measureQuad } from '../../src/lib/core/calibration';
import { applyHomography, projectPoint, type CameraPose, type Pt } from '../../src/lib/core/homography';

// 합성 핀홀 카메라 (homography.test 와 같은 모델). 주점은 (cx, cy)
const imgW = 4000, imgH = 3000, f = 3000;
type V3 = [number, number, number];
function truth(yaw: number, pitch: number, C: number[]): CameraPose {
  const base = [1, 0, 0, 0, -1, 0, 0, 0, -1];
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
  const Ry = [cy, 0, sy, 0, 1, 0, -sy, 0, cy], Rx = [1, 0, 0, 0, cp, -sp, 0, sp, cp];
  const mul = (a: number[], b: number[]) => { const r = new Array(9).fill(0); for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) for (let k = 0; k < 3; k++) r[i * 3 + j] += a[i * 3 + k] * b[k * 3 + j]; return r; };
  const R = mul(Rx, mul(Ry, base));
  const t = [0, 1, 2].map((i) => -(R[i * 3] * C[0] + R[i * 3 + 1] * C[1] + R[i * 3 + 2] * C[2])) as V3;
  return { f, R, t, imgW, imgH };
}
/** 주점이 (cx,cy) 가 아닌 카메라 (크롭 사진): 투영 후 평행 이동 */
const shifted = (p: CameraPose, dx: number, dy: number) => (q: V3): Pt => { const [u, v] = projectPoint(p, q); return [u + dx, v + dy]; };
const P = truth(0.5, -0.2, [3000, 1800, 8000]);
const proj = (q: V3) => projectPoint(P, q);
const seg = (pr: (q: V3) => Pt, a: V3, b: V3): Line => ({ a: pr(a), b: pr(b) });

/** 벽 위 선들: 가로 2개(y=0, y=3000), 세로 2개(x=0, x=6000), 깊이 2개(옆면 벽, x=0 평면에서 z 방향) */
function setupOf(pr: (q: V3) => Pt, withZ = false): CameraSetup {
  return {
    x: [seg(pr, [0, 0, 0], [6000, 0, 0]), seg(pr, [500, 3000, 0], [6500, 3000, 0])],
    y: [seg(pr, [0, 0, 0], [0, 3000, 0]), seg(pr, [6000, 200, 0], [6000, 2800, 0])],
    ...(withZ ? { z: [seg(pr, [0, 0, 0], [0, 0, -3000]), seg(pr, [0, 2500, 0], [0, 2500, -3000])] } : {}),
    origin: pr([0, 0, 0]),
    // 기준 길이 (fSpy 방식) = 원점에서 X 축을 따라 2000mm 떨어진 점
    ref: { axis: 'x', from: pr([1000, 0, 0]), to: pr([3000, 0, 0]), mm: 2000 },
  };
}
const near = (a: number, b: number, tol: number) => expect(Math.abs(a - b) / Math.max(1, Math.abs(b))).toBeLessThan(tol);

describe('카메라 솔버 (축 선 두 쌍 + 원점 + 기준 길이)', () => {
  it('초점거리·회전·위치를 복원해 벽 위 점이 사진의 제자리에 투영된다 (1px 안)', () => {
    const s = solveCamera(setupOf(proj), imgW, imgH)!;
    expect(s).not.toBeNull();
    near(s.f, f, 0.01);
    for (const q of [[0, 0, 0], [6000, 3000, 0], [2500, 1200, 0], [4000, 2000, 300]] as V3[]) {
      const [u, v] = projectPoint(s.pose, q), [tu, tv] = proj(q);
      expect(Math.abs(u - tu)).toBeLessThan(1); expect(Math.abs(v - tv)).toBeLessThan(1);
    }
    expect(s.warnings).toEqual([]);
  });

  it('벽면 호모그래피: 사진 px → 벽 mm 가 원점 기준으로 맞고, 기준 길이로 축척이 정해진다', () => {
    const s = solveCamera(setupOf(proj), imgW, imgH)!;
    const p = applyHomography(s.Hinv, proj([2500, 1200, 0]));
    near(p[0], 2500, 0.01); near(p[1], 1200, 0.01);
    const c = calibrationOf(s);
    const m = measureQuad(c, [proj([600, 2000, 0]), proj([2100, 2000, 0]), proj([2100, 1150, 0]), proj([600, 1150, 0])]);
    near(m.widthMm, 1500, 0.01); near(m.heightMm, 850, 0.01);
  });

  it('기준 길이 축이 높이(Z)·세로(Y)여도 되고, 축에서 벗어난 점은 축 위로 붙여 쓴다. 옛 형식 {line}/{a,b,axis} 도 읽는다', () => {
    const st = setupOf(proj);
    st.ref = { axis: 'z', from: proj([0, 500, 0]), to: proj([0, 2000, 0]), mm: 1500 }; // 합성의 위 방향 = 높이 Z, 원점에서 떨어진 구간
    const s0 = solveCamera(st, imgW, imgH)!;
    const p0 = applyHomography(s0.Hinv, proj([2500, 1200, 0]));
    near(p0[0], 2500, 0.01); near(p0[1], 1200, 0.01);
    const off = proj([0, 1500, 0]); st.ref = { axis: 'z', point: [off[0] + 40, off[1]], mm: 1500 }; // 옛 한 점 형식(원점부터) + 축에서 40px 벗어남 → 축 위로 붙임
    const s1 = solveCamera(st, imgW, imgH)!;
    const p1 = applyHomography(s1.Hinv, proj([2500, 1200, 0]));
    near(p1[0], 2500, 0.02); near(p1[1], 1200, 0.02);
    st.ref = { axis: 'y', from: proj([0, 0, -300]), to: proj([0, 0, -1500]), mm: 1200 }; // 세로(깊이) 축, 뒤집힌 순서도 가능
    const s2 = solveCamera(st, imgW, imgH)!;
    near(s2.cameraPos[2], 8000, 0.01);
    st.ref = { line: 'x0', mm: 6000 };
    const s3 = solveCamera(st, imgW, imgH)!;
    const p3 = applyHomography(s3.Hinv, proj([2500, 1200, 0]));
    near(p3[0], 2500, 0.01); near(p3[1], 1200, 0.01);
    st.ref = { a: proj([1000, 200, 0]), b: proj([1000, 2300, 0]), axis: 'y', mm: 2100 };
    const s = solveCamera(st, imgW, imgH)!;
    const p = applyHomography(s.Hinv, proj([6000, 3000, 0]));
    near(p[0], 6000, 0.01); near(p[1], 3000, 0.01);
  });

  it('크롭 사진: 깊이(Z) 축 선이 있으면 제3 소실점의 수심으로 주점을 찾아 정확해진다', () => {
    const pr = shifted(P, -600, 350);
    const centerOnly = solveCamera(setupOf(pr), imgW, imgH)!;
    const third = solveCamera({ ...setupOf(pr, true), principal: 'third' }, imgW, imgH)!;
    near(third.pp[0], imgW / 2 - 600, 0.01); near(third.pp[1], imgH / 2 + 350, 0.01);
    near(third.f, f, 0.01);
    const q: V3 = [6000, 3000, 0];
    const [u, v] = projectPoint(third.pose, q), [tu, tv] = pr(q);
    expect(Math.hypot(u - tu, v - tv)).toBeLessThan(1);
    const [cu, cv] = projectPoint(centerOnly.pose, q);
    expect(Math.hypot(cu - tu, cv - tv)).toBeGreaterThan(5); // 중앙 가정은 어긋난다
  });

  it('정면 사진(소실점이 무한원점)은 기본 초점거리로 대신하고 안내한다', () => {
    const F = truth(0, 0, [3000, 1500, 10000]);
    const s = solveCamera(setupOf((q) => projectPoint(F, q)), imgW, imgH)!;
    expect(s).not.toBeNull();
    expect(s.warnings.some((w) => w.includes('초점'))).toBe(true);
    // 정면이면 평면 위 치수는 초점거리와 무관하게 맞는다
    const p = applyHomography(s.Hinv, projectPoint(F, [2500, 1200, 0]));
    near(p[0], 2500, 0.01); near(p[1], 1200, 0.01);
  });

  it('축 선 쌍이 거의 평행하거나 기준 길이가 없으면 경고', () => {
    const st = setupOf(proj);
    st.x = [st.x[0], { a: [st.x[0].a[0], st.x[0].a[1] + 1], b: [st.x[0].b[0], st.x[0].b[1] + 1] }];
    const s = solveCamera({ ...st, ref: undefined }, imgW, imgH)!;
    expect(s.warnings.some((w) => w.includes('평행'))).toBe(true);
    expect(s.warnings.some((w) => w.includes('기준 길이'))).toBe(true);
  });
});

// ---------- 자동 제안 (AI): 합성 회색조 사진에서 가로·세로 선 후보 ----------
/** 작은 합성 사진: 벽(밝음) 안에 어두운 띠와 창 두 개 — 모두 벽 평면 위 직사각형 */
function raster(pr: (q: V3) => Pt, w: number, h: number) {
  const data = new Uint8ClampedArray(w * h).fill(90); // 하늘·바닥 어두움
  const inside = (pt: Pt, poly: Pt[]) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i], [xj, yj] = poly[j]; if (yi > pt[1] !== yj > pt[1] && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) c = !c; } return c; };
  const rect = (x: number, y: number, rw: number, rh: number): Pt[] => [pr([x, y, 0]), pr([x + rw, y, 0]), pr([x + rw, y + rh, 0]), pr([x, y + rh, 0])];
  const shapes: [Pt[], number][] = [[rect(0, 0, 6000, 3000), 210], [rect(0, 2000, 6000, 600), 60], [rect(500, 400, 1200, 1000), 40], [rect(4300, 400, 1200, 1000), 40]];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) for (const [poly, v] of shapes) if (inside([x + 0.5, y + 0.5], poly)) data[y * w + x] = v;
  return { data, width: w, height: h };
}

describe('축 선 자동 제안', () => {
  const W = 400, H = 300;
  const S = truth(0.4, -0.15, [3000, 1500, 9000]);
  const small = (q: V3): Pt => { const [u, v] = projectPoint(S, q); return [(u * W) / imgW, (v * H) / imgH]; };
  const img = raster(small, W, H);

  it('가로 선 2개는 가로 소실점을, 세로 선 2개는 세로 소실점을 향하고(1.5°) 서로 떨어져 있다', () => {
    const p = proposeAxisLines(img)!;
    expect(p).not.toBeNull();
    const l3 = (a: Pt, b: Pt): V3 => [a[1] - b[1], b[0] - a[0], a[0] * b[1] - a[1] * b[0]];
    const x3 = (u: V3, v: V3): V3 => [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const vxT = x3(l3(small([0, 2000, 0]), small([6000, 2000, 0])), l3(small([0, 0, 0]), small([6000, 0, 0])));
    const vyT = x3(l3(small([500, 400, 0]), small([500, 1400, 0])), l3(small([5500, 400, 0]), small([5500, 1400, 0])));
    const seg = (s: Line): Segment => ({ a: s.a, b: s.b, length: Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]), strength: 1 });
    for (const l of p.x) expect(pointsTo(seg(l), vxT, 1.5 * Math.PI / 180)).toBe(true);
    for (const l of p.y) expect(pointsTo(seg(l), vyT, 1.5 * Math.PI / 180)).toBe(true);
    const midY = (l: Line) => (l.a[1] + l.b[1]) / 2, midX = (l: Line) => (l.a[0] + l.b[0]) / 2;
    expect(Math.abs(midY(p.x[0]) - midY(p.x[1]))).toBeGreaterThan(H * 0.15);
    expect(Math.abs(midX(p.y[0]) - midX(p.y[1]))).toBeGreaterThan(W * 0.15);
    // 제안된 선으로 카메라를 풀면 초점거리가 10% 안
    const s = solveCamera({ ...p, origin: small([0, 0, 0]), ref: { a: small([500, 400, 0]), b: small([1700, 400, 0]), axis: 'x', mm: 1200 } }, W, H)!;
    near(s.f, (f * W) / imgW, 0.1);
  });

  it('끝점을 사진 모서리에 붙인다 (3px 어긋난 선 → 1px 안)', () => {
    const off: CameraSetup = { x: [{ a: [small([0, 2000, 0])[0], small([0, 2000, 0])[1] + 3], b: [small([6000, 2000, 0])[0], small([6000, 2000, 0])[1] + 3] }, { a: small([0, 2600, 0]), b: small([6000, 2600, 0]) }], y: [{ a: small([500, 400, 0]), b: small([500, 1400, 0]) }, { a: small([5500, 400, 0]), b: small([5500, 1400, 0]) }], origin: small([0, 0, 0]) };
    const snapped = snapSetup(img, off);
    const trueY = (small([0, 2000, 0])[1] + small([6000, 2000, 0])[1]) / 2;
    expect(Math.abs((snapped.x[0].a[1] + snapped.x[0].b[1]) / 2 - trueY)).toBeLessThan(1.5);
  });
});

// ---------- fSpy 식: 축 선택·리버스, 원점 이동 시 카메라 위치·화각 ----------
describe('축 선택·리버스와 카메라 위치·화각', () => {
  it('카메라 위치(벽 좌표 m)와 화각을 돌려준다 — 합성 카메라와 1% 안', () => {
    const s = solveCamera(setupOf(proj), imgW, imgH)!;
    near(s.cameraPos[0], 3000, 0.01); near(s.cameraPos[1], 1800, 0.01); near(s.cameraPos[2], 8000, 0.01);
    near(s.fov.h, (2 * Math.atan(imgW / 2 / f) * 180) / Math.PI, 0.01);
    near(s.fov.v, (2 * Math.atan(imgH / 2 / f) * 180) / Math.PI, 0.01);
  });
  it('원점을 옮기면 카메라 위치가 그만큼 반대로 움직인다 (화각은 그대로)', () => {
    const a = solveCamera(setupOf(proj), imgW, imgH)!;
    const st = setupOf(proj); st.origin = proj([2000, 1000, 0]);
    st.ref = { axis: 'x', from: proj([3000, 1000, 0]), to: proj([5000, 1000, 0]), mm: 2000 }; // 핸들은 새 원점의 축 위에
    const b = solveCamera(st, imgW, imgH)!;
    near(b.cameraPos[0], 1000, 0.02); near(b.cameraPos[1], 800, 0.02); near(b.cameraPos[2], 8000, 0.02);
    near(b.fov.h, a.fov.h, 0.001);
  });
  it('선 쌍 축 지정: 첫 쌍을 +Y, 둘째 쌍을 +X 로 바꿔 넣어도 같은 카메라', () => {
    const st = setupOf(proj);
    // 쌍을 바꿨으니 기준 길이도 같은 선(원래 둘째 쌍 선 2 = 이제 첫 쌍 선 2)으로
    const swapped: CameraSetup = { ...st, x: st.y, y: st.x, axes: { first: '+z', second: '+x' } };
    const s = solveCamera(swapped, imgW, imgH)!;
    const q: V3 = [2500, 1200, 300];
    const [u, v] = projectPoint(s.pose, q), [tu, tv] = proj(q);
    expect(Math.hypot(u - tu, v - tv)).toBeLessThan(1);
  });
  it('리버스: −X 로 하면 +X 축이 사진에서 왼쪽을 향하고, Z 가 벽 안쪽이 되어 경고', () => {
    const s = solveCamera({ ...setupOf(proj), axes: { first: '-x', second: '+z' } }, imgW, imgH)!;
    const o = projectPoint(s.pose, [0, 0, 0]), px = projectPoint(s.pose, [1000, 0, 0]);
    expect(px[0]).toBeLessThan(o[0]);
    expect(s.warnings.some((w) => w.includes('벽 안쪽'))).toBe(true);
    const ok = solveCamera({ ...setupOf(proj), axes: { first: '+x', second: '+z' } }, imgW, imgH)!;
    expect(ok.warnings.some((w) => w.includes('벽 안쪽'))).toBe(false);
  });
});

describe('세로 Y(깊이) 축 지정 (옆면 벽: 깊이 선 + 높이 선)', () => {
  it('첫 쌍을 ±Y, 둘째 쌍을 +Z 로 두면 옆면 벽(x=0 평면)이 벽면이 되고, 월드 축이 실제와 맞는다', () => {
    const full = setupOf(proj, true);
    // 깊이 선(z 방향)을 첫 쌍으로, 세로 선을 둘째 쌍으로. 기준 길이는 깊이 방향 1m
    // 기준 길이 = 첫 쌍(깊이) 선 1: [0,0,0]→[0,0,−3000] = 3000mm
    const base: CameraSetup = { x: full.z!, y: full.y, origin: proj([0, 0, 0]), ref: { axis: 'y', from: proj([0, 0, -500]), to: proj([0, 0, -3000]), mm: 2500 } };
    const tryDir = (first: '+y' | '-y') => solveCamera({ ...base, axes: { first, second: '+z' } }, imgW, imgH)!;
    // 사진에서 깊이 선의 부호는 모르므로 둘 중 거울상 경고가 없는 쪽이 맞는 것
    const sols = [tryDir('+y'), tryDir('-y')];
    const ok = sols.find((s) => !s.warnings.some((w) => w.includes('거울상')))!;
    expect(ok).toBeDefined();
    // 합성 카메라의 열: 0 = 가로, 1 = 위(높이), 2 = 벽 밖(깊이). 월드 세로 Y 는 깊이 선의 정준 방향(±), 높이 Z 는 위
    const Rt = P.R;
    const depthTruth: V3 = [Rt[2], Rt[5], Rt[8]], upTruth: V3 = [Rt[1], Rt[4], Rt[7]];
    const col = (R: number[], i: number): V3 => [R[i], R[3 + i], R[6 + i]];
    const dotv = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const dz = dotv(col(ok.worldR, 1), depthTruth); // 월드 Y(세로) 열
    expect(Math.abs(dz)).toBeGreaterThan(0.999);
    expect(dotv(col(ok.worldR, 2), upTruth)).toBeGreaterThan(0.999); // 월드 Z(높이) 열
    // 벽면(u = 깊이, v = 세로) 위 점 (u=1000, v=500) = 월드 (0, 500, ±1000) 가 제자리에 투영
    const uSign = (ok.axesUsed.first === '+y' ? 1 : -1) * Math.sign(dz);
    const [u, v] = applyHomography(ok.H, [1000, 500]);
    const [tu, tv] = proj([0, 500, 1000 * uSign]);
    expect(Math.hypot(u - tu, v - tv)).toBeLessThan(1);
    expect(ok.wallAxes).toEqual([ok.axesUsed.first, '+z']);
    // 월드 포즈로는 실제 월드 점이 제자리에: 월드 (x, y세로, z높이) = 합성 (x, 높이, 깊이·부호)
    const q: V3 = [0, 1200, 800 * Math.sign(dz)];
    const [wu, wv] = projectPoint(ok.worldPose, [0, 800, 1200]), [tq, tr] = proj(q);
    expect(Math.hypot(wu - tq, wv - tr)).toBeLessThan(1);
  });
  it('같은 축을 두 번 지정하면 경고하고 기본(X,Y)으로 푼다', () => {
    const s = solveCamera({ ...setupOf(proj), axes: { first: '+x', second: '-x' } }, imgW, imgH)!;
    expect(s.warnings.some((w) => w.includes('같은 축'))).toBe(true);
    const q: V3 = [2500, 1200, 0];
    const [u, v] = projectPoint(s.pose, q), [tu, tv] = proj(q);
    expect(Math.hypot(u - tu, v - tv)).toBeLessThan(1);
  });
});

// 2026-10-19 사용자: "이전에 잘 맞던 사인물 어긋나면 나오는 교정 버튼이 현재 다른 각도를 보인다. 원근과 사인물에서 축이 다르게 연결되었는지"
// — 원근을 X·Y(가로 + 바닥 깊이 선)로 잡으면 풀이의 평면이 바닥이 되어, 벽을 가정하는 사인물(면 판정·교정 버튼)이 바닥 기준으로 각도를 쟀다.
// 두 쌍에 Z(높이)가 없으면 사인물 기준 평면은 X·Z 수직 벽 (X·Y 수평, Z 수직)
describe('X·Y 로 잡아도 사인물 기준 평면은 X·Z 수직 벽', () => {
  // 바닥(높이 0) 위 깊이 선: 벽 앞으로 나오는 방향(합성 좌표 z)
  const xy = (dir: '+y' | '-y'): CameraSetup => ({
    x: setupOf(proj).x,
    y: [seg(proj, [0, 0, 0], [0, 0, 3000]), seg(proj, [6000, 0, 0], [6000, 0, 3000])],
    origin: proj([0, 0, 0]),
    ref: { axis: 'x', from: proj([1000, 0, 0]), to: proj([3000, 0, 0]), mm: 2000 },
    axes: { first: '+x', second: dir },
  });
  it('벽 위 점(가로 x, 높이 h)이 제자리에 투영되고, 벽면 축은 [X, +Z]', () => {
    const s = [solveCamera(xy('+y'), imgW, imgH)!, solveCamera(xy('-y'), imgW, imgH)!].find((x) => x && !x.warnings.some((w) => w.includes('거울상') || w.includes('벽 안쪽')))!;
    expect(s).toBeDefined();
    expect(s.wallAxes).toEqual(['+x', '+z']);
    for (const [x, h] of [[0, 0], [6000, 3000], [2500, 1200]] as [number, number][]) {
      const [u, v] = applyHomography(s.H, [x, h]), [tu, tv] = proj([x, h, 0]);
      expect(Math.hypot(u - tu, v - tv)).toBeLessThan(2);
    }
  });
  it('교정 버튼 경로: X·Y 로 잡은 사진에서 벽 위에 반듯이 그린 사인물은 어긋남이 거의 0°', async () => {
    const { wallPlaneOf } = await import('../../src/lib/core/wallPlane');
    const { skewOf } = await import('../../src/lib/core/manipulator');
    const s = [solveCamera(xy('+y'), imgW, imgH)!, solveCamera(xy('-y'), imgW, imgH)!].find((x) => x && !x.warnings.some((w) => w.includes('거울상') || w.includes('벽 안쪽')))!;
    const wall = wallPlaneOf([], calibrationOf(s))!;
    const quad: Pt[] = [[1000, 2500], [5000, 2500], [5000, 1500], [1000, 1500]].map(([x, h]) => proj([x, h, 0]));
    expect(skewOf(wall, quad)).toBeLessThan(1);
  });
});


// 2026-10-19 사용자: "크기를 지정하고 원근에 맞게 그려진 사인물의 코너에 중심점을 주고 사인물 길이를 사용해 표준 길이도 지정 자동으로 매칭"
describe('사인물로 원근 자동 매칭 (signCameraSetup)', async () => {
  const { signCameraSetup } = await import('../../src/lib/core/camera');
  // 벽 위 사인물 2000×600mm, 왼쪽 아래 코너 = 벽 (1500, 2200)
  const quad = ([[1500, 2800], [3500, 2800], [3500, 2200], [1500, 2200]] as [number, number][]).map(([x, h]) => proj([x, h, 0]));
  it('위·아래 변 = 가로 축 선, 좌·우 변 = 높이 축 선, 원점 = 왼쪽 아래 코너, 기준 길이 = 가로 mm', () => {
    const s = signCameraSetup(quad, 2000);
    expect(s.axes).toEqual({ first: '+x', second: '+z' });
    expect(s.origin).toEqual(quad[3]);
    expect(s.ref).toEqual({ axis: 'x', from: quad[3], to: quad[2], mm: 2000 });
  });
  it('풀면 사인물 좌표(왼쪽 아래 = 0,0, mm)의 벽이 사진에 제자리로 투영된다', () => {
    const sol = solveCamera(signCameraSetup(quad, 2000), imgW, imgH)!;
    expect(sol).not.toBeNull();
    for (const [x, h] of [[0, 0], [2000, 600], [1000, 300], [-1500, -2200]] as [number, number][]) {
      const [u, v] = applyHomography(sol.H, [x, h]), [tu, tv] = proj([x + 1500, h + 2200, 0]);
      expect(Math.hypot(u - tu, v - tv)).toBeLessThan(3);
    }
  });
});

describe('자동 원근에 사인물 길이 반영 (signLengthSetup, 2026-10-19)', async () => {
  const { signLengthSetup } = await import('../../src/lib/core/camera');
  // AI 가 잡은 축 선(기준 길이 없음, 원점은 아무 데나) — "사진이 등록되면 바로 원근 자동으로"
  const ai: CameraSetup = { ...setupOf(proj), origin: proj([2500, 1500, 0]), ref: undefined, auto: true };
  // 벽 위 사인물 2000×600mm, 왼쪽 아래 코너 = 벽 (1500, 2200)
  const quad = ([[1500, 2800], [3500, 2800], [3500, 2200], [1500, 2200]] as [number, number][]).map(([x, h]) => proj([x, h, 0]));
  it('원근이 근사치면: 축 선은 그대로, 원점 = 사인물 왼쪽 아래, 기준 길이 = 사인물 가로 → 다른 영역 크기가 맞는다', () => {
    const s = signLengthSetup(ai, quad, 2000, 600, imgW, imgH)!;
    expect(s).not.toBeNull();
    expect(s.x).toEqual(ai.x);
    expect(s.y).toEqual(ai.y);
    expect(s.origin).toEqual(quad[3]);
    expect(s.ref).toEqual({ axis: 'x', from: quad[3], to: quad[2], mm: 2000 });
    expect(s.auto).toBe(true);
    const band = ([[0, 3000], [6000, 3000], [6000, 2000], [0, 2000]] as [number, number][]).map(([x, h]) => proj([x, h, 0]));
    const m = measureQuad(calibrationOf(solveCamera(s, imgW, imgH)!), band);
    near(m.widthMm, 6000, 0.03);
    near(m.heightMm, 1000, 0.03);
  });
  it('입력 치수의 비율이 원근으로 잰 모양과 크게 다르면(근사치 아님) 반영하지 않는다', () => {
    expect(signLengthSetup(ai, quad, 2000, 1500, imgW, imgH)).toBeNull();
  });
  it('판정 = 외곽선이 원근 축과 맞고(라인) 가로/세로 비율이 15% 안 — 비율 12% 차이는 반영, 20% 는 반영 안 함', () => {
    expect(signLengthSetup(ai, quad, 2000, 600 * 1.12, imgW, imgH)).not.toBeNull();
    expect(signLengthSetup(ai, quad, 2000, 600 * 1.2, imgW, imgH)).toBeNull();
  });
  it('외곽선이 원근 축과 어긋나게(12° 돌려) 그려졌으면 비율이 맞아도 반영하지 않는다', () => {
    const cx = quad.reduce((t, p) => t + p[0], 0) / 4, cy = quad.reduce((t, p) => t + p[1], 0) / 4, r = (12 * Math.PI) / 180;
    const tilted: Pt[] = quad.map(([x, y]) => [cx + (x - cx) * Math.cos(r) - (y - cy) * Math.sin(r), cy + (x - cx) * Math.sin(r) + (y - cy) * Math.cos(r)]);
    const m = measureQuad(calibrationOf(solveCamera(ai, imgW, imgH)!), tilted);
    expect(signLengthSetup(ai, tilted, 2000, (2000 * m.heightMm) / m.widthMm, imgW, imgH)).toBeNull();
  });
});

describe('원근 완성도 (cameraLevel, 2026-10-19 "완성도 표시만해줘")', async () => {
  const { cameraLevel, signLengthSetup } = await import('../../src/lib/core/camera');
  const ai: CameraSetup = { ...setupOf(proj), origin: proj([2500, 1500, 0]), ref: undefined, auto: true };
  const onWall = (x: number, h: number, w: number, hh: number) => ([[x, h + hh], [x + w, h + hh], [x + w, h], [x, h]] as [number, number][]).map(([a, b]) => proj([a, b, 0]));
  const sign = { quad: onWall(1500, 2200, 2000, 600), w: 2000, h: 600 };
  it('원근 없음 = 0, 축만 = 1 (축 ✓ · 길이 – · 확인 –)', () => {
    expect(cameraLevel(undefined, [], imgW, imgH).level).toBe(0);
    expect(cameraLevel(ai, [], imgW, imgH)).toEqual({ axes: true, length: false, check: false, level: 1 });
  });
  it('실측 사인물 하나가 원근과 맞으면(라인·비율) 바로 3 — AI 축 선과 실측이 서로 확인 (2026-10-19 "실재 치수를 넣었는데 원근이 완성되지 않는다")', () => {
    const withLen = signLengthSetup(ai, sign.quad, sign.w, sign.h, imgW, imgH)!;
    expect(cameraLevel(withLen, [sign], imgW, imgH)).toEqual({ axes: true, length: true, check: true, level: 3 });
    // 비율이 안 맞는 치수만 있으면 확인으로 치지 않는다
    expect(cameraLevel(withLen, [{ ...sign, h: 1000 }], imgW, imgH).level).toBe(2);
  });
  it('사람이 원근 창에서 맞춘 원근(자동 아님)은 기준 길이가 있으면 3', () => {
    expect(cameraLevel(setupOf(proj), [], imgW, imgH).level).toBe(3);
  });
});

describe('치수 넣은 사인물로 자동 원근 고치기 (autoCameraFrom, 2026-10-19 "실재 치수를 넣었는데 원근이 완성되지 않는다")', async () => {
  const { autoCameraFrom, cameraLevel } = await import('../../src/lib/core/camera');
  const onWall = (x: number, h: number, w: number, hh: number) => ([[x, h + hh], [x + w, h + hh], [x + w, h], [x, h]] as [number, number][]).map(([a, b]) => proj([a, b, 0]));
  const sign = { quad: onWall(1500, 2200, 2000, 600), w: 2000, h: 600 };
  const door = { quad: onWall(4000, 0, 1000, 2100), w: 1000, h: 2100 };
  const ai: CameraSetup = { ...setupOf(proj), origin: proj([2500, 1500, 0]), ref: undefined, auto: true };
  // AI 가 엉뚱한 선을 잡은 원근: 가로 축 선 두 개가 8° 기울어짐 (전선·현수막 등)
  const tilt = (l: Line): Line => { const m: Pt = [(l.a[0] + l.b[0]) / 2, (l.a[1] + l.b[1]) / 2], r = (8 * Math.PI) / 180; const t = (p: Pt): Pt => [m[0] + (p[0] - m[0]) * Math.cos(r) - (p[1] - m[1]) * Math.sin(r), m[1] + (p[0] - m[0]) * Math.sin(r) + (p[1] - m[1]) * Math.cos(r)]; return { a: t(l.a), b: t(l.b) }; };
  const wrong: CameraSetup = { ...ai, x: [tilt(ai.x[0]), tilt(ai.x[1])] };
  const band = onWall(0, 2000, 6000, 1000);
  it('원근이 없으면 그 사인물로 잡는다', () => {
    const s = autoCameraFrom(undefined, sign.quad, sign.w, sign.h, [], imgW, imgH)!;
    expect(s.auto).toBe(true);
    expect(s.ref).toMatchObject({ mm: 2000 });
  });
  it('AI 축이 맞으면 축은 두고 원점·길이만 그 사인물로', () => {
    const s = autoCameraFrom(ai, sign.quad, sign.w, sign.h, [], imgW, imgH)!;
    expect(s.x).toEqual(ai.x);
    expect(s.ref).toMatchObject({ mm: 2000 });
  });
  it('AI 축이 틀려 사인물이 안 맞고 다른 확인도 없으면, 실측 사인물로 원근을 다시 잡는다 — 다른 영역 크기가 맞고 완성도 3', () => {
    const s = autoCameraFrom(wrong, sign.quad, sign.w, sign.h, [], imgW, imgH)!;
    expect(s).not.toBeNull();
    expect(s.x).not.toEqual(wrong.x);
    expect(s.auto).toBe(true);
    const m = measureQuad(calibrationOf(solveCamera(s, imgW, imgH)!), band);
    near(m.widthMm, 6000, 0.05); near(m.heightMm, 1000, 0.05);
    expect(cameraLevel(s, [sign], imgW, imgH).level).toBe(3);
  });
  it('이미 다른 실측 사인물이 지금 원근을 확인하고 있으면, 안 맞는 새 사인물로 갈아엎지 않는다', () => {
    const confirmed = autoCameraFrom(ai, door.quad, door.w, door.h, [], imgW, imgH)!;
    const skewed = { ...sign, h: 1500 }; // 비율이 틀린 입력
    expect(autoCameraFrom(confirmed, skewed.quad, skewed.w, skewed.h, [door], imgW, imgH)).toBeNull();
  });
  it('사람이 맞춘 원근은 손대지 않는다', () => {
    expect(autoCameraFrom(setupOf(proj), sign.quad, sign.w, sign.h, [], imgW, imgH)).toBeNull();
  });
});

describe('실측 사인물로 원근을 잡을 때 화각도 맞춘다 (signCameraFit, 2026-10-20 "실측을 넣었는데 원근완성이 뜨지 않는다")', async () => {
  const { signCameraFit, autoCameraFrom, cameraLevel } = await import('../../src/lib/core/camera');
  // 실제 프로젝트 사진(3200×2400)의 사인물 "실측" 600×600 — 좌우 변이 거의 평행해 소실점 화각이 틀려 비율이 600:472 로 재졌다
  const quad: Pt[] = [[917, 224], [1615, 469], [1636, 1213], [933, 1179]];
  it('입력한 가로세로 비율이 맞도록 초점거리를 찾는다 → 자기 자신을 재면 600×600, 완성도 3', () => {
    const s = signCameraFit(quad, 600, 600, 3200, 2400)!;
    expect(s.focal).toBeGreaterThan(0.5 * 3200); expect(s.focal).toBeLessThan(1.0 * 3200); // 휴대폰 화각 근처
    const m = measureQuad(calibrationOf(solveCamera(s, 3200, 2400)!), quad);
    near(m.widthMm, 600, 0.01); near(m.heightMm, 600, 0.02);
    expect(cameraLevel(s, [{ quad, w: 600, h: 600 }], 3200, 2400).level).toBe(3);
  });
  it('원근이 없거나 자동 원근이 이 사인물과 안 맞으면 화각까지 맞춘 사인물 원근으로 — 완성도 3', () => {
    const fresh = autoCameraFrom(undefined, quad, 600, 600, [], 3200, 2400)!;
    expect(fresh.focal).toBeGreaterThan(0);
    expect(cameraLevel(fresh, [{ quad, w: 600, h: 600 }], 3200, 2400).level).toBe(3);
    // 이 사진의 실제 자동 원근(사인물 외곽선으로 잡혔지만 화각이 틀려 2 에 머물던 것)
    const stuck: CameraSetup = { x: [{ a: quad[0], b: quad[1] }, { a: quad[3], b: quad[2] }], y: [{ a: quad[3], b: quad[0] }, { a: quad[2], b: quad[1] }], axes: { first: '+x', second: '+z' }, origin: quad[3], ref: { axis: 'x', from: quad[3], to: quad[2], mm: 600 }, principal: 'center', auto: true };
    expect(cameraLevel(stuck, [{ quad, w: 600, h: 600 }], 3200, 2400).level).toBe(2);
    const s = autoCameraFrom(stuck, quad, 600, 600, [], 3200, 2400)!;
    expect(cameraLevel(s, [{ quad, w: 600, h: 600 }], 3200, 2400).level).toBe(3);
  });
  it('소실점 화각으로 이미 비율이 맞으면 화각을 고정하지 않는다', () => {
    const q = ([[1500, 2800], [3500, 2800], [3500, 2200], [1500, 2200]] as [number, number][]).map(([x, h]) => proj([x, h, 0]));
    expect(signCameraFit(q, 2000, 600, imgW, imgH)!.focal).toBeUndefined();
  });
});

describe('AI 둘째 선 쌍의 축 자동 분류 (2026-10-21 "정면에 가까우면 x,z 가 잘되고 45도에 가까우면 x,y 가 잘 추적")', async () => {
  const { classifySecondAxis, axesForProposal, VERTICAL_TOL } = await import('../../src/lib/core/camera');
  const L = (a: [number, number], b: [number, number]) => ({ a, b });
  it('정면 사진: 둘째 쌍이 세로에 가까우면(30° 안) 높이 Z', () => {
    expect(classifySecondAxis([L([100, 50], [110, 900]), L([1500, 40], [1490, 920])])).toBe('+z');
    expect(VERTICAL_TOL).toBeCloseTo(Math.PI / 6);
  });
  it('45° 사진: 둘째 쌍이 깊이로 물러나는 대각선이면 Y', () => {
    expect(classifySecondAxis([L([100, 300], [900, 500]), L([100, 800], [900, 650])])).toBe('+y'); // 차양·바닥선처럼 비스듬히 모이는 선
  });
  it('하나라도 비스듬하면 Y — 수직선 하나 + 대각선 하나는 같은 축이 아니므로 깊이로 본다', () => {
    expect(classifySecondAxis([L([100, 50], [105, 900]), L([100, 300], [900, 500])])).toBe('+y');
  });
  it('제안 축: 첫 쌍은 X, 둘째 쌍은 분류대로', () => {
    const x: [ReturnType<typeof L>, ReturnType<typeof L>] = [L([0, 100], [1000, 120]), L([0, 900], [1000, 880])];
    expect(axesForProposal({ x, y: [L([100, 50], [110, 900]), L([1500, 40], [1490, 920])] })).toEqual({ first: '+x', second: '+z' });
    expect(axesForProposal({ x, y: [L([100, 300], [900, 500]), L([100, 800], [900, 650])] })).toEqual({ first: '+x', second: '+y' });
  });
});

describe('제안을 적용할 때의 축 (axesAfterProposal, 2026-10-21 "사람이 잡은것도 축을 변경했다면 다시 자동버튼이 눌리면 자동으로 잡아줘")', async () => {
  const { axesAfterProposal, wantedAxes } = await import('../../src/lib/core/camera');
  const L = (a: [number, number], b: [number, number]) => ({ a, b });
  const x: [ReturnType<typeof L>, ReturnType<typeof L>] = [L([0, 100], [1000, 120]), L([0, 900], [1000, 880])];
  const depth = { x, y: [L([100, 300], [900, 500]), L([100, 800], [900, 650])] as [ReturnType<typeof L>, ReturnType<typeof L>], second: '+y' as const };
  const vert = { x, y: [L([100, 50], [110, 900]), L([1500, 40], [1490, 920])] as [ReturnType<typeof L>, ReturnType<typeof L>], second: '+z' as const };
  it('지정이 없으면 제안의 축', () => {
    expect(axesAfterProposal(undefined, depth)).toEqual({ axes: { first: '+x', second: '+y' }, fallback: false });
  });
  it('사람이 Y 로 바꿔 두었고 AI 가 깊이선을 찾았으면 그대로 Y (부호 포함)', () => {
    expect(axesAfterProposal({ first: '+x', second: '-y' }, depth)).toEqual({ axes: { first: '+x', second: '-y' }, fallback: false });
    expect(wantedAxes({ first: '+x', second: '-y' })).toEqual({ first: 'x', second: 'y' });
    expect(wantedAxes(undefined)).toEqual({});
  });
  it('Y 를 원했는데 AI 가 수직선밖에 못 찾았으면 축은 그대로 두고 fallback 으로 알린다 (호출자가 둘째 쌍을 안 바꾼다)', () => {
    expect(axesAfterProposal({ first: '+x', second: '+y' }, vert)).toEqual({ axes: { first: '+x', second: '+y' }, fallback: true });
  });
});
