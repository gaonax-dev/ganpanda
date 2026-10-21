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

/** 평면 구역 축척(px/mm) 범위 — 프로젝트 설정 `flatScale` (2026-10-17 사용자: "평면도 전체 사이즈 조절 가능하게"). 리스트 좌표(mm)는 그대로, 보드에 그리는 크기만 바뀐다.
 * 범위는 사실상 없음 — 0.001~20 (2026-10-22 사용자: "사인물 정면도 크기가 리밋이 있다. 해제해주고"; 0 과 무한만 막는다) */
export const FLAT_SCALE_MIN = 0.001, FLAT_SCALE_MAX = 20;
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
/**
 * 오른쪽 아래 손잡이를 보드 x 로 끌었을 때의 축척: **피봇(✥ = 카드 묶음 왼쪽 위, 보드 px)**에서 손잡이까지 px / 카드 묶음 가로 mm (비율 유지).
 * 2026-10-22 사용자: "정면도 피봇과 메인 컨트롤러 위치가 다르다. 피봇에 메인 컨트롤러 위치하게" — 전에는 평면 원점 기준이라 재정렬로 카드가 원점에서 떨어지면 ✥ 가 함께 밀려갔다
 */
export function scaleFromHandle(pivot: { x: number; y: number }, cards: Placed[], handleX: number): number {
  const x0 = Math.min(...cards.map((c) => c.x)), x1 = Math.max(...cards.map((c) => c.x + c.w));
  return clampFlatScale((handleX - pivot.x) / Math.max(1, x1 - x0));
}
/** 축척을 kOld → kNew 로 바꿀 때 ✥(카드 묶음 왼쪽 위)가 제자리에 있도록 옮긴 flatOffset (보드 px) */
export function offsetKeepingPivot(offset: { x: number; y: number }, cards: Placed[], kOld: number, kNew: number): { x: number; y: number } {
  if (!cards.length) return offset;
  const x0 = Math.min(...cards.map((c) => c.x)), y0 = Math.min(...cards.map((c) => c.y));
  return { x: Math.round(offset.x + x0 * (kOld - kNew)), y: Math.round(offset.y + y0 * (kOld - kNew)) };
}
/**
 * 축척의 처음값 (2026-10-22 사용자: "정면도 초기 상태가 작게 나온다. 사진의 사인물과 비슷한 크기로 시작하게"): 설정 flatScale 이 없으면
 * 카드(mm) 가 사진 속 그 사인물(보드 px) 과 같은 폭이 되는 비율의 중앙값. 치수 있는 사인물 우선, 없으면 임시 카드로. 사인물이 없으면 기본 0.1
 */
export function autoFlatScale(signs: { mm: number; px: number; placeholder: boolean }[]): number {
  const ok = signs.filter((s) => s.mm > 0 && s.px > 0);
  const pool = ok.some((s) => !s.placeholder) ? ok.filter((s) => !s.placeholder) : ok;
  if (!pool.length) return BOARD_PX_PER_MM;
  const r = pool.map((s) => s.px / s.mm).sort((a, b) => a - b);
  return clampFlatScale(r[Math.floor(r.length / 2)]);
}

/**
 * 치수가 없는 사인물의 카드 임시 크기 (2026-10-22 사용자: "사인물이 사이즈를 넣지 않으면 사인물 카드로 나오지 않는다"):
 * 사진 영역(quad)의 가로세로 비율로 가로 1000mm 기준. 영역이 없으면 1000×600. 견적·PDF·SVG 에는 안 들어간다 — 카드 자리만
 */
export const PLACEHOLDER_W = 1000;
export function placeholderSize(quad: [number, number][] | undefined): { w: number; h: number } {
  if (!quad || quad.length !== 4) return { w: PLACEHOLDER_W, h: 600 };
  const [tl, tr, br, bl] = quad;
  const len = (a: [number, number], b: [number, number]) => Math.hypot(b[0] - a[0], b[1] - a[1]);
  const w = (len(tl, tr) + len(bl, br)) / 2, h = (len(tl, bl) + len(tr, br)) / 2;
  if (!(w > 0) || !(h > 0)) return { w: PLACEHOLDER_W, h: 600 };
  return { w: PLACEHOLDER_W, h: Math.max(50, Math.round((PLACEHOLDER_W * h) / w)) };
}
