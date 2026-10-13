import { describe, expect, it } from 'vitest';
import {
  applyHomography, estimateFocal, estimateWallHeight, projectPoint, recoverPose, solveHomography,
  type CameraPose, type Pt,
} from '../../src/lib/core/homography';

// 정답을 아는 합성 카메라: 10m×6m 벽을 왼쪽 아래에서 비스듬히 촬영
const W = 10000, H = 6000, imgW = 4000, imgH = 3000, f = 3000;
function truthPose(yaw = 0.5, pitch = -0.15, C = [2000, 1500, 9000]): CameraPose {
  const base = [1, 0, 0, 0, -1, 0, 0, 0, -1];
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
  const Ry = [cy, 0, sy, 0, 1, 0, -sy, 0, cy];
  const Rx = [1, 0, 0, 0, cp, -sp, 0, sp, cp];
  const mul = (a: number[], b: number[]) => {
    const r = new Array(9).fill(0);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) for (let k = 0; k < 3; k++) r[i * 3 + j] += a[i * 3 + k] * b[k * 3 + j];
    return r;
  };
  const R = mul(Rx, mul(Ry, base));
  const t = [0, 1, 2].map((i) => -(R[i * 3] * C[0] + R[i * 3 + 1] * C[1] + R[i * 3 + 2] * C[2])) as [number, number, number];
  return { f, R, t, imgW, imgH };
}
const WALL: Pt[] = [[0, H], [W, H], [W, 0], [0, 0]];
const centered = (pts: Pt[]) => pts.map(([u, v]) => [u - imgW / 2, v - imgH / 2] as Pt);

describe('solveHomography', () => {
  it('4개 대응점을 정확히 옮긴다', () => {
    const src: Pt[] = [[0, 0], [1, 0], [1, 1], [0, 1]];
    const dst: Pt[] = [[10, 20], [300, 40], [280, 260], [30, 200]];
    const Hm = solveHomography(src, dst);
    src.forEach((p, i) => {
      const q = applyHomography(Hm, p);
      expect(q[0]).toBeCloseTo(dst[i][0], 6);
      expect(q[1]).toBeCloseTo(dst[i][1], 6);
    });
  });

  it('세 점이 일직선이면 예외를 던진다', () => {
    const line: Pt[] = [[0, 0], [1, 0], [2, 0], [3, 0]];
    expect(() => solveHomography(line, line)).toThrow();
  });
});

describe('카메라 포즈 복원', () => {
  const truth = truthPose();
  const corners = WALL.map(([x, y]) => projectPoint(truth, [x, y, 0]));

  it('가로·세로를 알면 초점거리를 추정한다', () => {
    const est = estimateFocal(solveHomography(WALL, centered(corners)), imgW, imgH);
    expect(est).not.toBeNull();
    expect(est!).toBeCloseTo(f, 3);
  });

  it('정면 사진에서는 초점거리 추정을 포기한다 (null)', () => {
    const front = truthPose(0, 0, [W / 2, H / 2, 12000]);
    const c = WALL.map(([x, y]) => projectPoint(front, [x, y, 0]));
    expect(estimateFocal(solveHomography(WALL, centered(c)), imgW, imgH)).toBeNull();
  });

  it('가로 길이와 초점거리로 세로 길이를 추정한다', () => {
    expect(estimateWallHeight(corners, W, f, imgW, imgH)).toBeCloseTo(H, 3);
  });

  it('벽 밖으로 튀어나온 3D 점까지 재투영 오차 없이 복원한다', () => {
    const pose = recoverPose(corners, W, H, imgW, imgH, f);
    for (const p of [[5000, 3000, 500], [1000, 5000, -200], [9000, 100, 800]] as [number, number, number][]) {
      const a = projectPoint(truth, p), b = projectPoint(pose, p);
      expect(Math.hypot(a[0] - b[0], a[1] - b[1])).toBeLessThan(1e-6);
    }
  });

  it('복원된 회전 행렬은 정규직교이다', () => {
    const { R } = recoverPose(corners, W, H, imgW, imgH, f);
    const col = (j: number) => [R[j], R[3 + j], R[6 + j]];
    const d = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    expect(d(col(0), col(0))).toBeCloseTo(1, 9);
    expect(d(col(1), col(1))).toBeCloseTo(1, 9);
    expect(d(col(0), col(1))).toBeCloseTo(0, 9);
  });

  it('벽은 항상 카메라 앞(z>0)에 있다', () => {
    const pose = recoverPose(corners, W, H, imgW, imgH, f);
    expect(pose.t[2]).toBeGreaterThan(0);
  });
});
