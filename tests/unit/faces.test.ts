// 세 면 구조 (2026-10-15 사용자: "오직 한쪽면만 기준으로 잡고 있다. 삼면을 구현하지 못한건가?" → "삼면 구조로 진행해줘")
// 사인물 정면 축(매니퓰레이터 축 기준): y = 벽 밖을 봄(벽면), x = 벽을 따라 봄(벽에 직각인 세로면), z = 위·아래를 봄(수평면)
import { describe, expect, it } from 'vitest';
import { projectPoint, solveHomography, type CameraPose, type Pt } from '../../src/lib/core/homography';
import { faceOf, faceSizeOf, signPlaneOf, type WallPlane } from '../../src/lib/core/wallPlane';
import { outOfWall } from '../../src/lib/core/manipulator';
import type { SignObject } from '../../src/lib/core/model';

const imgW = 4000, imgH = 3000, f = 3000, yaw = 0.45;
const pose: CameraPose = (() => {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const R = [c, 0, -s, 0, -1, 0, -s, 0, -c];
  const C = [3000, 2000, 8000];
  const t = [0, 1, 2].map((i) => -(R[i * 3] * C[0] + R[i * 3 + 1] * C[1] + R[i * 3 + 2] * C[2])) as [number, number, number];
  return { f, R, t, imgW, imgH };
})();
const P = (x: number, y: number): Pt => projectPoint(pose, [x, y, 0]);
const wr: Pt[] = [[0, 0], [9000, 0], [9000, 6000], [0, 6000]];
const cal: WallPlane = { H: solveHomography(wr, wr.map(([x, y]) => P(x, y))), Hinv: solveHomography(wr.map(([x, y]) => P(x, y)), wr), source: 'calibration', pose };
const n = outOfWall(cal);
/** 벽 좌표 (가로 x, 높이 y, 벽에서 나온 거리 out) → 사진 px */
const P3 = (x: number, y: number, out: number): Pt => projectPoint(pose, [x, y, out * n]);
const obj = (quad: Pt[], o: Partial<SignObject> = {}): SignObject => ({ id: 'o', photoId: 'p', name: 'x', shape: 'rect', quad, sheetIds: [], createdAt: 0, ...o });
/** 네 점을 사진에서 TL,TR,BR,BL 순으로 (위 두 점 중 왼쪽이 TL) */
const order = (pts: Pt[]): Pt[] => {
  const byY = [...pts].sort((a, b) => a[1] - b[1]);
  const [t1, t2] = byY.slice(0, 2).sort((a, b) => a[0] - b[0]), [b1, b2] = byY.slice(2).sort((a, b) => a[0] - b[0]);
  return [t1, t2, b2, b1];
};
const jitter = (q: Pt[]): Pt[] => q.map(([x, y], i) => [x + [3, -2, 2, -3][i], y + [-2, 3, -3, 2][i]]);
const normalOf = (pl: WallPlane) => { const R = pl.pose!.R; return [R[2], R[5], R[8]]; };
const col = (i: number) => [pose.R[i], pose.R[3 + i], pose.R[6 + i]]; // 벽 좌표 축의 카메라 방향: 0 가로, 1 높이, 2 벽 밖
const absDot = (a: number[], b: number[]) => Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2]);

// 벽에 직각으로 붙은 돌출 간판(벽 x=7500, 높이 3000~3900, 벽에서 0~900) — 카메라(x=3000)에서 비스듬히 보이는 자리
const side = jitter([P3(7500, 3900, 0), P3(7500, 3900, 900), P3(7500, 3000, 900), P3(7500, 3000, 0)]);
const sideQ = order(side);
// 어닝 아랫면(높이 4500, 가로 1000~4000, 벽에서 0~1500) — 카메라(높이 2000)보다 위라 아랫면이 보인다
const soffitQ = order(jitter([P3(1000, 4500, 0), P3(4000, 4500, 0), P3(4000, 4500, 1500), P3(1000, 4500, 1500)]));
const wallQ: Pt[] = [P(1000, 3900), P(5000, 3900), P(5000, 3000), P(1000, 3000)];

describe('세 면: 정면 축을 구도로 알아본다', () => {
  it('벽에 붙은 간판 = y (원근 설정의 벽면 그대로)', () => {
    const f = faceOf(obj(wallQ), cal)!;
    expect(f.axis).toBe('y');
    expect(f.plane).toBe(cal);
  });
  it('벽에 직각인 돌출 간판 = x: 면 법선이 벽 가로 방향, 크기는 그 면에서 잰 값', () => {
    const f = faceOf(obj(sideQ), cal)!;
    expect(f.axis).toBe('x');
    expect(absDot(normalOf(f.plane), col(0))).toBeGreaterThan(0.99);
    const s = faceSizeOf(obj(sideQ), cal)!;
    expect(Math.abs(s.widthMm - 900) / 900).toBeLessThan(0.05);
    expect(Math.abs(s.heightMm - 900) / 900).toBeLessThan(0.05);
  });
  it('어닝 아랫면 = z: 면 법선이 높이 방향, 크기는 그 면에서 잰 값 (가로 3000 × 깊이 1500)', () => {
    const f = faceOf(obj(soffitQ), cal)!;
    expect(f.axis).toBe('z');
    expect(absDot(normalOf(f.plane), col(1))).toBeGreaterThan(0.99);
    const s = faceSizeOf(obj(soffitQ), cal)!;
    expect(Math.abs(s.widthMm - 3000) / 3000).toBeLessThan(0.05);
    expect(Math.abs(s.heightMm - 1500) / 1500).toBeLessThan(0.05);
  });
  it('어느 면의 직사각형도 아닌 외곽선은 면 없음(사인물 자신의 면으로 그림)', () => {
    const q: Pt[] = [[1000, 1000], [1600, 1150], [1500, 1500], [1100, 1300]];
    expect(faceOf(obj(q), cal)).toBeNull();
    expect(signPlaneOf(obj(q), cal)!.source).not.toBe('calibration');
  });
  it('원근 설정이 없으면 면 없음', () => {
    expect(faceOf(obj(wallQ), null)).toBeNull();
  });
});

describe('세 면: 사용자가 정면 축을 고르면 그 면 (외곽선·원근 기준은 그대로)', () => {
  it('돌출 간판 외곽선을 y 로 고르면 벽면', () => {
    expect(faceOf(obj(sideQ, { faceAxis: 'y' }), cal)!.plane).toBe(cal);
  });
  it('정면으로 그린 벽면 직사각형을 x 로 고를 수는 없다(벽에 직각인 면의 사진일 수 없음) → 면 없음', () => {
    expect(faceOf(obj(wallQ, { faceAxis: 'x' }), cal)).toBeNull();
  });
  it('signPlaneOf 도 같은 면을 쓴다 (3D·상자)', () => {
    expect(signPlaneOf(obj(sideQ), cal)).toEqual(faceOf(obj(sideQ), cal)!.plane);
    expect(signPlaneOf(obj(soffitQ, { faceAxis: 'z' }), cal)).toEqual(faceOf(obj(soffitQ), cal)!.plane);
  });
});

describe('세 면: 치수 추정도 그 면에서', async () => {
  const { measurePhoto } = await import('../../src/lib/core/measure');
  const calib = { H: cal.Hinv, sx: 1, sy: 1, metric: true, pose, perRef: [], warnings: [] };
  it('벽에 직각인 돌출 간판·어닝 아랫면은 자기 면에서 잰 크기, 벽면 간판은 벽면에서 잰 크기', () => {
    const objs = [obj(wallQ, { id: 'w' }), obj(sideQ, { id: 's' }), obj(soffitQ, { id: 'a' })];
    const m = measurePhoto(objs, imgW, imgH, calib, (o) => faceSizeOf(o, cal));
    const est = (id: string) => m.get(id)!.estimate!;
    expect(est('w').widthMm).toBeCloseTo(4000, -1); expect(est('w').heightMm).toBeCloseTo(900, -1);
    expect(Math.abs(est('s').widthMm - 900) / 900).toBeLessThan(0.05);
    expect(Math.abs(est('a').widthMm - 3000) / 3000).toBeLessThan(0.05);
    expect(Math.abs(est('a').heightMm - 1500) / 1500).toBeLessThan(0.05);
  });
});
