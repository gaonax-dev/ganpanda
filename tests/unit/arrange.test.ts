// 사진 보드 카드 자동 정렬 (2026-10-20 사용자: "사진보드의 사인물 카드를 자동으로 정렬하고 싶다. 우선 사진순서로 소속 카드들을 배치하고 순서는 사진에서의 순서와 위치로"
// → "사진의 구도대로 평면화 하고 여기에서 축이 다른 경우도 평면으로 펴서 카드가 정렬되게")
import { describe, expect, it } from 'vitest';
import { arrangeByPhotos, composeBlock, unfold } from '../../src/lib/core/arrange';

describe('unfold — 벽 좌표(가로 X, 높이 H, 벽 밖 D)를 벽 평면으로 펴기', () => {
  it('벽면(Y) 사인물은 그대로 (X, H)', () => {
    expect(unfold([[1000, 2000, 0], [3000, 2600, 0]], 'y')).toEqual([[1000, 2000], [3000, 2600]]);
  });
  it('세로면(X, 돌출 간판)은 벽에 붙은 세로선을 축으로 돌려 펴서 — 벽에서 나온 만큼 옆으로', () => {
    expect(unfold([[1000, 2000, 0], [1000, 2000, 800], [1000, 2900, -800]], 'x')).toEqual([[1000, 2000], [1800, 2000], [1800, 2900]]);
  });
  it('수평면(Z, 어닝 아랫면 등)은 벽에 붙은 가로선을 축으로 접어 내려 — 벽에서 나온 만큼 아래로', () => {
    expect(unfold([[1000, 2500, 0], [3000, 2500, 1200]], 'z')).toEqual([[1000, 2500], [3000, 1300]]);
  });
});

describe('composeBlock — 사진 구도대로 (실제 mm 위치)', () => {
  it('왼쪽 위 = (0,0), 높이는 위가 0 — 펴진 중심 자리에 입력 크기로', () => {
    const out = composeBlock([{ id: 'band', w: 2000, h: 600, cx: 1000, cy: 3000 }, { id: 'door', w: 1000, h: 2000, cx: 4000, cy: 1000 }], 300);
    expect(out.get('band')).toEqual({ x: 0, y: 0 });
    expect(out.get('door')).toEqual({ x: 3500, y: 1300 });
  });
  it('겹치는 카드는 간격만큼 오른쪽으로 밀어 겹치지 않게 (구도는 유지)', () => {
    const out = composeBlock([{ id: 'board', w: 4000, h: 1000, cx: 2000, cy: 3000 }, { id: 'letters', w: 2000, h: 500, cx: 2000, cy: 3000 }], 300);
    expect(out.get('board')).toEqual({ x: 0, y: 0 });
    expect(out.get('letters')).toEqual({ x: 4300, y: 250 });
  });
});

describe('arrangeByPhotos — 사진 순서대로 구도 묶음을 위에서 아래로, 사진 없는 카드는 끝', () => {
  it('묶음 사이 간격 두 배, 펴지 못한 카드는 그 묶음 아래 줄', () => {
    const out = arrangeByPhotos([
      { id: 'p2', w: 1000, h: 500, photo: 1, at: { cx: 500, cy: 250 } },
      { id: 'p1a', w: 2000, h: 600, photo: 0, at: { cx: 1000, cy: 3000 } },
      { id: 'p1b', w: 1000, h: 2000, photo: 0, at: { cx: 4000, cy: 1000 } },
      { id: 'p1x', w: 800, h: 400, photo: 0, at: null },
      { id: 'free', w: 700, h: 700, photo: null, at: null },
    ], 300, 20000);
    expect(out.get('p1a')).toEqual({ x: 0, y: 0 });
    expect(out.get('p1b')).toEqual({ x: 3500, y: 1300 });
    expect(out.get('p1x')).toEqual({ x: 0, y: 3300 + 300 }); // 구도 묶음(높이 3300) 아래
    expect(out.get('p2')).toEqual({ x: 0, y: 3600 + 400 + 600 });
    expect(out.get('free')).toEqual({ x: 0, y: 4600 + 500 + 600 });
  });
});
