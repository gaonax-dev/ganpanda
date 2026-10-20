// 무한 캔버스 뷰포트: screen = world × zoom + (x, y)
export interface Viewport { x: number; y: number; zoom: number }
export interface XY { x: number; y: number }
export interface Rect { x: number; y: number; w: number; h: number }

export const ZOOM_MIN = 0.02;
export const ZOOM_MAX = 12; // 40 → 12 (2026-10-21 "모바일에서 핀치줌중에 페이지 열수 없음 크레시": 원근으로 겹친 3D 그림이 확대만큼 큰 그림으로 그려져 휴대폰 메모리가 넘쳤다)

export const toScreen = (v: Viewport, p: XY): XY => ({ x: p.x * v.zoom + v.x, y: p.y * v.zoom + v.y });
export const toWorld = (v: Viewport, p: XY): XY => ({ x: (p.x - v.x) / v.zoom, y: (p.y - v.y) / v.zoom });
export const pan = (v: Viewport, dx: number, dy: number): Viewport => ({ x: v.x + dx, y: v.y + dy, zoom: v.zoom });

/** 화면 점 p 를 고정한 채 factor 배 확대 */
export function zoomAt(v: Viewport, p: XY, factor: number): Viewport {
  const zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, v.zoom * factor));
  const w = toWorld(v, p);
  return { zoom, x: p.x - w.x * zoom, y: p.y - w.y * zoom };
}

/** world 영역이 화면(sw×sh)에 꽉 차도록 */
export function fitRect(r: Rect, sw: number, sh: number, padding = 40): Viewport {
  const zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.min((sw - padding * 2) / r.w, (sh - padding * 2) / r.h)));
  return { zoom, x: sw / 2 - (r.x + r.w / 2) * zoom, y: sh / 2 - (r.y + r.h / 2) * zoom };
}

/**
 * 두 손가락 핀치: 이전 두 점 → 현재 두 점. 거리 비율만큼 가운데 점 기준으로 확대하고, 가운데 점의 이동만큼 옮긴다
 * (휴대폰 보드 조작, 2026-10-14 사용자: "핀치줌 안되는거 해결")
 */
export function pinch(v: Viewport, prev: [XY, XY], now: [XY, XY]): Viewport {
  const dist = (a: XY, b: XY) => Math.hypot(a.x - b.x, a.y - b.y);
  const mid = (a: XY, b: XY): XY => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  const d0 = dist(prev[0], prev[1]), d1 = dist(now[0], now[1]);
  const m0 = mid(prev[0], prev[1]), m1 = mid(now[0], now[1]);
  const zoomed = d0 > 1 && d1 > 1 ? zoomAt(v, m0, d1 / d0) : v;
  return pan(zoomed, m1.x - m0.x, m1.y - m0.y);
}

/**
 * 두 손가락 (2026-10-20 사용자: "두손가락 드래그(화면팬)는 모든 제스처중 가장 우선한다. 그 다음 줌이다"):
 * 가운데 점을 따라 **늘 이동**하고, 손가락 간격이 처음보다 분명히(ZOOM_ENGAGE, 8%) 바뀐 뒤에야 확대·축소를 더한다 — 끌다가 간격이 조금 흔들려 배율이 바뀌지 않게
 */
export const ZOOM_ENGAGE = 0.08;
export interface TwoFingerState { d0: number; zooming: boolean }
const dist2 = (a: XY, b: XY) => Math.hypot(a.x - b.x, a.y - b.y);
const mid2 = (a: XY, b: XY): XY => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
export function startTwoFinger(at: [XY, XY]): TwoFingerState { return { d0: dist2(at[0], at[1]), zooming: false }; }
export function twoFinger(v: Viewport, st: TwoFingerState, prev: [XY, XY], now: [XY, XY]): { v: Viewport; st: TwoFingerState } {
  const dp = dist2(prev[0], prev[1]), dn = dist2(now[0], now[1]);
  const mp = mid2(prev[0], prev[1]), mn = mid2(now[0], now[1]);
  const zooming = st.zooming || (st.d0 > 1 && Math.abs(dn / st.d0 - 1) > ZOOM_ENGAGE);
  let out = pan(v, mn.x - mp.x, mn.y - mp.y);
  if (zooming && dp > 1 && dn > 1) out = zoomAt(out, mn, st.zooming ? dn / dp : dn / st.d0); // 막 켜질 때는 처음 간격부터 — 손가락 아래 지점이 따라온다
  return { v: out, st: { ...st, zooming } };
}
