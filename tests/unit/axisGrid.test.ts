import { describe, expect, it } from 'vitest';
import { arrangeByAxisGrid, type GridCard } from '../../src/lib/core/arrange';

// 2026-10-23 사용자: "원근으로 정의된 각축의 격자를 기준으로 정면 판정된 사인물들을 묶어 랩핑하고 축선을 평행하게 그리고 수직하게 그리드화",
// "가장먼 곳을 기준으로 랩핑 축을 수평하게 그리고 수직하게 하면 각 사인물의 순서와 배열치 그리고 겹침도 모두 해결", "사인물과 사인물이 겹친경우는 그대로 겹치게 놓는건 좋지않아"
const card = (id: string, x0: number, y0: number, x1: number, y1: number, w = 1000, h = 500, group: GridCard['group'] = 'front', photo = 0): GridCard => ({ id, w, h, photo, group, box: { x0, y0, x1, y1 } });
const photo = { x: 0, y: 0, w: 10000, h: 7500 };
const overlaps = (r: { x: number; y: number; w: number; h: number }[]) => r.some((a, i) => r.some((b, j) => j > i && a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h));

describe('축 격자 재정렬', () => {
  it('펴진 정면: 같은 줄은 같은 높이, 같은 세로줄은 같은 x, 순서는 사진 그대로', () => {
    // 2행 × 3열 (펴진 좌표에 손으로 그린 오차 조금)
    const cs = [card('a', 0, 0, 900, 400), card('b', 1500, 20, 2400, 410), card('c', 3000, -10, 3900, 400), card('d', 10, 1000, 900, 1400), card('e', 1490, 990, 2400, 1420), card('f', 3010, 1010, 3900, 1400)];
    const at = arrangeByAxisGrid(cs, [photo], 300, 100);
    const p = (id: string) => at.get(id)!;
    expect(p('a').y).toBe(p('b').y); expect(p('b').y).toBe(p('c').y);
    expect(p('d').y).toBe(p('e').y);
    expect(p('d').y).toBeGreaterThan(p('a').y);
    expect(p('a').x).toBe(p('d').x); expect(p('b').x).toBe(p('e').x);
    expect(p('a').x).toBeLessThan(p('b').x); expect(p('b').x).toBeLessThan(p('c').x);
  });

  it('사진 속에서 겹친 사인물(판 위 글자)은 겹치지 않게 — 같은 세로줄 바로 아래 새 줄', () => {
    const cs = [card('board', 0, 0, 4000, 1000, 4000, 1000), card('t1', 200, 200, 1200, 800, 1000, 600), card('t2', 2000, 200, 3000, 800, 1000, 600)];
    const at = arrangeByAxisGrid(cs, [photo], 300, 100);
    const R = cs.map((c) => ({ ...at.get(c.id)!, w: c.w, h: c.h + 100 }));
    expect(overlaps(R)).toBe(false);
    expect(at.get('t1')!.y).toBeGreaterThan(at.get('board')!.y);
    expect(at.get('t1')!.x).toBeLessThan(at.get('t2')!.x);
  });

  it('옆면 묶음은 정면 왼쪽·오른쪽, 아래면은 아래 — 사진 묶음끼리도 겹치지 않는다', () => {
    const cs = [card('f1', 0, 0, 2000, 500), card('L', 0, 0, 300, 600, 600, 900, 'left'), card('R', 0, 0, 300, 600, 600, 900, 'right'), card('B', 0, 0, 500, 200, 800, 300, 'bottom'),
      card('p2', 0, 0, 1000, 500, 1000, 500, 'front', 1)];
    const at = arrangeByAxisGrid(cs, [photo, { x: 3000, y: 0, w: 10000, h: 7500 }], 300, 100);
    expect(at.get('L')!.x).toBeLessThan(at.get('f1')!.x);
    expect(at.get('R')!.x).toBeGreaterThan(at.get('f1')!.x);
    expect(at.get('B')!.y).toBeGreaterThan(at.get('f1')!.y);
    expect(at.get('p2')!.x).toBeGreaterThan(at.get('R')!.x); // 다음 사진 묶음은 오른쪽
    const R = cs.map((c) => ({ ...at.get(c.id)!, w: c.w, h: c.h + 100 }));
    expect(overlaps(R)).toBe(false);
  });

  it('많은 카드(제각각 크기)도 겹치지 않는다', () => {
    const cs = Array.from({ length: 30 }, (_, i) => card('c' + i, (i * 397) % 5000, (i * 211) % 3000, ((i * 397) % 5000) + 300 + (i % 4) * 200, ((i * 211) % 3000) + 200 + (i % 3) * 150, 600 + (i % 5) * 300, 300 + (i % 4) * 200));
    const at = arrangeByAxisGrid(cs, [photo], 300, 100);
    expect(overlaps(cs.map((c) => ({ ...at.get(c.id)!, w: c.w, h: c.h + 100 })))).toBe(false);
  });

  it('사진 없는 카드는 맨 아래 한 줄', () => {
    const cs = [card('a', 0, 0, 900, 400), { ...card('x', 0, 0, 0, 0), photo: null }];
    const at = arrangeByAxisGrid(cs, [photo], 300, 100);
    expect(at.get('x')!.y).toBeGreaterThan(at.get('a')!.y);
  });
});
