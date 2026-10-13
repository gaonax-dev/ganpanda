// 작업 존 ↔ AI 분리: 존 외곽 사각형(분석 범위), 다각형 래스터화, 마스크를 존 안으로 자르기
import type { Pt } from './homography';

export interface Bounds { x: number; y: number; w: number; h: number }

/** 존의 외곽 사각형에 여유(margin px)를 두고 사진 안으로 자른 정수 사각형 */
export function zoneBounds(zone: Pt[], imgW: number, imgH: number, margin = 0): Bounds {
  const xs = zone.map((p) => p[0]), ys = zone.map((p) => p[1]);
  const x0 = Math.max(0, Math.floor(Math.min(...xs) - margin)), y0 = Math.max(0, Math.floor(Math.min(...ys) - margin));
  const x1 = Math.min(imgW, Math.ceil(Math.max(...xs) + margin)), y1 = Math.min(imgH, Math.ceil(Math.max(...ys) + margin));
  return { x: x0, y: y0, w: Math.max(1, x1 - x0), h: Math.max(1, y1 - y0) };
}

/** 다각형 안 픽셀 = 1 (스캔라인, 픽셀 중심 기준) */
export function rasterizePolygon(poly: Pt[], w: number, h: number): Uint8Array {
  const out = new Uint8Array(w * h);
  const n = poly.length;
  for (let y = 0; y < h; y++) {
    const cy = y + 0.5;
    const xs: number[] = [];
    for (let i = 0; i < n; i++) {
      const [ax, ay] = poly[i], [bx, by] = poly[(i + 1) % n];
      if ((ay <= cy && by > cy) || (by <= cy && ay > cy)) xs.push(ax + ((cy - ay) * (bx - ax)) / (by - ay));
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const x0 = Math.max(0, Math.ceil(xs[k] - 0.5)), x1 = Math.min(w, Math.ceil(xs[k + 1] - 0.5));
      for (let x = x0; x < x1; x++) out[y * w + x] = 1;
    }
  }
  return out;
}

/** 마스크 AND 존 (같은 크기) */
export function clipMask(mask: Uint8Array, zone: Uint8Array): Uint8Array {
  const out = new Uint8Array(mask.length);
  for (let i = 0; i < mask.length; i++) out[i] = mask[i] && zone[i] ? 1 : 0;
  return out;
}
