import { describe, expect, it } from 'vitest';
import { closestEdge, insertVertex, midpoints, removeVertex } from '../../src/lib/core/zone';
import type { Pt } from '../../src/lib/core/homography';

const rect: Pt[] = [[0, 0], [100, 0], [100, 50], [0, 50]];

describe('작업 존 꼭짓점 편집', () => {
  it('변의 중간점', () => {
    expect(midpoints(rect)).toEqual([[50, 0], [100, 25], [50, 50], [0, 25]]);
  });

  it('변 i 에 꼭짓점을 넣으면 i 와 i+1 사이에 들어간다', () => {
    expect(insertVertex(rect, 0, [50, 0])).toEqual([[0, 0], [50, 0], [100, 0], [100, 50], [0, 50]]);
    expect(insertVertex(rect, 3, [0, 25])).toEqual([[0, 0], [100, 0], [100, 50], [0, 50], [0, 25]]);
  });

  it('꼭짓점을 지우되 3개 미만으로는 줄이지 않는다', () => {
    expect(removeVertex(rect, 1)).toEqual([[0, 0], [100, 50], [0, 50]]);
    const tri: Pt[] = [[0, 0], [10, 0], [0, 10]];
    expect(removeVertex(tri, 0)).toEqual(tri);
  });

  it('가까운 변 찾기: 허용 거리 안이면 변 번호와 투영점, 아니면 null', () => {
    expect(closestEdge(rect, [60, 3], 5)).toEqual({ edge: 0, point: [60, 0], dist: 3 });
    expect(closestEdge(rect, [98, 20], 5)).toEqual({ edge: 1, point: [100, 20], dist: 2 });
    expect(closestEdge(rect, [50, 25], 5)).toBeNull();
  });
});
