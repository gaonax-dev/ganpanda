// 사진 속 사각 영역(원근) ↔ 정면 직사각형 변환
import { applyHomography, solveHomography, type Pt } from './homography';

const rectCorners = (w: number, h: number): Pt[] => [[0, 0], [w, 0], [w, h], [0, h]];

/** 직사각형(0,0)-(w,h) → 사각 영역(TL,TR,BR,BL) */
export const rectToQuad = (w: number, h: number, quad: Pt[]) => solveHomography(rectCorners(w, h), quad);
/** 사각 영역 → 직사각형(0,0)-(w,h) */
export const quadToRect = (quad: Pt[], w: number, h: number) => solveHomography(quad, rectCorners(w, h));
export const mapPoint = applyHomography;

/** 호모그래피를 CSS matrix3d 로 (요소를 원근 사각형에 그대로 얹을 때) */
export function cssMatrix3d(H: number[]): string {
  const [a, b, c, d, e, f, g, h, i] = H;
  return `matrix3d(${[a, d, 0, g, b, e, 0, h, 0, 0, 1, 0, c, f, 0, i].join(',')})`;
}

export function pointInPolygon([x, y]: Pt, poly: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
export const pointInQuad = pointInPolygon;

export function quadFromDrag([x0, y0]: Pt, [x1, y1]: Pt): Pt[] {
  const l = Math.min(x0, x1), r = Math.max(x0, x1), t = Math.min(y0, y1), b = Math.max(y0, y1);
  return [[l, t], [r, t], [r, b], [l, b]];
}

export function polygonArea(poly: Pt[]): number {
  let a = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) a += (poly[j][0] + poly[i][0]) * (poly[j][1] - poly[i][1]);
  return Math.abs(a / 2);
}

/** 사각 영역(원근)에 내접하는 타원 윤곽 — 정면에서 원/타원인 간판 */
export function ellipseInQuad(quad: Pt[], n = 48): Pt[] {
  let H: number[];
  try { H = rectToQuad(1, 1, quad); } catch { return quad; } // 찌그러진 사각형
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return applyHomography(H, [0.5 + 0.5 * Math.cos(a), 0.5 + 0.5 * Math.sin(a)]);
  });
}
