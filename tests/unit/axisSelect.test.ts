// 축 조합 고르기 (2026-10-21 사용자: "각각의 조합 xz xy yz를 모두 한번씩 적용하고 여러 위치의 큐브와 일치가 많은 걸로 선택할 수 있나?")
import { describe, expect, it } from 'vitest';
import { pointsTo, type Segment } from '../../src/lib/core/lines';
import { proposeAxisLines } from '../../src/lib/core/camera';
import { projectPoint, type CameraPose, type Pt } from '../../src/lib/core/homography';

const imgW = 4000, imgH = 3000, f = 2400; // 화각 비율 0.6 — 기본값(장변×0.75)과 다르게 두어, 화각을 못 푼 조합이 드러나게
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
const DEG = Math.PI / 180;
/** 벽(띠·창·문) + 선택적으로 바닥(깊이로 물러나는 줄무늬) */
function scene(S: CameraPose, W: number, H: number, floor: boolean) {
  const small = (q: V3): Pt => { const [u, v] = projectPoint(S, q); return [(u * W) / imgW, (v * H) / imgH]; };
  const data = new Uint8ClampedArray(W * H);
  let seed = 3;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const inside = (pt: Pt, poly: Pt[]) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i], [xj, yj] = poly[j]; if (yi > pt[1] !== yj > pt[1] && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) c = !c; } return c; };
  const wall = (x: number, y: number, rw: number, rh: number): Pt[] => [small([x, y, 0]), small([x + rw, y, 0]), small([x + rw, y + rh, 0]), small([x, y + rh, 0])];
  const fl = (x: number, z0: number, rw: number, z1: number): Pt[] => [small([x, 0, z0]), small([x + rw, 0, z0]), small([x + rw, 0, z1]), small([x, 0, z1])];
  const shapes: [Pt[], number][] = [[wall(0, 0, 9000, 6000), 200], [wall(0, 3700, 9000, 1000), 235], [wall(600, 4950, 1500, 850), 70], [wall(2700, 4950, 1500, 850), 70], [wall(4000, 0, 1000, 2900), 50]];
  if (floor) shapes.push([fl(-3000, 0, 15000, 9500), 150], [fl(1500, 100, 160, 9500), 60], [fl(4500, 100, 160, 9500), 60], [fl(7500, 100, 160, 9500), 60], [fl(-1500, 100, 160, 9500), 60]);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let v = 120 + (y / H) * 30;
    for (const [poly, c] of shapes) if (inside([x + 0.5, y + 0.5], poly)) v = c;
    data[y * W + x] = Math.max(0, Math.min(255, v + (rnd() - 0.5) * 6));
  }
  return { img: { data, width: W, height: H }, small };
}
const l = (a: Pt, b: Pt): V3 => [a[1] - b[1], b[0] - a[0], a[0] * b[1] - a[1] * b[0]];
const x3 = (u: V3, v: V3): V3 => [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
const seg = (s: { a: Pt; b: Pt }): Segment => ({ a: s.a, b: s.b, length: Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]), strength: 1 });

describe('축 조합 점수', () => {
  const W = 800, H = 600;
  it('벽만 있는 비스듬한 사진: 가로·수직선 → X·Z 조합이 이기고 선이 실제 소실점을 향한다', () => {
    const S = truth(0.45, -0.2, [4000, 2500, 12000]);
    const { img, small } = scene(S, W, H, false);
    const p = proposeAxisLines(img)!;
    expect(p).not.toBeNull();
    expect(p.axes).toEqual({ first: '+x', second: '+z' });
    const vx = x3(l(small([0, 4700, 0]), small([9000, 4700, 0])), l(small([0, 0, 0]), small([9000, 0, 0])));
    const vz = x3(l(small([4000, 0, 0]), small([4000, 2900, 0])), l(small([600, 4950, 0]), small([600, 5800, 0])));
    for (const s of p.x) expect(pointsTo(seg(s), vx, 1.5 * DEG)).toBe(true);
    for (const s of p.y) expect(pointsTo(seg(s), vz, 1.5 * DEG)).toBe(true);
  });
  it('바닥 줄무늬가 보이는 비스듬한 사진: 가로·깊이(X·Y) 조합이 이긴다 — 둘째 쌍이 깊이 소실점을 향한다', () => {
    const S = truth(0.6, 0, [4000, 2000, 10000]); // 카메라 수평 → 수직선이 평행(소실점 없음) = 실제 사진처럼, X·Z 로는 화각을 못 푼다
    const { img, small } = scene(S, W, H, true);
    const p = proposeAxisLines(img)!;
    expect(p.axes).toEqual({ first: '+x', second: '+y' });
    const vDepth = x3(l(small([1500, 0, 0]), small([1500, 0, 9000])), l(small([7500, 0, 0]), small([7500, 0, 9000])));
    for (const s of p.y) expect(pointsTo(seg(s), vDepth, 2 * DEG)).toBe(true);
    expect(p.score).toBeGreaterThan(0.5);
  });
  it('원근 창에서 X·Z 를 고르고 다시 제안하면 그 조합 안에서 — 수직선 쌍', () => {
    const S = truth(0.6, 0, [4000, 2000, 10000]);
    const { img, small } = scene(S, W, H, true);
    const p = proposeAxisLines(img, { first: 'x', second: 'z' })!;
    expect(p.axes).toEqual({ first: '+x', second: '+z' });
    const vz = x3(l(small([4000, 0, 0]), small([4000, 2900, 0])), l(small([600, 4950, 0]), small([600, 5800, 0])));
    for (const s of p.y) expect(pointsTo(seg(s), vz, 2 * DEG)).toBe(true);
  });
});
