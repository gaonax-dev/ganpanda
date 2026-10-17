// 사진 보드 위 평면도 카드 (2026-10-15 사용자 시나리오: "사진에 직접 넣고 치수를 입력하면 사진 하단에 사인물이 평면도로 생성된다.
// 보드 빈 곳에 사인물을 만들면 바로 생성되고, 이후 사진의 사인물과 연결한다"). 카드는 사인물(원본)마다 하나 — 사진마다 중복되지 않는다
/** 보드(world px) 1px = 10mm — 사진 폭 ~1000px 가 10m 파사드쯤이라 같은 축척 */
export const BOARD_PX_PER_MM = 0.1;

/**
 * 보드의 **평면 구역** 원점(world px): 모든 사진 아래. 평면도 카드는 여기에 리스트 뷰와 **같은 배치**(listX/listY mm × 축척)로 놓인다
 * (2026-10-15 사용자: "평면 사인물은 배치를 할 수 있어야 한다. 해당 배치는 리스트 뷰에서도 적용되고 리스트 뷰는 최종 출력에 사용될 것이다")
 */
export function flatOrigin(photos: { x: number; y: number; width: number; w: number; h: number }[], gap = 80, offset: { x: number; y: number } = { x: 0, y: 0 }): { x: number; y: number } {
  // offset = 평면 구역 이동 (2026-10-17 사용자: "왼쪽 상단에도 버튼이 있으면 좋겠다. 이건 이동") — 프로젝트 설정 flatOffset, 보드 px
  if (!photos.length) return { x: offset.x, y: offset.y };
  return { x: Math.min(...photos.map((p) => p.x)) + offset.x, y: Math.max(...photos.map((p) => p.y + p.width * (p.h / p.w))) + gap + offset.y };
}

/** 평면 구역 축척(px/mm) 범위 — 프로젝트 설정 `flatScale` (2026-10-17 사용자: "평면도 전체 사이즈 조절 가능하게"). 리스트 좌표(mm)는 그대로, 보드에 그리는 크기만 바뀐다 */
export const FLAT_SCALE_MIN = 0.02, FLAT_SCALE_MAX = 0.5;
export const clampFlatScale = (k: number | undefined) => (Number.isFinite(k) ? Math.min(FLAT_SCALE_MAX, Math.max(FLAT_SCALE_MIN, k!)) : BOARD_PX_PER_MM);

/** 리스트 좌표(mm) ↔ 보드 좌표(world px). k = 축척(px/mm, 기본 0.1) */
export const listToBoard = (origin: { x: number; y: number }, x: number, y: number, k = BOARD_PX_PER_MM) => ({ x: origin.x + x * k, y: origin.y + y * k });
export const boardToList = (origin: { x: number; y: number }, x: number, y: number, k = BOARD_PX_PER_MM) => ({ x: Math.round((x - origin.x) / k), y: Math.round((y - origin.y) / k) });

/** 보드 빈 곳에 끌어 그린 사각형(world px) → 사인물 치수(mm, 10mm 단위, 최소 100) */
export function mmFromBoardRect(w: number, h: number, k = BOARD_PX_PER_MM): { widthMm: number; heightMm: number } {
  const r = (px: number) => Math.max(100, Math.round(px / k / 10) * 10);
  return { widthMm: r(w), heightMm: r(h) };
}

type Placed = { x: number; y: number; w: number; h: number };
/** 평면 구역 경계(보드 px): 모든 카드를 감싸는 사각 (크기 손잡이 자리). 카드가 없으면 null */
export function flatBounds(origin: { x: number; y: number }, cards: Placed[], k: number): { x: number; y: number; w: number; h: number } | null {
  if (!cards.length) return null;
  const x0 = Math.min(...cards.map((c) => c.x)), y0 = Math.min(...cards.map((c) => c.y));
  const x1 = Math.max(...cards.map((c) => c.x + c.w)), y1 = Math.max(...cards.map((c) => c.y + c.h));
  return { x: origin.x + x0 * k, y: origin.y + y0 * k, w: (x1 - x0) * k, h: (y1 - y0) * k };
}
/** 오른쪽 아래 손잡이를 보드 x 로 끌었을 때의 축척: 원점에서 손잡이까지 px / 카드 오른쪽 끝 mm (가로 기준, 비율 유지) */
export function scaleFromHandle(origin: { x: number; y: number }, cards: Placed[], handleX: number): number {
  const right = Math.max(1, ...cards.map((c) => c.x + c.w));
  return clampFlatScale((handleX - origin.x) / right);
}
