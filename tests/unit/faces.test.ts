// 세 면 구조 (2026-10-15 사용자: "오직 한쪽면만 기준으로 잡고 있다. 삼면을 구현하지 못한건가?" → "삼면 구조로 진행해줘")
// 사인물 정면 축(매니퓰레이터 축 기준): y = 벽 밖을 봄(벽면), x = 벽을 따라 봄(벽에 직각인 세로면), z = 위·아래를 봄(수평면)
import { describe, expect, it } from 'vitest';
import { projectPoint, solveHomography, type CameraPose, type Pt } from '../../src/lib/core/homography';
import { faceOf, faceSizeOf, sideWallOf, signPlaneOf, type WallPlane } from '../../src/lib/core/wallPlane';
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

describe('정면 축은 상자 방향만 — 사인물 면은 구도로 정한 그대로 (2026-10-15 사용자: "정면을 바꾸면 박스 구조만 변경되고 원 사인물은 형태를 유지해야한다", "사인물사각툴은 3d가 아니다… 따라다니는 박스만 3d이다", "박스만 회전하고 크기는 외곽선만")', async () => {
  const { boxDirOf, contentSizeOf } = await import('../../src/lib/core/wallPlane');
  const { worldAxes } = await import('../../src/lib/core/boxGizmo');
  const A = worldAxes(pose);
  const close = (a: number[], b: number[]) => Math.abs(Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) - 1) < 1e-6;
  it('정면 축을 골라도 면·크기는 그대로', () => {
    for (const faceAxis of ['x', 'y', 'z'] as const) {
      expect(faceOf(obj(sideQ, { faceAxis }), cal)).toEqual(faceOf(obj(sideQ), cal));
      expect(contentSizeOf(obj(sideQ, { faceAxis }), cal)).toEqual(contentSizeOf(obj(sideQ), cal));
    }
    expect(signPlaneOf(obj(sideQ), cal)).toEqual(faceOf(obj(sideQ), cal)!.plane);
  });
  it('상자 방향: 자동은 면의 법선(돌출 간판 = X, 벽면 = Y, 어닝 = Z), 고르면 그 축, 회전한 방향이 있으면 그것', () => {
    expect(close(boxDirOf(obj(sideQ), cal)!, A.x)).toBe(true);
    expect(close(boxDirOf(obj(wallQ), cal)!, A.y)).toBe(true);
    expect(close(boxDirOf(obj(soffitQ), cal)!, A.z)).toBe(true);
    expect(close(boxDirOf(obj(sideQ, { faceAxis: 'y' }), cal)!, A.y)).toBe(true);
    const d = [0.6, 0, 0.8 * A.y[2]] as [number, number, number];
    expect(boxDirOf(obj(sideQ, { faceAxis: 'y', boxDir: d }), cal)).toEqual(d);
  });
  it('상자 방향은 사인물에서 카메라 쪽으로 (어닝 아랫면은 아래로)', async () => {
    const { outlineCenter3 } = await import('../../src/lib/core/boxGizmo');
    const C = [0, 1, 2].map((i) => -(pose.R[i] * pose.t[0] + pose.R[3 + i] * pose.t[1] + pose.R[6 + i] * pose.t[2])); // 카메라 위치(벽 좌표)
    for (const o of [obj(sideQ), obj(wallQ), obj(soffitQ), obj(wallQ, { faceAxis: 'x' })]) {
      const d = boxDirOf(o, cal)!, c = outlineCenter3(cal, faceOf(o, cal)?.plane ?? cal, o.quad)!;
      expect(d[0] * (C[0] - c[0]) + d[1] * (C[1] - c[1]) + d[2] * (C[2] - c[2])).toBeGreaterThan(0);
    }
    expect(boxDirOf(obj(soffitQ), cal)![1]).toBeLessThan(0);
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

describe('사인물 자체 크기는 정면 축과 무관 (2026-10-15 사용자: "정면을 바꾸면 박스 구조만 변경되고 원 사인물은 형태를 유지해야한다")', async () => {
  const { contentSizeOf } = await import('../../src/lib/core/wallPlane');
  it('구도로 알아본 면에서 잰 크기 — 입력 치수가 그린 비율과 달라도 같다 (글자가 찌그러지지 않게)', () => {
    const auto = contentSizeOf(obj(sideQ), cal)!;
    expect(Math.abs(auto.w - 900) / 900).toBeLessThan(0.05);
    expect(contentSizeOf(obj(sideQ, { widthMm: 1200, heightMm: 600 }), cal)).toEqual(auto);
  });
});

describe('3D·상자 가이드가 쓰는 박스 방향 (사인물 면 좌표)', async () => {
  const { boxLocalDirOf } = await import('../../src/lib/core/wallPlane');
  it('벽면 사인물: 자동이면 면의 법선, X 를 고르면 면 안의 가로 방향(기울어진 상자)', () => {
    const own = signPlaneOf(obj(wallQ), cal)!;
    const auto = boxLocalDirOf(obj(wallQ), own, cal, imgW, imgH)!;
    expect(Math.abs(auto[2])).toBeCloseTo(1, 6);
    const x = boxLocalDirOf(obj(wallQ, { faceAxis: 'x' }), own, cal, imgW, imgH)!;
    expect(Math.abs(x[0])).toBeCloseTo(1, 6);
  });
  it('원근 설정이 없으면 null (면의 법선으로 그림)', () => {
    expect(boxLocalDirOf(obj(wallQ), cal, null, imgW, imgH)).toBeNull();
  });
});

// 재정렬의 옆면 묶음 (2026-10-24 사용자: "사인물들을 사진에서 판정할때 정면을 파악하지 않는거 같고 사인물이 왼쪽 끝에 있는데 오른쪽끝에 오기도 한다"):
// 옆면(x) 사인물이 왼쪽 벽인지 오른쪽 벽인지는 사진 가운데가 아니라 카메라 기준 — 벽 가로(x)에서 카메라보다 왼쪽이면 왼쪽 벽
describe('옆면 사인물의 왼쪽·오른쪽 벽', () => {
  it('카메라(x=3000)보다 오른쪽(x=7500)에 직각으로 선 간판 = 오른쪽 벽', () => {
    expect(sideWallOf(obj(sideQ), cal)).toBe('right');
  });
  it('카메라(x=3000)보다 왼쪽(x=1000)에 선 간판 = 왼쪽 벽 — 사진 가운데보다 오른쪽에 찍혀도', () => {
    const left = order(jitter([P3(1000, 2600, 0), P3(1000, 2600, 1500), P3(1000, 1800, 1500), P3(1000, 1800, 0)]));
    expect(faceOf(obj(left), cal)?.axis).toBe('x');
    expect(left.reduce((t, p) => t + p[0], 0) / 4).toBeGreaterThan(imgW / 2); // 사진 가운데보다 오른쪽에 찍힘 → 전 규칙(사진 가운데)은 '오른쪽'
    expect(sideWallOf(obj(left), cal)).toBe('left');
  });
  it('정면(y) 사인물·원근 없음은 판정하지 않는다', () => {
    expect(sideWallOf(obj(wallQ), cal)).toBeNull();
    expect(sideWallOf(obj(sideQ), null)).toBeNull();
  });
});
