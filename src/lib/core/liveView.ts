// 3D 단계의 실시간 사진 (2026-10-27 사용자: "3d 랜더링보다 실시간이 더 빠르지 않나?" → "확대할때 이상해 화면에서 가운데 있는 사진의 3d만 실시간")
// 화면 가운데 사진 하나만 WebGL 로 바로 그리고, 그 사진에서 **화면에 보이는 부분만 화면 해상도로** 그린다.
// 그래서 확대해도 또렷하고(전엔 폭 1,280px 그림을 늘려 흐렸다), 그림 크기가 화면을 넘지 않아 휴대폰 메모리도 안전하다.
import { toScreen, type Viewport } from './viewport';

/** 보드 위 사진: 보드 단위 위치·폭, 원본 픽셀 크기 */
export interface BoardPhoto { id: string; x: number; y: number; width: number; w: number; h: number }
export interface LiveView {
  id: string;
  /** 그릴 부분 — 원본 픽셀 */
  crop: { x: number; y: number; w: number; h: number };
  /** 그 부분 — 사진 안의 보드 단위 (화면에 놓을 자리) */
  rect: { x: number; y: number; w: number; h: number };
  /** 그 부분의 화면 크기 (CSS px) */
  px: { w: number; h: number };
}

/** 화면에 보이는 사진의 짧은 변이 이보다 작으면 실시간 3D 를 하지 않는다 — 멀리서는 3D 차이가 안 보이고, 줌아웃할 때 장면을 짓느라 휴대폰 메모리만 쓴다
 *  (2026-10-28 "3d 화면에서 줌 아웃하면 3d 랜더링 뜨고 화면을 새로고침한다. 개별 업데이트로 하고 화면 새로고침을 피할 수 있어?") */
export const LIVE_MIN_PX = 80;

export function liveView(photos: BoardPhoto[], v: Viewport, screen: { w: number; h: number }, usable: (id: string) => boolean = () => true): LiveView | null {
  const cx = screen.w / 2, cy = screen.h / 2;
  let best: { p: BoardPhoto; vis: { x0: number; y0: number; x1: number; y1: number }; center: boolean; area: number } | null = null;
  for (const p of photos) {
    if (!usable(p.id)) continue;
    const bh = p.width * (p.h / p.w);
    if (Math.min(p.width, bh) * v.zoom < LIVE_MIN_PX) continue; // 너무 작게 보인다
    const a = toScreen(v, { x: p.x, y: p.y }), b = toScreen(v, { x: p.x + p.width, y: p.y + bh });
    const vis = { x0: Math.max(0, a.x), y0: Math.max(0, a.y), x1: Math.min(screen.w, b.x), y1: Math.min(screen.h, b.y) };
    if (vis.x1 <= vis.x0 || vis.y1 <= vis.y0) continue;
    const center = cx >= a.x && cx <= b.x && cy >= a.y && cy <= b.y;
    const area = (vis.x1 - vis.x0) * (vis.y1 - vis.y0);
    if (!best || (center && !best.center) || (center === best.center && area > best.area)) best = { p, vis, center, area };
  }
  if (!best) return null;
  const { p, vis } = best;
  const z = v.zoom, k = p.w / p.width; // 원본 픽셀 / 보드 단위
  const rect = { x: (vis.x0 - v.x) / z - p.x, y: (vis.y0 - v.y) / z - p.y, w: (vis.x1 - vis.x0) / z, h: (vis.y1 - vis.y0) / z };
  return {
    id: p.id,
    crop: { x: rect.x * k, y: rect.y * k, w: rect.w * k, h: rect.h * k },
    rect,
    px: { w: Math.round(vis.x1 - vis.x0), h: Math.round(vis.y1 - vis.y0) },
  };
}
