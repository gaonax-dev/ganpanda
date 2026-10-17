// 평면도 카드의 얼굴: 사진 영역을 정면 보정해 보여 주는 CSS 변환과 모양 자르기 (리스트 뷰·보드 카드 공용)
import { cssMatrix3d, quadToRect } from './perspective';
import { applyHomography } from './homography';
import type { SignObject } from './model';
import { partsOf } from './parts';
import { bodyLook } from './render';

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

/**
 * 카드 배지 (2026-10-17 사용자: "정면도 제목 왼쪽에 인디케이터 원본, 설정, 디자인 — 속성에서 넣는 것은 설정, 디자인 파일이 연결되면 디자인").
 * 얼굴이 보여 주는 것: 디자인 파일 > 설정(몸통 바탕색 또는 구성 요소 글자) > 원본(사진 그대로)
 */
export type FaceBadge = { id: 'original' | 'settings' | 'design'; label: '원본' | '설정' | '디자인' };
export function faceBadge(o: SignObject): FaceBadge {
  if (o.design) return { id: 'design', label: '디자인' };
  if (bodyLook(o) || partsOf(o).some((p) => p.items.length)) return { id: 'settings', label: '설정' };
  return { id: 'original', label: '원본' };
}
