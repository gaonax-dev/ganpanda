import { describe, expect, it } from 'vitest';
import { BOARD_PX_PER_MM, boardToList, flatOrigin, listToBoard, mmFromBoardRect } from '../../src/lib/core/boardCards';

describe('보드 평면 구역 (리스트 뷰와 같은 배치)', () => {
  const photos = [{ x: 100, y: 50, width: 1000, w: 2000, h: 1000 }, { x: 1300, y: 0, width: 800, w: 1000, h: 1000 }];
  it('원점은 모든 사진 아래(가장 낮은 사진 바닥 + 80), 왼쪽은 가장 왼쪽 사진', () => {
    expect(flatOrigin(photos)).toEqual({ x: 100, y: 800 + 80 }); // 둘째 사진 바닥 800
    expect(flatOrigin([])).toEqual({ x: 0, y: 0 });
  });
  it('리스트 좌표(mm) ↔ 보드 좌표(px) 는 0.1px/mm 로 왕복한다', () => {
    const o = flatOrigin(photos);
    expect(listToBoard(o, 3000, 600)).toEqual({ x: 100 + 300, y: 880 + 60 });
    expect(boardToList(o, 400, 940)).toEqual({ x: 3000, y: 600 });
    expect(BOARD_PX_PER_MM).toBe(0.1);
  });
  it('빈 곳에 그린 사각형은 10mm 단위 치수로, 최소 100mm', () => {
    expect(mmFromBoardRect(300, 60)).toEqual({ widthMm: 3000, heightMm: 600 });
    expect(mmFromBoardRect(3, 2)).toEqual({ widthMm: 100, heightMm: 100 });
  });
});
