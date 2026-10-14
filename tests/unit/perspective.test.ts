import { describe, expect, it } from 'vitest';
import { cssMatrix3d, mapPoint, pointInQuad, quadFromDrag, quadToRect, rectToQuad } from '../../src/lib/core/perspective';
import type { Pt } from '../../src/lib/core/homography';

const quad: Pt[] = [[100, 80], [520, 120], [500, 400], [90, 360]];

describe('사각 영역 ↔ 정면 직사각형 (원근)', () => {
  it('rectToQuad 는 직사각형 모서리를 사각 영역 모서리로 보낸다', () => {
    const H = rectToQuad(300, 200, quad);
    const rect: Pt[] = [[0, 0], [300, 0], [300, 200], [0, 200]];
    rect.forEach((p, i) => {
      const q = mapPoint(H, p);
      expect(q[0]).toBeCloseTo(quad[i][0], 6);
      expect(q[1]).toBeCloseTo(quad[i][1], 6);
    });
  });

  it('quadToRect 는 그 역변환', () => {
    const H = quadToRect(quad, 300, 200);
    const q = mapPoint(H, quad[2]);
    expect(q[0]).toBeCloseTo(300, 6);
    expect(q[1]).toBeCloseTo(200, 6);
  });

  it('CSS matrix3d 가 같은 원근 변환을 표현한다', () => {
    const H = rectToQuad(300, 200, quad);
    const m = cssMatrix3d(H).match(/matrix3d\((.*)\)/)![1].split(',').map(Number);
    // 열 우선 4x4 행렬에 (x, y, 0, 1) 적용
    const apply = ([x, y]: Pt): Pt => {
      const X = m[0] * x + m[4] * y + m[12];
      const Y = m[1] * x + m[5] * y + m[13];
      const W = m[3] * x + m[7] * y + m[15];
      return [X / W, Y / W];
    };
    const p = apply([150, 100]);
    const q = mapPoint(H, [150, 100]);
    expect(p[0]).toBeCloseTo(q[0], 6);
    expect(p[1]).toBeCloseTo(q[1], 6);
  });

  it('점이 사각 영역 안에 있는지 판정', () => {
    expect(pointInQuad([300, 250], quad)).toBe(true);
    expect(pointInQuad([50, 50], quad)).toBe(false);
  });

  it('드래그 두 점으로 좌상·우상·우하·좌하 순서의 사각형을 만든다', () => {
    expect(quadFromDrag([50, 40], [10, 90])).toEqual([[10, 40], [50, 40], [50, 90], [10, 90]]);
  });
});

import { ellipseInQuad } from '../../src/lib/core/perspective';
describe('원근 속 원형 영역', () => {
  it('정면 보정하면 사각 영역에 내접하는 타원이 된다', () => {
    const pts = ellipseInQuad(quad, 32);
    expect(pts).toHaveLength(32);
    const H = quadToRect(quad, 2, 1);
    for (const p of pts) {
      const [x, y] = mapPoint(H, p);
      // (x-1)²/1 + (y-0.5)²/0.25 = 1
      expect((x - 1) ** 2 + (y - 0.5) ** 2 / 0.25).toBeCloseTo(1, 6);
    }
  });
});

describe('퇴화된 사각형', () => {
  it('ellipseInQuad 는 예외 대신 사각형 윤곽을 돌려준다', () => {
    const flat: Pt[] = [[0, 0], [1, 0], [2, 0], [3, 0]];
    expect(ellipseInQuad(flat)).toEqual(flat);
  });
});

import { roundedInQuad, roundedRect } from '../../src/lib/core/perspective';
describe('둥근 사각 영역 (모서리 비율 0~0.5)', () => {
  it('비율 0 은 사각형 그대로', () => {
    expect(roundedInQuad(quad, 0)).toEqual(quad);
  });
  it('정사각형에 비율 0.5 → 원 (중심 거리가 일정)', () => {
    const sq: Pt[] = [[0, 0], [100, 0], [100, 100], [0, 100]];
    const pts = roundedInQuad(sq, 0.5, 8);
    expect(pts.length).toBeGreaterThan(16);
    for (const [x, y] of pts) expect(Math.hypot(x - 50, y - 50)).toBeCloseTo(50, 6);
  });
  it('가로로 긴 사각형에 비율 0.5 → 짧은 변 기준 반지름(알약 모양), 모든 점이 영역 안', () => {
    const pts = roundedRect(200, 100, 0.5, 8);
    for (const [x, y] of pts) { expect(x).toBeGreaterThanOrEqual(-1e-9); expect(x).toBeLessThanOrEqual(200 + 1e-9); expect(y).toBeGreaterThanOrEqual(-1e-9); expect(y).toBeLessThanOrEqual(100 + 1e-9); }
    // 좌우 끝은 반원: x=0 인 점은 y=50 하나뿐
    expect(pts.filter(([x]) => Math.abs(x) < 1e-9).every(([, y]) => Math.abs(y - 50) < 1e-9)).toBe(true);
    // 위쪽 직선 구간이 남는다 (y=0 인 점이 2개 이상)
    expect(pts.filter(([, y]) => Math.abs(y) < 1e-9).length).toBeGreaterThanOrEqual(2);
  });
  it('원근 사각형에서는 정면 보정하면 둥근 사각형이 된다', () => {
    const pts = roundedInQuad(quad, 0.25, 6);
    const H = quadToRect(quad, 200, 100);
    const front = pts.map((p) => mapPoint(H, p));
    for (const [x, y] of front) { expect(x).toBeGreaterThan(-1e-6); expect(x).toBeLessThan(200 + 1e-6); expect(y).toBeGreaterThan(-1e-6); expect(y).toBeLessThan(100 + 1e-6); }
    // 모서리 (0,0) 근처에는 점이 없다 (반지름 25 만큼 깎임)
    expect(front.some(([x, y]) => x < 7 && y < 7)).toBe(false);
  });
  it('찌그러진 사각형은 예외 대신 사각형 윤곽', () => {
    const flat: Pt[] = [[0, 0], [1, 0], [2, 0], [3, 0]];
    expect(roundedInQuad(flat, 0.5)).toEqual(flat);
  });
});
