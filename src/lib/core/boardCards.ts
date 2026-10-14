// 사진 보드 위 평면도 카드 (2026-10-15 사용자 시나리오: "사진에 직접 넣고 치수를 입력하면 사진 하단에 사인물이 평면도로 생성된다.
// 보드 빈 곳에 사인물을 만들면 바로 생성되고, 이후 사진의 사인물과 연결한다"). 카드는 사인물(원본)마다 하나 — 사진마다 중복되지 않는다
/** 보드(world px) 1px = 10mm — 사진 폭 ~1000px 가 10m 파사드쯤이라 같은 축척 */
export const BOARD_PX_PER_MM = 0.1;

/**
 * 보드의 **평면 구역** 원점(world px): 모든 사진 아래. 평면도 카드는 여기에 리스트 뷰와 **같은 배치**(listX/listY mm × 축척)로 놓인다
 * (2026-10-15 사용자: "평면 사인물은 배치를 할 수 있어야 한다. 해당 배치는 리스트 뷰에서도 적용되고 리스트 뷰는 최종 출력에 사용될 것이다")
 */
export function flatOrigin(photos: { x: number; y: number; width: number; w: number; h: number }[], gap = 80): { x: number; y: number } {
  if (!photos.length) return { x: 0, y: 0 };
  return { x: Math.min(...photos.map((p) => p.x)), y: Math.max(...photos.map((p) => p.y + p.width * (p.h / p.w))) + gap };
}

/** 리스트 좌표(mm) ↔ 보드 좌표(world px) */
export const listToBoard = (origin: { x: number; y: number }, x: number, y: number) => ({ x: origin.x + x * BOARD_PX_PER_MM, y: origin.y + y * BOARD_PX_PER_MM });
export const boardToList = (origin: { x: number; y: number }, x: number, y: number) => ({ x: Math.round((x - origin.x) / BOARD_PX_PER_MM), y: Math.round((y - origin.y) / BOARD_PX_PER_MM) });

/** 보드 빈 곳에 끌어 그린 사각형(world px) → 사인물 치수(mm, 10mm 단위, 최소 100) */
export function mmFromBoardRect(w: number, h: number): { widthMm: number; heightMm: number } {
  const r = (px: number) => Math.max(100, Math.round(px / BOARD_PX_PER_MM / 10) * 10);
  return { widthMm: r(w), heightMm: r(h) };
}
