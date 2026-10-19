// 사진 보드 카드 정렬 (2026-10-20 사용자: "카드 배치가 우선 사진 배치의 위치를 유지한다. 현재는 가로로 사진이 1장씩있다. 그리고 사진안의 사인물 배열을 한다. 위치는 1열 층 2열 층으로 정렬한다.")
import { describe, expect, it } from 'vitest';
import { arrangeUnderPhotos, floorRows } from '../../src/lib/core/arrange';

describe('floorRows — 사진 안 사인물을 층별 줄로: 1열 = 가장 아래 층, 줄 안은 왼쪽부터', () => {
  it('세로 자리가 겹치는 것끼리 한 층, 아래 층부터', () => {
    const rows = floorRows([
      { id: 'door', x0: 500, y0: 600, x1: 700, y1: 1000 },
      { id: 'right', x0: 900, y0: 100, x1: 1400, y1: 300 },
      { id: 'left', x0: 100, y0: 120, x1: 600, y1: 320 },
      { id: 'window', x0: 900, y0: 650, x1: 1100, y1: 900 },
    ]);
    expect(rows).toEqual([['door', 'window'], ['left', 'right']]);
  });
  it('여러 층에 걸친 긴 사인물(세로 현수막)이 층을 삼키지 않는다 — 가운데 높이의 층에', () => {
    const rows = floorRows([
      { id: 'a1', x0: 0, y0: 800, x1: 200, y1: 1000 },
      { id: 'tall', x0: 300, y0: 100, x1: 400, y1: 1000 },
      { id: 'b2', x0: 600, y0: 100, x1: 800, y1: 300 },
    ]);
    expect(rows).toEqual([['a1'], ['tall'], ['b2']]);
  });
});

describe('arrangeUnderPhotos — 카드 묶음은 각 사진 아래(사진의 가로 자리 유지), 묶음 안은 층별 줄', () => {
  const card = (id: string, w: number, h: number, photo: number | null, x0 = 0, y0 = 0, x1 = 100, y1 = 50) => ({ id, w, h, photo, box: { x0, y0, x1, y1 } });
  it('사진 0 은 x=0, 사진 1 은 그 사진 자리 — 1열(아래 층) 다음 2열', () => {
    const out = arrangeUnderPhotos([
      card('B', 1000, 500, 0, 100, 100, 300, 300),
      card('A', 2000, 800, 0, 100, 700, 300, 900),
      card('C', 1500, 600, 0, 400, 120, 600, 320),
      card('D', 1200, 400, 1),
    ], [0, 15000], 300);
    expect(out.get('A')).toEqual({ x: 0, y: 0 });
    expect(out.get('B')).toEqual({ x: 0, y: 800 + 300 });
    expect(out.get('C')).toEqual({ x: 1000 + 300, y: 800 + 300 });
    expect(out.get('D')).toEqual({ x: 15000, y: 0 });
  });
  it('묶음이 다음 사진 자리를 넘으면 다음 묶음을 오른쪽으로 밀고, 사진 없는 카드는 모두의 아래', () => {
    const out = arrangeUnderPhotos([card('wide', 9000, 1000, 0), card('next', 1000, 500, 1), card('free', 700, 700, null)], [0, 5000], 300);
    expect(out.get('next')).toEqual({ x: 9000 + 600, y: 0 });
    expect(out.get('free')).toEqual({ x: 0, y: 1000 + 600 });
  });
});
