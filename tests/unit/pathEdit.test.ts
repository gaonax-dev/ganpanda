// 닫힌 경로(다각형 + 베지어 곡선) 편집 — 존의 작동 원리(변 가운데 □로 꼭짓점 추가, 꼭짓점 끌기·지우기, 최소 3개)를
// 다각형 사인물과 앞가림 마스크에 (2026-11-08 사용자: "존의 작동 원리를 다각형에 적용한다. 존을 폐지하고 존의 작동원리에 베지어곡선 컨트롤러를 추가하고 마스크를 추가한다"
// → (질문) 곡선 = "꼭짓점 두 번 누르기")
import { describe, expect, it } from 'vitest';
import type { Pt } from '../../src/lib/core/homography';
import { flattenPath, insertVertex, mapPath, midpoints, moveHandle, moveVertex, pathBounds, pathD, removeVertex, toggleCurve, type Path } from '../../src/lib/core/pathEdit';

const rect: Path = { pts: [[0, 0], [100, 0], [100, 50], [0, 50]] };

describe('경로 꼭짓점 편집 (존에서 옮김)', () => {
  it('변의 중간점 — 직선은 가운데, 곡선은 곡선 위 t=0.5', () => {
    expect(midpoints(rect)).toEqual([[50, 0], [100, 25], [50, 50], [0, 25]]);
    const c = toggleCurve(rect, 1); // 오른쪽 위 꼭짓점을 곡선으로
    const m = midpoints(c)[0];
    expect(m[1]).not.toBe(0); // 변 0 이 휘었다
  });

  it('변 i 의 가운데에 꼭짓점을 넣는다 (곡선 변은 모양을 그대로 둘로 나눈다)', () => {
    expect(insertVertex(rect, 0).pts).toEqual([[0, 0], [50, 0], [100, 0], [100, 50], [0, 50]]);
    expect(insertVertex(rect, 3).pts).toEqual([[0, 0], [100, 0], [100, 50], [0, 50], [0, 25]]);
    const c = toggleCurve(rect, 1);
    const before = flattenPath(c, 64);
    const split = insertVertex(c, 0);
    expect(split.pts.length).toBe(5);
    expect(split.curves?.length).toBe(5);
    const after = flattenPath(split, 64);
    // 나눈 뒤에도 같은 곡선 — 나눈 점은 원래 곡선 위
    const near = (p: Pt) => Math.min(...before.map((q) => Math.hypot(p[0] - q[0], p[1] - q[1])));
    expect(near(split.pts[1])).toBeLessThan(1.5);
    expect(Math.max(...after.map(near))).toBeLessThan(2);
  });

  it('꼭짓점을 지우되 3개 미만으로는 줄이지 않는다 — 곡선 손잡이도 함께', () => {
    expect(removeVertex(rect, 1).pts).toEqual([[0, 0], [100, 50], [0, 50]]);
    const tri: Path = { pts: [[0, 0], [10, 0], [0, 10]] };
    expect(removeVertex(tri, 0)).toBe(tri);
    const c = removeVertex(toggleCurve(rect, 1), 1);
    expect(c.curves?.every((x) => x === null) ?? true).toBe(true);
  });

  it('꼭짓점을 옮기면 그 곡선 손잡이도 같이 옮겨진다', () => {
    const c = toggleCurve(rect, 1);
    const h = c.curves![1]!;
    const m = moveVertex(c, 1, [110, 10]);
    expect(m.pts[1]).toEqual([110, 10]);
    expect(m.curves![1]!.in).toEqual([h.in[0] + 10, h.in[1] + 10]);
    expect(m.curves![1]!.out).toEqual([h.out[0] + 10, h.out[1] + 10]);
  });
});

describe('베지어 곡선 손잡이 (꼭짓점 두 번 누르기)', () => {
  it('두 번 누르면 이웃을 잇는 방향의 매끈한 손잡이 둘, 다시 누르면 직선 모서리', () => {
    const c = toggleCurve(rect, 1);
    const h = c.curves![1]!;
    // 꼭짓점 [100,0] 의 이웃 [0,0] → [100,50]: 손잡이는 꼭짓점을 지나 한 줄 (매끈)
    const v = c.pts[1];
    const a = [h.in[0] - v[0], h.in[1] - v[1]], b = [h.out[0] - v[0], h.out[1] - v[1]];
    expect(Math.abs(a[0] * b[1] - a[1] * b[0]) / (Math.hypot(a[0], a[1]) * Math.hypot(b[0], b[1]))).toBeLessThan(1e-3); // 한 직선 위 (0.01px 반올림)
    expect(a[0] * b[0] + a[1] * b[1]).toBeLessThan(0); // 반대 방향
    expect(toggleCurve(c, 1).curves?.[1] ?? null).toBeNull();
  });

  it('손잡이를 끌면 반대쪽은 대칭으로, free(Alt)면 그쪽만', () => {
    const c = toggleCurve(rect, 1);
    const s = moveHandle(c, 1, 'out', [130, 20]);
    expect(s.curves![1]!.out).toEqual([130, 20]);
    expect(s.curves![1]!.in).toEqual([70, -20]);
    const f = moveHandle(c, 1, 'out', [130, 20], true);
    expect(f.curves![1]!.in).toEqual(c.curves![1]!.in);
  });

  it('곡선이 없으면 SVG 경로는 직선, 있으면 C 명령', () => {
    expect(pathD(rect)).toBe('M0 0L100 0L100 50L0 50Z');
    expect(pathD(toggleCurve(rect, 1))).toMatch(/C/);
  });

  it('펼친 점(평면 그림·면적·3D 용): 직선 경로는 꼭짓점 그대로, 곡선은 잘게 나눈 점', () => {
    expect(flattenPath(rect)).toEqual(rect.pts);
    expect(flattenPath(toggleCurve(rect, 1), 8).length).toBeGreaterThan(4);
  });

  it('경로 전체 변환(옮기기·크기)은 손잡이도 함께, 바운드 박스는 곡선까지', () => {
    const c = toggleCurve(rect, 1);
    const m = mapPath(c, ([x, y]) => [x * 2, y + 1]);
    expect(m.pts[1]).toEqual([200, 1]);
    expect(m.curves![1]!.out).toEqual([c.curves![1]!.out[0] * 2, c.curves![1]!.out[1] + 1]);
    expect(pathBounds(rect)).toEqual({ x: 0, y: 0, w: 100, h: 50 });
    expect(pathBounds(c).w).toBeGreaterThanOrEqual(100);
  });
});

import { boundsQuad, followQuad, polygonPts } from '../../src/lib/core/pathEdit';
describe('다각형 사인물', () => {
  it('윤곽 점 — 곡선이 있으면 펼친 점, 다각형이 아니면 undefined', () => {
    expect(polygonPts({ shape: 'polygon', polygon: rect.pts })).toEqual(rect.pts);
    expect(polygonPts({ shape: 'polygon', ...{ polygon: rect.pts, curves: toggleCurve(rect, 1).curves } })!.length).toBeGreaterThan(4);
    expect(polygonPts({ shape: 'rect', polygon: rect.pts })).toBeUndefined();
  });
  it('외곽 사각을 옮기면 다각형·손잡이도 따라간다 (전에는 다각형이 제자리에 남았다)', () => {
    const c = toggleCurve(rect, 1);
    const from: Pt[] = [[0, 0], [100, 0], [100, 50], [0, 50]];
    const to: Pt[] = from.map(([x, y]) => [x + 10, y + 20]);
    const f = followQuad({ polygon: c.pts, curves: c.curves }, from, to);
    expect(f.polygon![2]).toEqual([110, 70]);
    expect(f.curves![1]!.out[0]).toBeCloseTo(c.curves![1]!.out[0] + 10, 1);
  });
  it('경로의 바운드 박스 사각형 = quad', () => {
    expect(boundsQuad(rect)).toEqual([[0, 0], [100, 0], [100, 50], [0, 50]]);
  });
});
