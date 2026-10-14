// 사진 보드 위 평면도 카드 (2026-10-15 사용자 시나리오: "사진에 직접 넣고 치수를 입력하면 사진 하단에 사인물이 평면도로 생성된다.
// 보드 빈 곳에 사인물을 만들면 바로 생성되고, 이후 사진의 사인물과 연결한다")
export interface CardItem { id: string; w: number; h: number }
export interface CardPlaced { x: number; y: number; w: number; h: number }

/** 보드(world px) 1px = 10mm — 사진 폭 ~1000px 가 10m 파사드쯤이라 같은 축척 */
export const BOARD_PX_PER_MM = 0.1;

/**
 * 사진 아래 한 줄로 늘어놓는다 (왼쪽부터, 생성 순). 축척은 BOARD_PX_PER_MM 이지만 줄이 사진 폭을 넘으면 그 폭에 맞춰 줄인다.
 * photo = 보드 위 사진 구역 {x, y, width, w, h} (world px / 원본 px)
 */
export function cardsUnderPhoto(photo: { x: number; y: number; width: number; w: number; h: number }, items: CardItem[], gap = 20, top = 28): { placed: Map<string, CardPlaced>; scale: number } {
  const placed = new Map<string, CardPlaced>();
  if (!items.length) return { placed, scale: BOARD_PX_PER_MM };
  const sumMm = items.reduce((a, it) => a + it.w, 0);
  const avail = photo.width - gap * (items.length - 1);
  const scale = Math.min(BOARD_PX_PER_MM, avail > 0 ? avail / sumMm : BOARD_PX_PER_MM);
  const bottom = photo.y + photo.width * (photo.h / photo.w);
  let x = photo.x;
  for (const it of items) {
    placed.set(it.id, { x, y: bottom + top, w: it.w * scale, h: it.h * scale });
    x += it.w * scale + gap;
  }
  return { placed, scale };
}

/** 보드 빈 곳에 끌어 그린 사각형(world px) → 사인물 치수(mm, 10mm 단위, 최소 100) */
export function mmFromBoardRect(w: number, h: number): { widthMm: number; heightMm: number } {
  const r = (px: number) => Math.max(100, Math.round(px / BOARD_PX_PER_MM / 10) * 10);
  return { widthMm: r(w), heightMm: r(h) };
}
