// 사인물 실제 도형 면적 (잎 모듈 — 견적·시트 구성 요소)
import type { SignObject } from './model';
import { polygonArea, quadToRect } from './perspective';
import { applyHomography } from './homography';

/** 실제 도형 면적(㎡). 사각=w·h, 둥근 사각=w·h−(4−π)r², 원=π/4·w·h, 다각형=정면 보정 후 면적 */
export function shapeAreaM2(o: SignObject): number {
  const w = o.widthMm!, h = o.heightMm!;
  if (o.shape === 'ellipse') return ((Math.PI / 4) * w * h) / 1e6;
  if (o.shape === 'rect' && o.corner) { const r = Math.min(0.5, o.corner) * Math.min(w, h); return (w * h - (4 - Math.PI) * r * r) / 1e6; }
  if (o.shape === 'polygon' && o.polygon?.length) {
    try {
      const H = quadToRect(o.quad, w, h);
      return polygonArea(o.polygon.map((p) => applyHomography(H, p))) / 1e6;
    } catch { /* 찌그러진 영역 → 외곽 사각형 면적 */ }
  }
  return (w * h) / 1e6;
}
