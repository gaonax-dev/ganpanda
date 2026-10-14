// 평면도 카드의 얼굴: 사진 영역을 정면 보정해 보여 주는 CSS 변환과 모양 자르기 (리스트 뷰·보드 카드 공용)
import { cssMatrix3d, quadToRect } from './perspective';
import { applyHomography } from './homography';
import type { SignObject } from './model';

export function faceWarp(o: SignObject, w: number, h: number): string {
  try { return cssMatrix3d(quadToRect(o.quad, w, h)); } catch { return 'none'; }
}

export function faceClip(o: SignObject, w: number, h: number): string {
  if (o.shape === 'ellipse') return 'ellipse(50% 50% at 50% 50%)';
  if (o.shape === 'rect' && o.corner) return `inset(0 round ${Math.min(0.5, o.corner) * Math.min(w, h)}px)`;
  if (o.shape === 'polygon' && o.polygon) {
    let H: number[];
    try { H = quadToRect(o.quad, w, h); } catch { return 'none'; }
    return `polygon(${o.polygon.map((p) => applyHomography(H, p)).map(([x, y]) => `${x}px ${y}px`).join(',')})`;
  }
  return 'none';
}
