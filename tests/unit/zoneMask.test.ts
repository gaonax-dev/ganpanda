import { describe, expect, it } from 'vitest';
import { clipMask, rasterizePolygon, zoneBounds } from '../../src/lib/core/zoneMask';
import type { Pt } from '../../src/lib/core/homography';

describe('존 외곽 사각형', () => {
  it('여유를 두고 사진 안으로 자른 정수 사각형', () => {
    const z: Pt[] = [[100, 50], [900, 60], [880, 400], [120, 380]];
    expect(zoneBounds(z, 1000, 500, 20)).toEqual({ x: 80, y: 30, w: 840, h: 390 });
    expect(zoneBounds([[0, 0], [10, 0], [10, 10], [0, 10]], 100, 100, 50)).toEqual({ x: 0, y: 0, w: 60, h: 60 });
  });
});

describe('다각형 래스터화 (스캔라인)', () => {
  it('사각형은 면적만큼 채워진다', () => {
    const m = rasterizePolygon([[2, 1], [6, 1], [6, 4], [2, 4]], 8, 5);
    let on = 0; for (const v of m) on += v;
    expect(on).toBe(4 * 3);
    expect(m[1 * 8 + 2]).toBe(1); // (2,1) 안
    expect(m[1 * 8 + 6]).toBe(0); // (6,1) 밖 (반개구간)
    expect(m[0]).toBe(0);
  });
  it('삼각형 면적 ≈ 절반', () => {
    const m = rasterizePolygon([[0, 0], [100, 0], [0, 100]], 100, 100);
    let on = 0; for (const v of m) on += v;
    expect(Math.abs(on - 5000)).toBeLessThan(120);
  });
});

describe('마스크를 존으로 자르기', () => {
  it('존 밖 픽셀은 0, 안은 유지', () => {
    const mask = new Uint8Array(16).fill(1); // 4×4 전부
    const zone = rasterizePolygon([[0, 0], [2, 0], [2, 4], [0, 4]], 4, 4); // 왼쪽 절반
    const out = clipMask(mask, zone);
    let on = 0; for (const v of out) on += v;
    expect(on).toBe(8);
    expect(out[0]).toBe(1); expect(out[3]).toBe(0);
  });
});
