// 조합형 4단계 (2026-10-16 사용자: "4단계 진행해"): 정면도에서 정한 객체 위치를 평면도 카드·리스트 카드·전개도 PDF 에 그린다.
// 객체 좌표(간판 중앙 기준 mm, 위 +) → 그릴 곳(왼쪽 위 기준, 아래 +). 정면도 편집기와 같은 상자(itemBox)와 색.
import type { PartItem, SignObject, SignPart } from './model';
import { itemBox } from './frontView';

/** 구성 요소 색 (정면도 편집기·카드·PDF·3D 앞면 공용) */
export const PART_COLOR: Record<SignPart['kind'], string> = { channel: '#ff6b5e', scashi: '#e0b85a', sheet: '#5aa8ff' };

export interface LaidItem {
  id: string;
  partKind: SignPart['kind'];
  kind: PartItem['kind'];
  text?: string;
  image?: PartItem['image'];
  color: string;
  /** 왼쪽 위 (그릴 곳 단위, y 아래 +) */
  x: number; y: number; w: number; h: number;
}

/** 사인물(mmW×mmH) 을 W×H 에 그릴 때 객체 자리. 치수나 구성 요소가 없으면 빈 목록 */
export function layoutParts(o: SignObject, mmW: number, mmH: number, W: number, H: number): LaidItem[] {
  if (!o.parts || !(mmW > 0) || !(mmH > 0)) return [];
  const sx = W / mmW, sy = H / mmH;
  return o.parts.flatMap((p) => p.items.map((it) => {
    const b = itemBox(it);
    return {
      id: it.id, partKind: p.kind, kind: it.kind, ...(it.text !== undefined ? { text: it.text } : {}), ...(it.image ? { image: it.image } : {}), color: PART_COLOR[p.kind],
      x: W / 2 + (b.x - b.w / 2) * sx, y: H / 2 - (b.y + b.h / 2) * sy, w: b.w * sx, h: b.h * sy,
    };
  }));
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const f = (n: number) => n.toFixed(2);

/** 객체 SVG 조각: 글자는 상자 폭에 맞춘 text(구성 요소 색), 그림은 image(주소가 있을 때) 또는 점선 상자. ox·oy 만큼 옮겨서 */
export function partsSvg(items: LaidItem[], hrefOf: (l: LaidItem) => string | undefined, ox = 0, oy = 0): string {
  return items.map((l) => {
    const x = ox + l.x, y = oy + l.y;
    if (l.kind === 'text') {
      const t = (l.text ?? '').trim();
      if (!t) return '';
      return `<text x="${f(x + l.w / 2)}" y="${f(y + l.h / 2)}" font-size="${f(l.h * 0.9)}" font-weight="700" textLength="${f(l.w * 0.96)}" lengthAdjust="spacingAndGlyphs" text-anchor="middle" dominant-baseline="central" fill="${l.color}">${esc(t)}</text>`;
    }
    const href = hrefOf(l);
    return href
      ? `<image href="${esc(href)}" x="${f(x)}" y="${f(y)}" width="${f(l.w)}" height="${f(l.h)}" preserveAspectRatio="none"/>`
      : `<rect x="${f(x)}" y="${f(y)}" width="${f(l.w)}" height="${f(l.h)}" fill="none" stroke="${l.color}" stroke-width="${f(Math.max(l.w, l.h) * 0.01)}" stroke-dasharray="${f(Math.max(l.w, l.h) * 0.04)}"/>`;
  }).join('');
}
