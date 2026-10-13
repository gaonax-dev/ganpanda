import { describe, expect, it } from 'vitest';
import { textToShapes } from '../../src/lib/core/textShapes';
import { font } from './fixtures';

describe('textToShapes', () => {
  it('구멍이 있는 글자(O)는 바깥 1개 + 구멍 1개', () => {
    const shapes = textToShapes(font, 'O');
    expect(shapes).toHaveLength(1);
    expect(shapes[0].holes).toHaveLength(1);
  });

  it('구멍이 없는 글자(L)는 구멍 없음', () => {
    const shapes = textToShapes(font, 'L');
    expect(shapes).toHaveLength(1);
    expect(shapes[0].holes).toHaveLength(0);
  });

  it('한글 "앙"의 ㅇ 두 개는 각각 구멍을 가진다', () => {
    const holes = textToShapes(font, '앙').reduce((n, s) => n + s.holes.length, 0);
    expect(holes).toBe(2);
  });

  it('공백만 있으면 빈 배열', () => {
    expect(textToShapes(font, '   ')).toEqual([]);
  });

  it('자간이 커지면 전체 폭이 넓어진다', () => {
    const width = (ls: number) => {
      const xs = textToShapes(font, 'AB', ls).flatMap((s) => s.getPoints().map((p) => p.x));
      return Math.max(...xs) - Math.min(...xs);
    };
    expect(width(0.2)).toBeCloseTo(width(0) + 200, 0);
  });
});
