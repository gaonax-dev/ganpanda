// 박스 매니퓰레이터 (2026-10-15 사용자: "메니폴레이터는 원근의 값을 기준으로 작동해야한다", "사인물사각툴은 3d가 아니다… 따라다니는 박스만 3d이다",
// "박스만 회전하고 크기는 외곽선만", "새로 생성하는 사인물툴의 메니폴레이터가 엉뚱한곳에 나타나")
import { describe, expect, it } from 'vitest';
import { projectPoint, solveHomography, type CameraPose, type Pt } from '../../src/lib/core/homography';
import { boxGizmoOf, localBoxDir, moveOutline, outlineCenter3, rotateDir, worldAxes } from '../../src/lib/core/boxGizmo';
import { quadCenter } from '../../src/lib/core/manipulator';
import { boxGuideOf } from '../../src/lib/core/manipulator';
import { projectionFromPlane, type WallPlane } from '../../src/lib/core/wallPlane';

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
const A = worldAxes(pose);
const rect = (x: number, y: number, w: number, h: number): Pt[] => [P(x, y + h), P(x + w, y + h), P(x + w, y), P(x, y)];
const wallQ = rect(1000, 3000, 4000, 900);
const maxDist = (a: Pt[], b: Pt[]) => Math.max(...a.map((p, i) => Math.hypot(p[0] - b[i][0], p[1] - b[i][1])));
const proj = (p: number[]) => projectPoint(pose, p as [number, number, number]);
const add = (a: number[], b: number[], k = 1) => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

describe('매니퓰레이터 자리', () => {
  it('외곽선의 원근 중심 = 대각선 교점 (벽면 직사각형이면 벽 위 중심의 사진 위치)', () => {
    const c = quadCenter(wallQ), t = P(3000, 3450);
    expect(Math.hypot(c[0] - t[0], c[1] - t[1])).toBeLessThan(0.5);
  });
  it('3D 중심: 대각선 교점의 시선이 사인물 면과 만나는 점', () => {
    const c = outlineCenter3(cal, cal, wallQ)!;
    expect(c[0]).toBeCloseTo(3000, 0); expect(c[1]).toBeCloseTo(3450, 0); expect(c[2]).toBeCloseTo(0, 3);
  });
});

describe('이동 (외곽선을 원근 축을 따라)', () => {
  const c3 = outlineCenter3(cal, cal, wallQ)!;
  it('X 화살표: 벽을 따라 원근대로 (멀어지면 작아짐), 화살표에서 조금 벗어나 끌어도 X 로만', () => {
    const to = proj(add(c3, A.x, 2000));
    const q = moveOutline(pose, cal, wallQ, A.x, proj(c3), [to[0], to[1] + 20])!;
    expect(maxDist(q, rect(3000, 3000, 4000, 900))).toBeLessThan(2);
  });
  it('Z 화살표: 위로', () => {
    const q = moveOutline(pose, cal, wallQ, A.z, proj(c3), proj(add(c3, A.z, 700)))!;
    expect(maxDist(q, rect(1000, 3700, 4000, 900))).toBeLessThan(1);
  });
  it('Y 화살표: 벽에서 카메라 쪽으로 나오면 외곽선이 커진다', () => {
    const q = moveOutline(pose, cal, wallQ, A.y, proj(c3), proj(add(c3, A.y, 1500)))!;
    const w = (p: Pt[]) => Math.hypot(p[1][0] - p[0][0], p[1][1] - p[0][1]);
    expect(w(q)).toBeGreaterThan(w(wallQ) * 1.1);
  });
});

describe('박스 회전 (박스 방향만, 외곽선은 그대로)', () => {
  const c3 = outlineCenter3(cal, cal, wallQ)!;
  it('Z 고리로 90°: 벽 밖(Y) → 벽 가로(X)', () => {
    const d = rotateDir(pose, c3, A.y, A.z, proj(add(c3, A.y, 500)), proj(add(c3, A.x, 500)));
    expect(Math.abs(dot(d, A.x))).toBeGreaterThan(0.999);
  });
  it('X 고리로 30° 남짓: 아래·위로 기운다, 직각 근처(2°)는 축에 붙는다', () => {
    const c4 = outlineCenter3(cal, cal, rect(4500, 3000, 4000, 900))!; // 카메라와 가로 위치가 달라야 X 고리가 선으로 보이지 않는다
    const d = rotateDir(pose, c4, A.y, A.x, proj(add(c4, A.y, 500)), proj(add(add(c4, A.y, 500 * Math.cos(0.5)), A.z, 500 * Math.sin(0.5))));
    expect(Math.acos(dot(d, A.y)) * 180 / Math.PI).toBeCloseTo(28.6, 0);
    const near = rotateDir(pose, c3, A.y, A.z, proj(add(c3, A.y, 500)), proj(add(add(c3, A.x, 500 * Math.cos(0.02)), A.y, 500 * Math.sin(0.02))));
    expect(Math.abs(dot(near, A.x))).toBeCloseTo(1, 9);
  });
});

describe('박스 방향을 면 좌표로 (3D·상자 가이드가 쓰는 값)', () => {
  it('벽면 사인물 + 벽 밖 방향 = 면의 법선', () => {
    const d = localBoxDir(cal, pose, A.y);
    expect(Math.abs(d[2])).toBeCloseTo(1, 6);
  });
  it('벽면 사인물 + 벽 가로 방향: 면 안의 가로 성분 (기울어진 상자)', () => {
    const d = localBoxDir(cal, pose, A.x);
    expect(Math.abs(d[0])).toBeCloseTo(1, 6);
  });
  it('상자 가이드: 앞면 = 외곽선 꼭짓점을 그 방향으로 깊이만큼 옮긴 점', () => {
    const base: Pt[] = [[1000, 3900], [5000, 3900], [5000, 3000], [1000, 3000]];
    const dir = localBoxDir(cal, pose, [Math.SQRT1_2, 0, Math.SQRT1_2 * A.y[2]]);
    const g = boxGuideOf(projectionFromPlane(cal, imgW, imgH), base, 500, dir)!;
    const want = proj(add([1000, 3900, 0], [Math.SQRT1_2, 0, Math.SQRT1_2 * A.y[2]], 500));
    expect(Math.hypot(g.front[0][0] - want[0], g.front[0][1] - want[1])).toBeLessThan(0.5);
  });
});

describe('매니퓰레이터 그림', () => {
  it('화살표 3·고리 3·평면 판 3 (원근 축)', () => {
    const c3 = outlineCenter3(cal, cal, wallQ)!;
    const g = boxGizmoOf(pose, c3, 600)!;
    for (const k of ['x', 'y', 'z'] as const) { expect(g.arrows[k]).toHaveLength(2); expect(g.rings[k].length).toBeGreaterThan(16); expect(g.planes[k]).toHaveLength(4); }
    const e = proj(add(c3, A.x, 600));
    expect(Math.hypot(g.arrows.x[1][0] - e[0], g.arrows.x[1][1] - e[1])).toBeLessThan(0.5);
  });
});
