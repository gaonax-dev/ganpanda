import { describe, expect, it } from 'vitest';
import { snapEdge } from '../../src/lib/core/calibration';
import type { Pt } from '../../src/lib/core/homography';

describe('모서리 보정 (AI 평가)', () => {
  // 100×100 회색 이미지, x=60 에 세로 모서리 (왼쪽 밝음, 오른쪽 어두움)
  const w = 100, h = 100;
  const gray = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) gray[y * w + x] = x < 60 ? 220 : 40;

  it('4px 어긋난 세로 선을 모서리에 붙인다', () => {
    const line = { a: [64, 10] as Pt, b: [64, 90] as Pt };
    const r = snapEdge({ data: gray, width: w, height: h }, line, 8);
    expect(Math.abs(r.a[0] - 60)).toBeLessThanOrEqual(1);
    expect(Math.abs(r.b[0] - 60)).toBeLessThanOrEqual(1);
    expect(r.confidence).toBeGreaterThan(0.5);
    expect(Math.abs(r.offset)).toBeCloseTo(4, 0);
  });

  it('모서리가 없는 곳은 신뢰도가 낮고 움직이지 않는다', () => {
    const line = { a: [20, 10] as Pt, b: [20, 90] as Pt };
    const r = snapEdge({ data: gray, width: w, height: h }, line, 8);
    expect(r.confidence).toBeLessThan(0.2);
    expect(r.a[0]).toBe(20);
  });
});
