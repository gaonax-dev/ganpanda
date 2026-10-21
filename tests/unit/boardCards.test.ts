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
import { FLAT_SCALE_MAX, FLAT_SCALE_MIN, autoFlatScale, clampFlatScale, flatBounds, offsetKeepingPivot, scaleFromHandle } from '../../src/lib/core/boardCards';

describe('평면 구역 크기 (px/mm, 프로젝트 설정 flatScale)', () => {
  const o = { x: 100, y: 880 };
  it('축척을 주면 그 값으로 왕복한다 (기본 0.1)', () => {
    expect(listToBoard(o, 3000, 600, 0.2)).toEqual({ x: 700, y: 1000 });
    expect(boardToList(o, 700, 1000, 0.2)).toEqual({ x: 3000, y: 600 });
    expect(mmFromBoardRect(600, 120, 0.2)).toEqual({ widthMm: 3000, heightMm: 600 });
  });
  it('범위는 사실상 없음(0.001~20, 2026-10-22 "리밋이 있다. 해제해주고"), 잘못된 값은 기본', () => {
    expect(clampFlatScale(0)).toBe(FLAT_SCALE_MIN);
    expect(clampFlatScale(99)).toBe(FLAT_SCALE_MAX);
    expect(clampFlatScale(5)).toBe(5);
    expect(clampFlatScale(NaN)).toBe(BOARD_PX_PER_MM);
    expect(clampFlatScale(0.25)).toBe(0.25);
  });
  it('평면 구역 경계(보드 px): 모든 카드를 감싸는 사각', () => {
    const cards = [{ x: 0, y: 0, w: 3000, h: 600 }, { x: 3600, y: 0, w: 1200, h: 2100 }];
    expect(flatBounds(o, cards, 0.1)).toEqual({ x: 100, y: 880, w: 480, h: 210 });
    expect(flatBounds(o, [], 0.1)).toBeNull();
  });
  it('모서리 손잡이를 끌면 피봇(✥ = 카드 묶음 왼쪽 위)에서의 거리 비율로 축척이 바뀐다 (가로 기준)', () => {
    const cards = [{ x: 0, y: 0, w: 3000, h: 600 }];
    // 손잡이(오른쪽 끝 x = 400) 를 x = 700 으로 → 600px / 3000mm = 0.2
    expect(scaleFromHandle(o, cards, 700)).toBeCloseTo(0.2);
    expect(scaleFromHandle(o, cards, 100)).toBe(FLAT_SCALE_MIN); // 피봇 안쪽
    // 재정렬로 카드가 원점에서 떨어져 있어도(x 2000mm~) 피봇은 카드 묶음 왼쪽 위 — 2026-10-22 "피봇과 메인 컨트롤러 위치가 다르다"
    const far = [{ x: 2000, y: 1000, w: 3000, h: 600 }];
    const pivot = { x: o.x + 2000 * 0.1, y: o.y + 1000 * 0.1 };
    expect(scaleFromHandle(pivot, far, pivot.x + 600)).toBeCloseTo(0.2);
    // 축척이 바뀌어도 ✥ 는 제자리: offset 을 x0·(kOld−kNew) 만큼 옮긴다
    const off = offsetKeepingPivot({ x: 10, y: 20 }, far, 0.1, 0.2);
    expect(off).toEqual({ x: 10 - 200, y: 20 - 100 });
    expect(flatBounds({ x: o.x + off.x - 10, y: o.y + off.y - 20 }, far, 0.2)!.x).toBeCloseTo(pivot.x);
    expect(offsetKeepingPivot({ x: 1, y: 2 }, [], 0.1, 0.2)).toEqual({ x: 1, y: 2 });
  });
  it('처음 축척: 사진 속 사인물과 같은 폭 (2026-10-22 "초기 상태가 작게 나온다")', () => {
    expect(autoFlatScale([{ mm: 3000, px: 600, placeholder: false }])).toBeCloseTo(0.2);
    expect(autoFlatScale([{ mm: 3000, px: 600, placeholder: false }, { mm: 1000, px: 50, placeholder: false }, { mm: 1000, px: 400, placeholder: false }])).toBeCloseTo(0.2); // 중앙값
    expect(autoFlatScale([{ mm: 3000, px: 600, placeholder: false }, { mm: 1000, px: 900, placeholder: true }])).toBeCloseTo(0.2); // 치수 있는 것 우선
    expect(autoFlatScale([{ mm: 1000, px: 300, placeholder: true }])).toBeCloseTo(0.3); // 임시 카드만 있으면 그걸로
    expect(autoFlatScale([{ mm: 1000, px: 0, placeholder: false }])).toBe(0.1);
    expect(autoFlatScale([])).toBe(0.1);
  });
});

// 평면 구역 이동 (2026-10-17 사용자: "왼쪽 상단에도 버튼이 있으면 좋겠다. 이건 이동")
describe('평면 구역 이동 (프로젝트 설정 flatOffset, 보드 px)', () => {
  const photos = [{ x: 100, y: 50, width: 1000, w: 2000, h: 1000 }];
  it('원점 = 사진 아래 기본 원점 + 오프셋', () => {
    expect(flatOrigin(photos)).toEqual({ x: 100, y: 630 });
    expect(flatOrigin(photos, 80, { x: 250, y: -40 })).toEqual({ x: 350, y: 590 });
    expect(flatOrigin([], 80, { x: 10, y: 10 })).toEqual({ x: 10, y: 10 });
  });
});

describe('치수 없는 사인물의 카드 임시 크기 (2026-10-22 "사이즈를 넣지 않으면 사인물 카드로 나오지 않는다")', async () => {
  const { placeholderSize, PLACEHOLDER_W } = await import('../../src/lib/core/boardCards');
  it('영역 비율로 가로 1000mm 기준, 영역이 없으면 1000×600', () => {
    expect(placeholderSize([[0, 0], [400, 0], [400, 100], [0, 100]])).toEqual({ w: PLACEHOLDER_W, h: 250 });
    expect(placeholderSize([])).toEqual({ w: 1000, h: 600 });
    expect(placeholderSize(undefined)).toEqual({ w: 1000, h: 600 });
    expect(placeholderSize([[0, 0], [0, 0], [0, 0], [0, 0]])).toEqual({ w: 1000, h: 600 });
  });
});
