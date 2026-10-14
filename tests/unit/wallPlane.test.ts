import { describe, expect, it } from 'vitest';
import { calibrationOf, solveCamera } from '../../src/lib/core/camera';
import { applyHomography, projectPoint, type CameraPose, type Pt } from '../../src/lib/core/homography';
import type { SignObject } from '../../src/lib/core/model';
import { placeOnWall, poseOfPlane, projectP, projectionFromPlane, wallPlaneOf } from '../../src/lib/core/wallPlane';

// 합성 카메라 (calibration.test 와 같은 모델)
const imgW = 4000, imgH = 3000, f = 3000;
function pose(yaw: number, pitch: number, C: number[]): CameraPose {
  const base = [1, 0, 0, 0, -1, 0, 0, 0, -1];
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
  const Ry = [cy, 0, sy, 0, 1, 0, -sy, 0, cy], Rx = [1, 0, 0, 0, cp, -sp, 0, sp, cp];
  const mul = (a: number[], b: number[]) => { const r = new Array(9).fill(0); for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) for (let k = 0; k < 3; k++) r[i * 3 + j] += a[i * 3 + k] * b[k * 3 + j]; return r; };
  const R = mul(Rx, mul(Ry, base));
  const t = [0, 1, 2].map((i) => -(R[i * 3] * C[0] + R[i * 3 + 1] * C[1] + R[i * 3 + 2] * C[2])) as [number, number, number];
  return { f, R, t, imgW, imgH };
}
const rectOn = (p: CameraPose, x: number, y: number, w: number, h: number): Pt[] =>
  ([[x, y + h], [x + w, y + h], [x + w, y], [x, y]] as Pt[]).map(([a, b]) => projectPoint(p, [a, b, 0]));
const obj = (id: string, quad: Pt[], o: Partial<SignObject> = {}): SignObject =>
  ({ id, photoId: 'p', name: id, shape: 'rect', quad, sheetIds: [], createdAt: 0, ...o });
const P = pose(0.45, -0.1, [3000, 2000, 8000]);
const sign = obj('sign', rectOn(P, 1000, 2500, 4000, 900), { widthMm: 4000, heightMm: 900 });
const door = obj('door', rectOn(P, 5500, 0, 1200, 2100), { widthMm: 1200, heightMm: 2100 });
/** 카메라 설정: 간판·문의 변을 축 선으로, 원점 = 벽 좌하단, 기준 길이 = 간판 가로 */
const pr = (x: number, y: number): Pt => projectPoint(P, [x, y, 0]);
const camera = calibrationOf(solveCamera({
  x: [{ a: pr(1000, 2500), b: pr(5000, 2500) }, { a: pr(0, 0), b: pr(6000, 0) }],
  y: [{ a: pr(5500, 0), b: pr(5500, 2100) }, { a: pr(1000, 2500), b: pr(1000, 3400) }],
  origin: pr(0, 0), ref: { axis: 'x', from: pr(1000, 0), to: pr(5000, 0), mm: 4000 },
}, imgW, imgH)!);
const band = obj('band', rectOn(P, 0, 3600, 6000, 600)); // 치수 없음 → 벽면에서 추정
const near = (a: number, b: number, tol: number) => expect(Math.abs(a - b) / Math.max(1, Math.abs(b))).toBeLessThan(tol);

describe('벽면 좌표계 (실사 합성용)', () => {
  it('기준선 보정이 있으면 그 벽면으로: 다른 영역의 크기·상대 위치가 1% 안', () => {
    const plane = wallPlaneOf([sign, door, band], camera)!;
    expect(plane.source).toBe('calibration');
    const s = placeOnWall(plane, sign), b = placeOnWall(plane, band);
    near(b.w, 6000, 0.01); near(b.h, 600, 0.01);
    // 상대 위치: 띠 중심은 간판 중심보다 왼쪽(−3000+1000=…)·위에
    expect(Math.abs((b.cx - s.cx) - ((0 + 3000) - (1000 + 2000)))).toBeLessThan(60);
    expect(Math.abs((b.cy - s.cy) - ((3600 + 300) - (2500 + 450)))).toBeLessThan(60);
    // y 는 위가 +
    expect(b.cy).toBeGreaterThan(s.cy);
  });

  it('보정이 없으면 치수를 입력한 첫 영역을 벽면 기준으로 삼는다', () => {
    const plane = wallPlaneOf([band, sign, door], null)!;
    expect(plane.source).toBe('reference');
    expect(plane.referenceId).toBe('sign');
    const s = placeOnWall(plane, sign), d = placeOnWall(plane, door);
    near(s.w, 4000, 1e-6); near(s.h, 900, 1e-6);
    near(d.w, 1200, 0.01); near(d.h, 2100, 0.01);
    expect(Math.abs((d.cx - s.cx) - ((5500 + 600) - (1000 + 2000)))).toBeLessThan(60);
  });

  it('치수도 원근도 없으면 그린 영역을 그대로 벽면으로 (높이 1000mm, 가로는 비율) — 자리에 맞물린다', () => {
    const plane = wallPlaneOf([band], null)!;
    expect(plane.source).toBe('drawn');
    const b = placeOnWall(plane, band);
    expect(b.h).toBeCloseTo(1000, 3);
    expect(b.w).toBeGreaterThan(1000); // 띠는 가로로 길다
    expect(wallPlaneOf([], null)).toBeNull();
  });

  it('벽면에서 카메라를 복원하면 벽 위 점이 사진의 제자리에 투영된다 (1px 안)', () => {
    const plane = wallPlaneOf([sign, door, band], camera)!;
    const cam = poseOfPlane(plane, imgW, imgH);
    const b = placeOnWall(plane, band);
    const corners: Pt[] = [[b.cx - b.w / 2, b.cy + b.h / 2], [b.cx + b.w / 2, b.cy + b.h / 2], [b.cx + b.w / 2, b.cy - b.h / 2], [b.cx - b.w / 2, b.cy - b.h / 2]];
    corners.forEach((p, i) => {
      const px = projectPoint(cam, [p[0], p[1], 0]);
      const viaH = applyHomography(plane.H, p);
      expect(Math.abs(px[0] - viaH[0])).toBeLessThan(1);
      expect(Math.abs(px[1] - viaH[1])).toBeLessThan(1);
      expect(Math.abs(px[0] - band.quad[i][0])).toBeLessThan(imgW * 0.01);
    });
    near(cam.f, f, 0.05); // 초점거리도 복원
  });
});

describe('호모그래피에 정확히 맞는 투영 (손으로 그린 영역에도 사인물이 제자리에)', () => {
  it('핀홀과 맞지 않는 사각형이라도 벽면(z=0) 위 점은 H 와 1e-6 안에서 같고, 먼 사인물도 제자리', () => {
    // 손으로 찍은 듯한 사각형 (핀홀로 재현되지 않는 왜곡)
    const hand = obj('hand', [[300, 400], [1300, 350], [1250, 700], [280, 740]], { widthMm: 5000, heightMm: 1500 });
    const far = obj('far', [[1400, 200], [1900, 180], [1900, 320], [1400, 330]]);
    const plane = wallPlaneOf([hand, far], null)!;
    const P = projectionFromPlane(plane, imgW, imgH);
    const pl = placeOnWall(plane, far);
    const corners: [number, number][] = [[pl.cx - pl.w / 2, pl.cy + pl.h / 2], [pl.cx + pl.w / 2, pl.cy + pl.h / 2], [pl.cx + pl.w / 2, pl.cy - pl.h / 2], [pl.cx - pl.w / 2, pl.cy - pl.h / 2]];
    for (const [i, c] of corners.entries()) {
      const viaH = applyHomography(plane.H, c), viaP = projectP(P, [c[0], c[1], 0])!;
      expect(Math.abs(viaP[0] - viaH[0])).toBeLessThan(1e-6);
      expect(Math.abs(viaP[1] - viaH[1])).toBeLessThan(1e-6);
      // 핀홀 분해는 이 사각형에서 어긋난다 (그래서 투영을 따로 둔다)
      void i;
    }
    const pinhole = poseOfPlane(plane, imgW, imgH);
    const [u] = projectPoint(pinhole, [corners[0][0], corners[0][1], 0]), [tu] = applyHomography(plane.H, corners[0]);
    expect(Math.abs(u - tu)).toBeGreaterThan(1); // 핀홀로는 안 맞는 경우임을 확인
  });
  it('+Z(벽 밖) 는 카메라 쪽: 깊이가 줄고 투영이 유한하다', () => {
    const P2 = pose(0.45, -0.1, [3000, 2000, 8000]);
    const sign2 = obj('s', rectOn(P2, 1000, 2500, 4000, 900), { widthMm: 4000, heightMm: 900 });
    const plane = wallPlaneOf([sign2], null)!;
    const P = projectionFromPlane(plane, imgW, imgH);
    const depth = (p: [number, number, number]) => P[8] * p[0] + P[9] * p[1] + P[10] * p[2] + P[11];
    expect(depth([2000, 450, 300])).toBeLessThan(depth([2000, 450, 0]));
    expect(projectP(P, [2000, 450, 300])).not.toBeNull();
    // 핀홀과 맞는 사진에서는 Z 가 있어도 복원 포즈와 거의 같다
    // 벽면 원점은 기준 사인물의 좌하단(월드 1000,2500) → 벽면 (2000,450,300) = 월드 (3000,2950,300)
    const [u, v] = projectP(P, [2000, 450, 300])!, [tu, tv] = projectPoint(P2, [3000, 2950, 300]);
    expect(Math.hypot(u - tu, v - tv)).toBeLessThan(3);
  });
});

describe('3×4 투영 → 클립 행렬 (뷰어와 같은 식)', () => {
  it('벽면 점들이 near~far 안(z_ndc −1~1)에 들어오고 x,y 는 사진 좌표와 같다', () => {
    const P2 = pose(0.45, -0.1, [3000, 2000, 8000]);
    const sign2 = obj('s', rectOn(P2, 1000, 2500, 4000, 900), { widthMm: 4000, heightMm: 900 });
    const plane = wallPlaneOf([sign2], null)!;
    const P = projectionFromPlane(plane, imgW, imgH);
    const depths = [[0, 0], [4000, 0], [4000, 900], [0, 900]].map(([x, y]) => P[8] * x + P[9] * y + P[11]);
    const dmin = Math.max(1e-6, Math.min(...depths) * 0.2), dmax = Math.max(...depths) * 5;
    const a = (dmax + dmin) / (dmax - dmin), b = (-2 * dmax * dmin) / (dmax - dmin);
    for (const p of [[0, 0, 0], [4000, 900, 0], [2000, 450, 300], [2000, 450, -300]] as [number, number, number][]) {
      const w = P[8] * p[0] + P[9] * p[1] + P[10] * p[2] + P[11];
      const zndc = a + b / w;
      expect(zndc).toBeGreaterThan(-1); expect(zndc).toBeLessThan(1);
      const x = (P[0] * p[0] + P[1] * p[1] + P[2] * p[2] + P[3]) / w, y = (P[4] * p[0] + P[5] * p[1] + P[6] * p[2] + P[7]) / w;
      const [tu, tv] = projectPoint(P2, [p[0] + 1000, p[1] + 2500, p[2]]);
      expect(Math.abs(x - tu)).toBeLessThan(3); expect(Math.abs(y - tv)).toBeLessThan(3);
    }
  });
});

describe('카메라 설정에서 온 벽면은 원근 창과 같은 투영을 쓴다', () => {
  it('벽 밖(Z>0) 점도 풀린 카메라의 투영과 1e-6 안에서 같다 (원근 창의 상자 = 3D 뷰의 상자)', () => {
    const plane = wallPlaneOf([sign, door, band], camera)!;
    expect(plane.pose).toBeDefined();
    const P = projectionFromPlane(plane, imgW, imgH);
    for (const q of [[0, 0, 0], [1000, 0, 1000], [1000, 1000, 1000], [2500, 1200, 300]] as [number, number, number][]) {
      const a = projectP(P, q)!, b = projectPoint(plane.pose!, q);
      expect(Math.abs(a[0] - b[0])).toBeLessThan(1e-6); expect(Math.abs(a[1] - b[1])).toBeLessThan(1e-6);
    }
  });
});
