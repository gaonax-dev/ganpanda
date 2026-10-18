// 조합형 3단계: 설정 창 안 정면도 편집기의 계산 (2026-10-16 사용자: 정면도 편집기는 설정 창 안에 따로).
// 좌표는 PartItem 과 같이 간판 중앙 기준 mm (x 오른쪽 +, y 위 +). 상자 x·y 는 중심, w·h 는 크기.
import type { PartItem, SignObject } from './model';
import { charCountOf } from './quote';

/** 글자 하나의 폭 ≈ 높이 × 이 비율 (한글 기준 추정 — 실제 글꼴 폭은 3D·출력에서) */
export const TEXT_CHAR_ASPECT = 0.9;
/** 끌 때 붙는 거리 (화면 px) */
export const SNAP_PX = 8;
/** 객체 최소 높이 (mm) */
export const MIN_ITEM_MM = 10;
/** 치수가 없을 때 보여 줄 프레임 크기 (mm) */
const FALLBACK_FRAME_MM = 1000;

export interface Box { x: number; y: number; w: number; h: number }
export type Align = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom';

/** 객체 상자: 글자는 가로를 넣지 않았으면 글자수 × 높이 × 비율, 그림은 정사각 */
export function itemBox(it: PartItem): Box {
  const w = it.w ?? (it.kind === 'text' ? Math.max(1, charCountOf({ text: it.text })) * it.h * TEXT_CHAR_ASPECT : it.h); // 그림·도형은 정사각
  return { x: it.x, y: it.y, w, h: it.h };
}

export const frameBox = (o: Pick<SignObject, 'widthMm' | 'heightMm'>): Box => ({ x: 0, y: 0, w: o.widthMm ?? 0, h: o.heightMm ?? 0 });

/** 프레임과 객체가 모두 여백(padPx) 안에 들어가는 축척. 범위의 가운데가 화면 가운데 */
export function viewOf(frame: Box, items: Box[], viewW: number, viewH: number, padPx: number) {
  const f = { ...frame, w: frame.w || FALLBACK_FRAME_MM, h: frame.h || FALLBACK_FRAME_MM };
  const all = [f, ...items];
  const minX = Math.min(...all.map((b) => b.x - b.w / 2)), maxX = Math.max(...all.map((b) => b.x + b.w / 2));
  const minY = Math.min(...all.map((b) => b.y - b.h / 2)), maxY = Math.max(...all.map((b) => b.y + b.h / 2));
  const scale = Math.min((viewW - 2 * padPx) / (maxX - minX), (viewH - 2 * padPx) / (maxY - minY));
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  return {
    scale,
    toView: ([x, y]: [number, number]): [number, number] => [viewW / 2 + (x - cx) * scale, viewH / 2 - (y - cy) * scale],
    toMm: ([px, py]: [number, number]): [number, number] => [cx + (px - viewW / 2) / scale, cy - (py - viewH / 2) / scale],
  };
}

/** 한 축: 상자의 앞끝·중앙·뒤끝 중 선에 가장 가까운 것을 tol 안이면 붙인다 */
function snapAxis(c: number, size: number, lines: number[], tol: number): { c: number; at?: number } {
  let best: { d: number; c: number; at: number } | undefined;
  for (const off of [-size / 2, 0, size / 2]) {
    for (const l of lines) {
      const d = Math.abs(c + off - l);
      if (d <= tol && (!best || d < best.d)) best = { d, c: l - off, at: l };
    }
  }
  return best ? { c: best.c, at: best.at } : { c: Math.round(c) };
}
const linesOf = (b: Box, half: 'w' | 'h', c: 'x' | 'y') => [b[c] - b[half] / 2, b[c], b[c] + b[half] / 2];

/** 끌 때 붙기: 프레임·다른 객체의 끝·중앙선. tolMm 안이면 붙고 안내선을 돌려준다 */
export function snapMove(box: Box, frame: Box, others: Box[], tolMm: number): { x: number; y: number; guides: { axis: 'x' | 'y'; at: number }[] } {
  const targets = [frame, ...others];
  const sx = snapAxis(box.x, box.w, targets.flatMap((b) => linesOf(b, 'w', 'x')), tolMm);
  const sy = snapAxis(box.y, box.h, targets.flatMap((b) => linesOf(b, 'h', 'y')), tolMm);
  const guides: { axis: 'x' | 'y'; at: number }[] = [];
  if (sx.at !== undefined) guides.push({ axis: 'x', at: sx.at });
  if (sy.at !== undefined) guides.push({ axis: 'y', at: sy.at });
  return { x: sx.c, y: sy.c, guides };
}

/** 프레임 기준 정렬 */
export function alignBox(b: Box, frame: Box, how: Align): { x: number; y: number } {
  const hw = (frame.w - b.w) / 2, hh = (frame.h - b.h) / 2;
  switch (how) {
    case 'left': return { x: frame.x - hw, y: b.y };
    case 'center': return { x: frame.x, y: b.y };
    case 'right': return { x: frame.x + hw, y: b.y };
    case 'top': return { x: b.x, y: frame.y + hh };
    case 'middle': return { x: b.x, y: frame.y };
    case 'bottom': return { x: b.x, y: frame.y - hh };
  }
}

/** 높이를 바꾼다. 가로가 있으면 같은 비율로 (mm 정수, 최소 MIN_ITEM_MM) */
export function resizeItem(it: PartItem, h: number): Partial<PartItem> {
  const nh = Math.max(MIN_ITEM_MM, Math.round(h));
  return it.w ? { h: nh, w: Math.round((it.w * nh) / it.h) } : { h: nh };
}
