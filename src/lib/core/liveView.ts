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

/**
 * prev = 지금 실시간인 사진 — **쉽게 바꾸지 않는다**(2026-10-30 아이폰 진단 기록: 3D 확대·축소 중 가운데 사진이 두 장 사이를 한 프레임에도 여러 번 오가며
 * 장면을 다시 얹었고 그 직후 다시 열렸다). 앞 사진이 아직 쓸 만하면(충분히 크고 보임) 가운데를 차지하고 있거나 아무도 가운데를 차지하지 않을 때 그대로 둔다.
 * 다른 사진이 가운데를 차지하고 앞 사진은 아닐 때만 넘어간다
 */
export function liveView(photos: BoardPhoto[], v: Viewport, screen: { w: number; h: number }, usable: (id: string) => boolean = () => true, prev?: string | null): LiveView | null {
  const cx = screen.w / 2, cy = screen.h / 2;
  type Cand = { p: BoardPhoto; vis: { x0: number; y0: number; x1: number; y1: number }; center: boolean; area: number };
  let best: Cand | null = null, kept: Cand | null = null;
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
    if (p.id === prev) kept = { p, vis, center, area };
  }
  if (!best) return null;
  if (kept && (kept.center || !best.center)) best = kept;
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

/** 휴대폰: 화면이 이만큼 멈춘 뒤에 새 장면을 짓는다 — 움직이는 동안 가운데 사진이 바뀔 때마다 지으면 아이폰이 메모리를 늦게 돌려줘 다시 열렸다
 *  (2026-10-29 "3d는 화면 팬에서 … 반복에서 나타났음", "실시간 업데이트 최적화 이후 벌어진 일") */
export const LIVE_SETTLE_MS = 300;
/** 휴대폰은 지어 둔 장면이어도 기다린다 (2026-10-30 진단 기록: 기억한 두 장면을 프레임마다 번갈아 얹은 직후 다시 열림) */
export function liveBuildDelay(light: boolean, _cached: boolean): number { return light ? LIVE_SETTLE_MS : 0; }
