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
    ref: { a: pr([1000, 500, 0]), b: pr([1900, 500, 0]), axis: 'x', mm: 900 },
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

  it('기준 길이가 세로 축이어도 된다', () => {
    const st = setupOf(proj);
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
    const st = setupOf(proj); st.origin = proj([2000, 1000, 0]); st.ref = { a: proj([3000, 1500, 0]), b: proj([3900, 1500, 0]), axis: 'x', mm: 900 };
    const b = solveCamera(st, imgW, imgH)!;
    near(b.cameraPos[0], 1000, 0.02); near(b.cameraPos[1], 800, 0.02); near(b.cameraPos[2], 8000, 0.02);
    near(b.fov.h, a.fov.h, 0.001);
  });
  it('선 쌍 축 지정: 첫 쌍을 +Y, 둘째 쌍을 +X 로 바꿔 넣어도 같은 카메라', () => {
    const st = setupOf(proj);
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
    const base: CameraSetup = { x: full.z!, y: full.y, origin: proj([0, 0, 0]), ref: { a: proj([0, 500, 0]), b: proj([0, 500, -1000]), axis: 'x', mm: 1000 } };
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
