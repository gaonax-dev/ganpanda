import { describe, expect, it } from 'vitest';
import { calibrationOf, solveCamera } from '../../src/lib/core/camera';
import { applyHomography, projectPoint, type CameraPose, type Pt } from '../../src/lib/core/homography';
import type { SignObject } from '../../src/lib/core/model';
import { placeOnWall, poseOfPlane, wallPlaneOf } from '../../src/lib/core/wallPlane';

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

  it('치수 입력 영역이 없으면 null', () => {
    expect(wallPlaneOf([band], null)).toBeNull();
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
