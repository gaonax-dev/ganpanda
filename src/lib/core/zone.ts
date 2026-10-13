// 작업 존 (사진 위 다각형) 꼭짓점 편집: 변 중간 클릭으로 추가, 선택 후 삭제 (최소 3개)
import type { Pt } from './homography';

export const ZONE_MIN_VERTICES = 3;

/** 각 변의 중간점 (변 i = 꼭짓점 i → i+1) */
export function midpoints(poly: Pt[]): Pt[] {
  return poly.map((p, i) => { const q = poly[(i + 1) % poly.length]; return [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2] as Pt; });
}

/** 변 edge(꼭짓점 edge → edge+1) 위에 꼭짓점 추가 */
export function insertVertex(poly: Pt[], edge: number, point: Pt): Pt[] {
  const out = poly.slice();
  out.splice(edge + 1, 0, [point[0], point[1]]);
  return out;
}

export function removeVertex(poly: Pt[], index: number): Pt[] {
  if (poly.length <= ZONE_MIN_VERTICES) return poly;
  return poly.filter((_, i) => i !== index);
}

/** 점 p 에서 가장 가까운 변 (허용 거리 안일 때). 투영점은 변 위로 제한 */
export function closestEdge(poly: Pt[], p: Pt, tolerance: number): { edge: number; point: Pt; dist: number } | null {
  let best: { edge: number; point: Pt; dist: number } | null = null;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2));
    const point: Pt = [a[0] + t * dx, a[1] + t * dy];
    const dist = Math.hypot(p[0] - point[0], p[1] - point[1]);
    if (dist <= tolerance && (!best || dist < best.dist)) best = { edge: i, point, dist };
  }
  return best;
}
