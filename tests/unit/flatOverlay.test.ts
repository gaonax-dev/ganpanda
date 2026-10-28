import { describe, expect, it } from 'vitest';
import { affine, flatEnough, FLAT_MAX } from '../../src/lib/render/flatOverlay';

describe('줌아웃 LOD — 납작한 그림', () => {
  it('화면 크기 × 기기 배율이 FLAT_MAX 이하면 납작한 그림으로 충분하다', () => {
    expect(flatEnough(300, 200, 3)).toBe(true); // 900px
    expect(flatEnough(400, 200, 3)).toBe(false); // 1200px
    expect(flatEnough(FLAT_MAX, 10, 1)).toBe(true);
    expect(flatEnough(FLAT_MAX + 1, 10, 1)).toBe(false);
  });
  it('세 점 아핀 변환은 원래 세 점을 대상 세 점으로 옮긴다', () => {
    const s: [number, number][] = [[0, 0], [100, 0], [0, 50]];
    const d: [number, number][] = [[10, 20], [200, 40], [30, 120]];
    const m = affine(s as never, d as never)!;
    const ap = ([x, y]: [number, number]) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
    s.forEach((p, i) => { const q = ap(p); expect(q[0]).toBeCloseTo(d[i][0]); expect(q[1]).toBeCloseTo(d[i][1]); });
    expect(affine([[0, 0], [1, 1], [2, 2]], d as never)).toBeNull(); // 한 줄 위의 세 점
  });
});

describe('휴대폰 2D 는 늘 납작한 그림 (2026-10-29 아이폰 줌인·줌아웃 반복 다운)', async () => {
  const { flatMaxFor, FLAT_MAX_HI } = await import('../../src/lib/render/flatOverlay');
  it('작게 보이면 1024, 휴대폰에서 크게 보이면 2048, 데스크톱에서 크게 보이면 사인물별 원근 층(null)', () => {
    expect(flatMaxFor(true, true)).toBe(FLAT_MAX);
    expect(flatMaxFor(false, true)).toBe(FLAT_MAX);
    expect(flatMaxFor(true, false)).toBe(FLAT_MAX_HI);
    expect(FLAT_MAX_HI).toBe(2048);
    expect(flatMaxFor(false, false)).toBeNull();
  });
});
