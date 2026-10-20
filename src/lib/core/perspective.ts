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

/** 둥근 사각형 윤곽 (정면, 좌상 원점). corner = 짧은 변 대비 반지름 비율 0~0.5 (0.5 = 알약/원). seg = 모서리당 호 분할 수 */
export function roundedRect(w: number, h: number, corner: number, seg = 6): Pt[] {
  const r = Math.max(0, Math.min(0.5, corner)) * Math.min(w, h);
  if (r <= 0) return [[0, 0], [w, 0], [w, h], [0, h]];
  const arc = (cx: number, cy: number, from: number): Pt[] =>
    Array.from({ length: seg + 1 }, (_, i) => { const a = from + (i / seg) * (Math.PI / 2); return [cx + r * Math.cos(a), cy + r * Math.sin(a)] as Pt; });
  // 좌상 → 우상 → 우하 → 좌하 (y 아래 방향 좌표계에서 시계 방향)
  return [...arc(r, r, Math.PI), ...arc(w - r, r, -Math.PI / 2), ...arc(w - r, h - r, 0), ...arc(r, h - r, Math.PI / 2)];
}

/** 원근 사각 영역 안의 둥근 사각형 윤곽. 반지름은 영역의 변 길이(평균) 기준 */
export function roundedInQuad(quad: Pt[], corner: number, seg = 6): Pt[] {
  if (!(corner > 0)) return quad;
  const len = (p: Pt, q: Pt) => Math.hypot(p[0] - q[0], p[1] - q[1]);
  const w = (len(quad[0], quad[1]) + len(quad[3], quad[2])) / 2, h = (len(quad[0], quad[3]) + len(quad[1], quad[2])) / 2;
  let H: number[];
  try { H = rectToQuad(w, h, quad); } catch { return quad; }
  return roundedRect(w, h, corner, seg).map((p) => applyHomography(H, p));
}

/**
 * 원근(matrix3d)으로 겹치는 그림 상자의 크기 제한 (2026-10-21 "모바일에서 핀치줌중에 페이지 열수 없음 크레시가 난다"):
 * 3D 변환 층은 브라우저가 상자 크기 × 확대 배율의 그림 한 장으로 그리므로, 사인물 mm·디자인 원본 px 그대로면 휴대폰 메모리가 넘친다 → 긴 변 max px 안(비율 유지)
 */
export function capBox(w: number, h: number, max = 1024): { w: number; h: number } {
  const s = Math.min(1, max / Math.max(w, h, 1));
  return { w: w * s, h: h * s };
}
