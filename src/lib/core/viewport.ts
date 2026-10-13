// 무한 캔버스 뷰포트: screen = world × zoom + (x, y)
export interface Viewport { x: number; y: number; zoom: number }
export interface XY { x: number; y: number }
export interface Rect { x: number; y: number; w: number; h: number }

export const ZOOM_MIN = 0.02;
export const ZOOM_MAX = 40;

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
