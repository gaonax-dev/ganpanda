import { describe, expect, it } from 'vitest';
import { detectSegments, findVanishingPoint, pointsTo, proposeAxes, type Segment } from '../../src/lib/core/lines';
import { solveCamera } from '../../src/lib/core/camera';
import { projectPoint, type CameraPose, type Pt } from '../../src/lib/core/homography';

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
/** 합성 사진: 벽(밝음) + 띠 + 창 2개 + 문, 약간의 노이즈·그라데이션 (실사진 흉내) */
function raster(pr: (q: V3) => Pt, w: number, h: number, noise = 6) {
  const data = new Uint8ClampedArray(w * h);
  let seed = 7;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const inside = (pt: Pt, poly: Pt[]) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i], [xj, yj] = poly[j]; if (yi > pt[1] !== yj > pt[1] && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) c = !c; } return c; };
  const rect = (x: number, y: number, rw: number, rh: number): Pt[] => [pr([x, y, 0]), pr([x + rw, y, 0]), pr([x + rw, y + rh, 0]), pr([x, y + rh, 0])];
  const shapes: [Pt[], number][] = [[rect(0, 0, 9000, 6000), 200], [rect(0, 3700, 9000, 1000), 235], [rect(600, 4950, 1500, 850), 70], [rect(2700, 4950, 1500, 850), 70], [rect(4000, 0, 1000, 2900), 50], [rect(150, 100, 3800, 3300), 60]];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let v = 120 + (y / h) * 30; // 하늘 그라데이션
    for (const [poly, c] of shapes) if (inside([x + 0.5, y + 0.5], poly)) v = c;
    data[y * w + x] = Math.max(0, Math.min(255, v + (rnd() - 0.5) * noise));
  }
  return { data, width: w, height: h };
}
const angleOf = (a: Pt, b: Pt) => Math.atan2(b[1] - a[1], b[0] - a[0]);
const angleDiff = (a: number, b: number) => { const d = Math.abs(a - b) % Math.PI; return Math.min(d, Math.PI - d); };
const DEG = Math.PI / 180;

describe('선분 검출 (LSD 식)', () => {
  const W = 640, H = 480;
  const S = truth(0.45, -0.2, [4000, 2500, 12000]);
  const small = (q: V3): Pt => { const [u, v] = projectPoint(S, q); return [(u * W) / imgW, (v * H) / imgH]; };
  const img = raster(small, W, H);

  it('띠의 위 변을 긴 선분으로 찾는다 (각 1°, 위치 2px 안)', () => {
    const segs = detectSegments(img);
    expect(segs.length).toBeGreaterThan(8);
    const a = small([0, 4700, 0]), b = small([9000, 4700, 0]);
    const want = angleOf(a, b);
    const near = segs.filter((s) => angleDiff(angleOf(s.a, s.b), want) < 1 * DEG && s.length > (b[0] - a[0]) * 0.5);
    expect(near.length).toBeGreaterThan(0);
    // 선분 중점이 실제 변에서 2px 안 (점-직선 거리)
    const s = near[0], m: Pt = [(s.a[0] + s.b[0]) / 2, (s.a[1] + s.b[1]) / 2];
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const dist = Math.abs(dy * (m[0] - a[0]) - dx * (m[1] - a[1])) / Math.hypot(dx, dy);
    expect(dist).toBeLessThan(2);
  });

  it('RANSAC 소실점: 가로 선분들의 소실점이 실제 가로 소실점과 1° 안', () => {
    const segs = detectSegments(img);
    const v = findVanishingPoint(segs)!;
    expect(v.inliers.length).toBeGreaterThanOrEqual(4);
    // 실제 소실점: 두 가로선의 교점
    const l = (p: Pt, q: Pt): V3 => [p[1] - q[1], q[0] - p[0], p[0] * q[1] - p[1] * q[0]];
    const l1 = l(small([0, 4700, 0]), small([9000, 4700, 0])), l2 = l(small([0, 0, 0]), small([9000, 0, 0]));
    const vt: V3 = [l1[1] * l2[2] - l1[2] * l2[1], l1[2] * l2[0] - l1[0] * l2[2], l1[0] * l2[1] - l1[1] * l2[0]];
    const toPt = (x: V3): Pt => [x[0] / x[2], x[1] / x[2]];
    // 가로 또는 세로 중 하나가 먼저 나온다 — 가로인 경우만 확인
    const horiz = v.inliers.reduce((a, s) => a + Math.abs(s.b[0] - s.a[0]), 0) > v.inliers.reduce((a, s) => a + Math.abs(s.b[1] - s.a[1]), 0);
    if (horiz) {
      const p = toPt(v.v), q = toPt(vt);
      const c: Pt = [W / 2, H / 2];
      const ang = Math.abs(Math.atan2(p[1] - c[1], p[0] - c[0]) - Math.atan2(q[1] - c[1], q[0] - c[0]));
      expect(Math.min(ang, Math.PI * 2 - ang)).toBeLessThan(1 * DEG);
    }
  });

  it('축 선 제안: 가로 2개·세로 2개가 실제 소실점을 향하고(1.5°), 서로 떨어져 있고, 그 선으로 푼 초점거리가 5% 안', () => {
    const p = proposeAxes(img)!;
    expect(p).not.toBeNull();
    const l = (a: Pt, b: Pt): V3 => [a[1] - b[1], b[0] - a[0], a[0] * b[1] - a[1] * b[0]];
    const x3 = (u: V3, v: V3): V3 => [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const vxT = x3(l(small([0, 4700, 0]), small([9000, 4700, 0])), l(small([0, 0, 0]), small([9000, 0, 0])));
    const vyT = x3(l(small([4000, 0, 0]), small([4000, 2900, 0])), l(small([600, 4950, 0]), small([600, 5800, 0])));
    const seg = (s: { a: Pt; b: Pt }): Segment => ({ a: s.a, b: s.b, length: Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]), strength: 1 });
    for (const s of p.x) expect(pointsTo(seg(s), vxT, 1.5 * DEG)).toBe(true);
    for (const s of p.y) expect(pointsTo(seg(s), vyT, 1.5 * DEG)).toBe(true);
    expect(Math.abs((p.x[0].a[1] + p.x[0].b[1]) / 2 - (p.x[1].a[1] + p.x[1].b[1]) / 2)).toBeGreaterThan(H * 0.1);
    expect(Math.abs((p.y[0].a[0] + p.y[0].b[0]) / 2 - (p.y[1].a[0] + p.y[1].b[0]) / 2)).toBeGreaterThan(W * 0.1);
    const sol = solveCamera({ x: [p.x[0], p.x[1]], y: [p.y[0], p.y[1]], origin: small([0, 0, 0]), ref: { axis: 'x', from: small([1000, 0, 0]), to: small([8000, 0, 0]), mm: 7000 } }, W, H)!;
    expect(Math.abs(sol.f - (f * W) / imgW) / ((f * W) / imgW)).toBeLessThan(0.05);
  });
});

describe('둘째 쌍 = 깊이(Y) 또는 높이(Z) (2026-10-21 "정면에 가까우면 x,z 가 잘되고 45도에 가까우면 x,y 가 잘 추적")', () => {
  const W = 800, H = 600;
  const S = truth(0.6, -0.15, [4000, 2000, 10000]); // 비스듬한(~34°) 사진, 바닥이 보인다
  const small = (q: V3): Pt => { const [u, v] = projectPoint(S, q); return [(u * W) / imgW, (v * H) / imgH]; };
  /** 벽 + 바닥(깊이로 물러나는 줄무늬 — 타일 줄눈처럼) */
  const img = (() => {
    const data = new Uint8ClampedArray(W * H);
    let seed = 3;
    const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    const inside = (pt: Pt, poly: Pt[]) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i], [xj, yj] = poly[j]; if (yi > pt[1] !== yj > pt[1] && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) c = !c; } return c; };
    const wall = (x: number, y: number, rw: number, rh: number): Pt[] => [small([x, y, 0]), small([x + rw, y, 0]), small([x + rw, y + rh, 0]), small([x, y + rh, 0])];
    const floor = (x: number, z0: number, rw: number, z1: number): Pt[] => [small([x, 0, z0]), small([x + rw, 0, z0]), small([x + rw, 0, z1]), small([x, 0, z1])];
    const shapes: [Pt[], number][] = [
      [wall(0, 0, 9000, 6000), 200], [wall(0, 3700, 9000, 1000), 235], [wall(600, 4950, 1500, 850), 70], [wall(2700, 4950, 1500, 850), 70], [wall(4000, 0, 1000, 2900), 50],
      [floor(-3000, 0, 15000, 9500), 150], [floor(1500, 100, 160, 9500), 60], [floor(4500, 100, 160, 9500), 60], [floor(7500, 100, 160, 9500), 60], [floor(-1500, 100, 160, 9500), 60],
    ];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let v = 120 + (y / H) * 30;
      for (const [poly, c] of shapes) if (inside([x + 0.5, y + 0.5], poly)) v = c;
      data[y * W + x] = Math.max(0, Math.min(255, v + (rnd() - 0.5) * 6));
    }
    return { data, width: W, height: H };
  })();
  const l = (a: Pt, b: Pt): V3 => [a[1] - b[1], b[0] - a[0], a[0] * b[1] - a[1] * b[0]];
  const x3 = (u: V3, v: V3): V3 => [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const seg = (s: { a: Pt; b: Pt }): Segment => ({ a: s.a, b: s.b, length: Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]), strength: 1 });
  const vDepth = x3(l(small([1500, 0, 0]), small([1500, 0, 9000])), l(small([7500, 0, 0]), small([7500, 0, 9000])));
  const vVert = x3(l(small([4000, 0, 0]), small([4000, 2900, 0])), l(small([600, 4950, 0]), small([600, 5800, 0])));

  it('비스듬한 사진(가로 소실점 유한): 둘째 쌍은 바닥의 깊이선(Y) — 두 선이 깊이 소실점을 향한다', () => {
    const p = proposeAxes(img)!;
    expect(p).not.toBeNull();
    expect(p.second).toBe('+y');
    for (const s of p.y) expect(pointsTo(seg(s), vDepth, 2 * DEG)).toBe(true);
    // X·Y 두 소실점이 유한 → 초점거리가 풀린다 (8% 안)
    const sol = solveCamera({ x: [p.x[0], p.x[1]], y: [p.y[0], p.y[1]], axes: { first: '+x', second: '+y' }, origin: small([0, 0, 0]), ref: { axis: 'x', from: small([1000, 0, 0]), to: small([8000, 0, 0]), mm: 7000 } }, W, H)!;
    expect(Math.abs(sol.f - (f * W) / imgW) / ((f * W) / imgW)).toBeLessThan(0.08);
  });
  it('높이(Z)를 고르면 수직선 쌍을 찾는다 (원근 창에서 축을 바꾸고 다시 제안)', () => {
    const p = proposeAxes(img, { second: 'z' })!;
    expect(p.second).toBe('+z');
    for (const s of p.y) expect(pointsTo(seg(s), vVert, 2 * DEG)).toBe(true);
  });
});
