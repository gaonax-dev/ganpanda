// 조합형 4단계 (2026-10-16 사용자: "4단계 진행해"): 정면도에서 정한 객체 위치를 평면도 카드·리스트 카드·전개도 PDF 에 그린다.
// 객체 좌표(간판 중앙 기준 mm, 위 +) → 그릴 곳(왼쪽 위 기준, 아래 +). 정면도 편집기와 같은 상자(itemBox)와 색.
import type { PartItem, SignObject, SignPart } from './model';
import { itemBox } from './frontView';
import { drawnParts } from './parts';
import { svgText, type TextRenderer } from './svgText';
import { layerOrder, partsOf } from './parts';
import { withSheetAreas } from './sheetArea';

import { COMPONENTS, componentOf, surfaceOf } from './components';

/** 구성 요소 색 (정면도 편집기·카드·PDF·3D 앞면 공용) */
export const PART_COLOR: Record<SignPart['kind'], string> = Object.fromEntries(COMPONENTS.map((c) => [c.kind, c.color])) as Record<SignPart['kind'], string>; // 종류 모듈의 색 (0단계)

export interface LaidItem {
  id: string;
  partKind: SignPart['kind'];
  kind: PartItem['kind'];
  text?: string;
  image?: PartItem['image'];
  /** 도형 (2단계) */
  shape?: PartItem['shape']; fill?: string; stroke?: string;
  color: string;
  /** 왼쪽 위 (그릴 곳 단위, y 아래 +) */
  x: number; y: number; w: number; h: number;
}

/** 사인물(mmW×mmH) 을 W×H 에 그릴 때 객체 자리. 치수나 구성 요소가 없으면 빈 목록 */
export function layoutParts(o: SignObject, mmW: number, mmH: number, W: number, H: number): LaidItem[] {
  // 글자 없는 면 시트도 (2026-10-22 "시트 2d 3d에서 안나온다") — 옛 시트(sheetIds)는 구성 요소로 읽어 면 시트만
  const base = o.parts ?? partsOf(o).filter((p) => componentOf(p.kind).areaFill);
  if (!base.length || !(mmW > 0) || !(mmH > 0)) return [];
  const sx = W / mmW, sy = H / mmH;
  return layerOrder(withSheetAreas(o, drawnParts(o, base))).flatMap((p) => p.items.map((it) => { // 아래 시트부터 그린다 (디자인 파일이 있으면 미리보기 글자·그림은 뺌)
    const b = itemBox(it);
    return {
      id: it.id, partKind: p.kind, kind: it.kind, ...(it.text !== undefined ? { text: it.text } : {}), ...(it.image ? { image: it.image } : {}), ...(it.kind === 'shape' ? { shape: it.shape ?? 'rect', ...(it.fill ? { fill: it.fill } : {}), ...(it.stroke ? { stroke: it.stroke } : {}) } : {}),
      // 채널은 앞면 색(시트), 스카시는 도색을 골랐으면 그 색 (2026-10-17)
      color: surfaceOf(p).face ?? componentOf(p.kind).color, // 채널 앞면·시트 색·스카시 도색 — 재료 층 마감 > 종류 모듈의 도색 키 (2026-10-21)
      x: W / 2 + (b.x - b.w / 2) * sx, y: H / 2 - (b.y + b.h / 2) * sy, w: b.w * sx, h: b.h * sy,
    };
  }));
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const f = (n: number) => n.toFixed(2);

/** 객체 SVG 조각: 글자는 상자 폭에 맞춘 글자(구성 요소 색, 렌더러 기본 <text> — 윤곽선이면 <path>), 그림은 image(주소가 있을 때) 또는 점선 상자. ox·oy 만큼 옮겨서 */
export function partsSvg(items: LaidItem[], hrefOf: (l: LaidItem) => string | undefined, ox = 0, oy = 0, text: TextRenderer = svgText): string {
  return items.map((l) => {
    const x = ox + l.x, y = oy + l.y;
    if (l.kind === 'text') {
      const t = (l.text ?? '').trim();
      if (!t) return '';
      return text(t, { x: x + l.w / 2, y: y + l.h / 2, size: l.h * 0.9, weight: 700, fitWidth: l.w * 0.96, anchor: 'middle', baseline: 'central', fill: l.color });
    }
    if (l.kind === 'shape') return shapeSvg(l, x, y);
    const href = hrefOf(l);
    return href
      ? `<image xlink:href="${esc(href)}" href="${esc(href)}" x="${f(x)}" y="${f(y)}" width="${f(l.w)}" height="${f(l.h)}" preserveAspectRatio="none"/>`
      : `<rect x="${f(x)}" y="${f(y)}" width="${f(l.w)}" height="${f(l.h)}" fill="none" stroke="${l.color}" stroke-width="${f(Math.max(l.w, l.h) * 0.01)}" stroke-dasharray="${f(Math.max(l.w, l.h) * 0.04)}"/>`;
  }).join('');
}

/** 도형 SVG (2단계): 사각 · 원(타원) · 선(왼쪽 아래→오른쪽 위 대각선은 아니고 상자 가로 가운데 선). 채움·선 색이 없으면 종류 색의 점선 상자 */
export function shapeSvg(l: Pick<LaidItem, 'shape' | 'fill' | 'stroke' | 'w' | 'h' | 'color'>, x: number, y: number): string {
  const fill = l.fill ?? 'none', stroke = l.stroke ?? (l.fill ? 'none' : l.color);
  const sw = f(Math.max(0.5, Math.max(l.w, l.h) * 0.02));
  const dash = l.fill || l.stroke ? '' : ` stroke-dasharray="${f(Math.max(l.w, l.h) * 0.04)}"`;
  if (l.shape === 'ellipse') return `<ellipse cx="${f(x + l.w / 2)}" cy="${f(y + l.h / 2)}" rx="${f(l.w / 2)}" ry="${f(l.h / 2)}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"${dash}/>`;
  if (l.shape === 'line') return `<line x1="${f(x)}" y1="${f(y + l.h / 2)}" x2="${f(x + l.w)}" y2="${f(y + l.h / 2)}" stroke="${l.stroke ?? l.fill ?? l.color}" stroke-width="${f(Math.max(0.5, l.h * 0.5))}"/>`;
  return `<rect x="${f(x)}" y="${f(y)}" width="${f(l.w)}" height="${f(l.h)}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"${dash}/>`;
}

