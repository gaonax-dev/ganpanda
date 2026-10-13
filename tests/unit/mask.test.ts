import { describe, expect, it } from 'vitest';
import { maskToPolygon, simplifyPolygon, boundsOf } from '../../src/lib/core/mask';
import { polygonArea } from '../../src/lib/core/perspective';

/** 문자 그림으로 마스크 만들기 ('#' = 1) */
function mask(rows: string[]) {
  const h = rows.length, w = rows[0].length;
  const data = new Uint8Array(w * h);
  rows.forEach((r, y) => [...r].forEach((c, x) => (data[y * w + x] = c === '#' ? 1 : 0)));
  return { data, width: w, height: h };
}

describe('마스크 → 다각형', () => {
  it('사각형 마스크는 네 모서리 다각형이 된다', () => {
    const m = mask([
      '........',
      '..####..',
      '..####..',
      '..####..',
      '........',
    ]);
    const poly = maskToPolygon(m);
    expect(poly.length).toBe(4);
    expect(boundsOf(poly)).toEqual({ x: 2, y: 1, w: 4, h: 3 });
    expect(polygonArea(poly)).toBeCloseTo(12);
  });

  it('여러 조각이면 가장 큰 조각만 (잡음 무시)', () => {
    const m = mask([
      '#.......',
      '..####..',
      '..####..',
      '.......#',
    ]);
    const poly = maskToPolygon(m);
    expect(boundsOf(poly)).toEqual({ x: 2, y: 1, w: 4, h: 2 });
  });

  it('L자 모양은 6개 모서리', () => {
    const m = mask([
      '####....',
      '####....',
      '########',
      '########',
    ]);
    const poly = maskToPolygon(m);
    expect(poly.length).toBe(6);
    expect(polygonArea(poly)).toBeCloseTo(8 + 16);
  });

  it('빈 마스크는 빈 다각형', () => {
    expect(maskToPolygon(mask(['....', '....']))).toEqual([]);
  });

  it('단순화: 허용 오차 안의 중간 점을 없앤다', () => {
    const pts: [number, number][] = [[0, 0], [5, 0.2], [10, 0], [10, 10], [0, 10]];
    expect(simplifyPolygon(pts, 0.5)).toEqual([[0, 0], [10, 0], [10, 10], [0, 10]]);
    expect(simplifyPolygon(pts, 0.1)).toHaveLength(5);
  });

  it('원형에 가까운 마스크도 면적이 보존된다 (±10%)', () => {
    const w = 64, h = 64, data = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if ((x - 32) ** 2 + (y - 32) ** 2 <= 20 ** 2) data[y * w + x] = 1;
    const poly = maskToPolygon({ data, width: w, height: h }, 1.5);
    expect(Math.abs(polygonArea(poly) - Math.PI * 400) / (Math.PI * 400)).toBeLessThan(0.1);
    expect(poly.length).toBeLessThan(80);
  });
});

import { pickMask } from '../../src/lib/core/mask';
describe('후보 마스크 고르기', () => {
  const cand = (cover: number, score: number) => ({ cover, score });
  it('점수가 가장 높은 것을 고르되, 사진의 90% 이상을 덮는 것은 간판이 아니므로 건너뛴다', () => {
    expect(pickMask([cand(0.95, 0.9), cand(0.2, 0.7), cand(0.05, 0.6)])).toBe(1);
    expect(pickMask([cand(0.3, 0.5), cand(0.2, 0.8), cand(0.1, 0.6)])).toBe(1);
  });
  it('모두 너무 크면 그래도 점수 높은 것', () => {
    expect(pickMask([cand(0.95, 0.4), cand(0.99, 0.9)])).toBe(1);
  });
  it('빈 마스크(0%)는 건너뛴다', () => {
    expect(pickMask([cand(0, 0.9), cand(0.1, 0.5)])).toBe(1);
  });
});
