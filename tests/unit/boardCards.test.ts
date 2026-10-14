import { describe, expect, it } from 'vitest';
import { BOARD_PX_PER_MM, cardsUnderPhoto, mmFromBoardRect } from '../../src/lib/core/boardCards';

const photo = { x: 100, y: 50, width: 1000, w: 2000, h: 1000 }; // 보드 폭 1000px, 높이 500px → 아래 550

describe('사진 아래 평면도 카드', () => {
  it('왼쪽부터 생성 순으로 한 줄, 축척 0.1px/mm, 사진 아래에 놓인다', () => {
    const { placed, scale } = cardsUnderPhoto(photo, [{ id: 'a', w: 3000, h: 600 }, { id: 'b', w: 1200, h: 2100 }]);
    expect(scale).toBe(BOARD_PX_PER_MM);
    expect(placed.get('a')).toEqual({ x: 100, y: 578, w: 300, h: 60 });
    expect(placed.get('b')).toEqual({ x: 420, y: 578, w: 120, h: 210 });
  });
  it('줄이 사진 폭을 넘으면 그 폭에 맞춰 줄인다', () => {
    const { placed, scale } = cardsUnderPhoto(photo, [{ id: 'a', w: 9000, h: 1000 }, { id: 'b', w: 6000, h: 1000 }]);
    expect(scale).toBeLessThan(BOARD_PX_PER_MM);
    const b = placed.get('b')!;
    expect(b.x + b.w).toBeCloseTo(photo.x + photo.width, 6);
  });
  it('빈 곳에 그린 사각형은 10mm 단위 치수로, 최소 100mm', () => {
    expect(mmFromBoardRect(300, 60)).toEqual({ widthMm: 3000, heightMm: 600 });
    expect(mmFromBoardRect(3, 2)).toEqual({ widthMm: 100, heightMm: 100 });
  });
});
