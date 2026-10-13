import { describe, expect, it } from 'vitest';
import { layoutList } from '../../src/lib/core/layout';

const overlap = (a: { x: number; y: number; w: number; h: number }, b: typeof a) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

describe('전개도 자동 배치', () => {
  it('위치를 지정한 항목은 그대로 둔다', () => {
    const r = layoutList([{ id: 'a', w: 1000, h: 500, x: 7000, y: 300 }]);
    expect(r.get('a')).toEqual({ x: 7000, y: 300, w: 1000, h: 500 });
  });

  it('위치가 없는 항목은 서로, 그리고 고정 항목과 겹치지 않게 배치한다', () => {
    const items = [
      { id: 'fixed', w: 3000, h: 1000, x: 0, y: 0 },
      { id: 'a', w: 4000, h: 900 },
      { id: 'b', w: 1200, h: 2100 },
      { id: 'c', w: 600, h: 600 },
    ];
    const r = [...layoutList(items, 500).values()];
    for (let i = 0; i < r.length; i++) for (let j = i + 1; j < r.length; j++) expect(overlap(r[i], r[j])).toBe(false);
  });
});
