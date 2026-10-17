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

// 평면 구역 전체 크기 조절 (2026-10-17 사용자: "사진보드에 있는 평면도 전체 사이즈 조절 가능하게 하고 싶")
import { FLAT_SCALE_MAX, FLAT_SCALE_MIN, clampFlatScale, flatBounds, scaleFromHandle } from '../../src/lib/core/boardCards';

describe('평면 구역 크기 (px/mm, 프로젝트 설정 flatScale)', () => {
  const o = { x: 100, y: 880 };
  it('축척을 주면 그 값으로 왕복한다 (기본 0.1)', () => {
    expect(listToBoard(o, 3000, 600, 0.2)).toEqual({ x: 700, y: 1000 });
    expect(boardToList(o, 700, 1000, 0.2)).toEqual({ x: 3000, y: 600 });
    expect(mmFromBoardRect(600, 120, 0.2)).toEqual({ widthMm: 3000, heightMm: 600 });
  });
  it('범위는 0.02~0.5, 잘못된 값은 기본', () => {
    expect(clampFlatScale(0.001)).toBe(FLAT_SCALE_MIN);
    expect(clampFlatScale(9)).toBe(FLAT_SCALE_MAX);
    expect(clampFlatScale(NaN)).toBe(BOARD_PX_PER_MM);
    expect(clampFlatScale(0.25)).toBe(0.25);
  });
  it('평면 구역 경계(보드 px): 모든 카드를 감싸는 사각', () => {
    const cards = [{ x: 0, y: 0, w: 3000, h: 600 }, { x: 3600, y: 0, w: 1200, h: 2100 }];
    expect(flatBounds(o, cards, 0.1)).toEqual({ x: 100, y: 880, w: 480, h: 210 });
    expect(flatBounds(o, [], 0.1)).toBeNull();
  });
  it('모서리 손잡이를 끌면 원점에서의 거리 비율로 축척이 바뀐다 (가로 기준)', () => {
    const cards = [{ x: 0, y: 0, w: 3000, h: 600 }];
    // 손잡이(오른쪽 끝 x = 400) 를 x = 700 으로 → 600px / 3000mm = 0.2
    expect(scaleFromHandle(o, cards, 700)).toBeCloseTo(0.2);
    expect(scaleFromHandle(o, cards, 100)).toBe(FLAT_SCALE_MIN); // 원점 안쪽
  });
});
