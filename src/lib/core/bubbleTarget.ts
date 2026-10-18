// 꼭지점의 사인물 추적 (2026-10-18 사용자: "꼭지점 위치의 사인물을 최대한 추적해 사인물도 같이 선택할 수 있게 풍선 속성에서 사인물 속성으로 이동 가능한 버튼.
// 사인물에서도 말풍선 이동 버튼으로 간단 이동"). 지점 말풍선의 꼭지(x,y)가 어느 사인물 외곽선 안에 있는지 — 같은 사진의 사인물만, 겹치면 가장 작은 것
import type { Pin, SignObject } from './model';
import type { Pt } from './homography';
import { ellipseInQuad, pointInPolygon, roundedInQuad } from './perspective';

export function outlineOf(o: Pick<SignObject, 'shape' | 'quad' | 'polygon' | 'corner'>): Pt[] {
  if (o.quad.length !== 4) return [];
  return o.shape === 'ellipse' ? ellipseInQuad(o.quad) : o.shape === 'polygon' && o.polygon ? o.polygon : o.corner ? roundedInQuad(o.quad, o.corner) : o.quad;
}
const area = (poly: Pt[]) => Math.abs(poly.reduce((s, p, i) => { const q = poly[(i + 1) % poly.length]; return s + p[0] * q[1] - q[0] * p[1]; }, 0)) / 2;

/** 꼭지가 가리키는 사인물 (없으면 null). 여러 개면 가장 작은 것(안쪽 것) */
export function objectAtPoint(objects: SignObject[], photoId: string, pt: Pt): SignObject | null {
  let best: SignObject | null = null, bestArea = Infinity;
  for (const o of objects) {
    if (o.photoId !== photoId) continue;
    const poly = outlineOf(o);
    if (poly.length < 3 || !pointInPolygon(pt, poly)) continue;
    const a = area(poly);
    if (a < bestArea) { best = o; bestArea = a; }
  }
  return best;
}

/** 이 사인물을 가리키는 지점 말풍선들 (같은 사진, 꼭지가 외곽선 안) */
export function pinsOnObject(pins: Pin[], objects: SignObject[], o: SignObject): Pin[] {
  return pins.filter((p) => p.photoId === o.photoId && objectAtPoint(objects, p.photoId, [p.x, p.y])?.id === o.id);
}
