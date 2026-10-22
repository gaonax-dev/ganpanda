import { describe, expect, it } from 'vitest';
import { wallPlaneOf } from '../../src/lib/core/wallPlane';
import { applyHomography } from '../../src/lib/core/homography';
import type { SignObject } from '../../src/lib/core/model';

// 2026-10-22 사용자: "3d에서 누락이 있네" — 정면에 가깝게 찍은 사진은 카메라 보정 행렬(px→mm)의 값이 아주 작아(~1e-4)
// 역행렬 판정(행렬식 < 1e-12)이 실패해 벽면이 없다고 보고 그 사진의 3D 를 통째로 건너뛰었다
describe('벽면: 작은 배율의 보정 행렬도 역행렬', () => {
  const H = [0.5, 0.01, -100, 0.005, 0.5, -50, 0.00001, 0.00002, 1];
  const quad: [number, number][] = [[100, 100], [900, 100], [900, 500], [100, 500]];
  const obj = { id: 'a', photoId: 'p', name: 'a', shape: 'rect', quad, sheetIds: [] } as unknown as SignObject;
  it('행렬 전체에 1e-4 를 곱해도(같은 변환) 벽면이 나오고, 같은 점으로 보낸다', () => {
    const base = wallPlaneOf([obj], { metric: true, H } as never)!;
    const small = wallPlaneOf([obj], { metric: true, H: H.map((v) => v * 1e-4) } as never);
    expect(base).not.toBeNull();
    expect(small).not.toBeNull();
    const p = applyHomography(small!.H, [100, 200]), q = applyHomography(base.H, [100, 200]);
    expect(p[0]).toBeCloseTo(q[0], 6); expect(p[1]).toBeCloseTo(q[1], 6);
  });
});

describe('벽면: 풀 수 없는 보정이면 치수 있는 사인물 기준으로', () => {
  it('보정 행렬이 0 이어도 치수 있는 사인물이 있으면 벽면이 있다', () => {
    const quad: [number, number][] = [[100, 100], [900, 100], [900, 500], [100, 500]];
    const door = { id: 'd', photoId: 'p', name: '도어', shape: 'rect', quad, sheetIds: [], widthMm: 900, heightMm: 2100 } as unknown as SignObject;
    expect(wallPlaneOf([door], { metric: true, H: [0, 0, 0, 0, 0, 0, 0, 0, 0] } as never)).not.toBeNull();
  });
});
