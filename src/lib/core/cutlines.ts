// 칼선 파일 (2026-11-05 roadmap 10-2) — 채널·스카시의 글자 윤곽과 일러스트에서 온 벡터 패스를 실물 1:1(mm) 칼선 SVG 로.
// 커팅 플로터·레이저 RIP 이 읽는 관례대로 'CutContour' 레이어(마젠타 가는 선, 채움 없음)에만 자를 선, 이름표는 따로 'Labels' 레이어. → docs/features/cut-lines.md
import * as THREE from 'three';
import type { Font } from 'opentype.js';
import { textToShapes } from './textShapes';
import { itemBox } from './frontView';
import { componentOf } from './components';
import { partsOf, drawnParts } from './parts';
import { layersOf, placedItems } from './layers';
import { DEFAULT_LETTER3D } from './letter3d';
import type { SignObject } from './model';

export const CUT_LAYER = 'CutContour';
export const CUT_COLOR = '#ff00ff';
const SEG = 6;
const hasText = (t?: string) => !!(t ?? '').trim();

const mapShape = (s: THREE.Shape, f: (v: THREE.Vector2) => THREE.Vector2) => {
  const out = new THREE.Shape(s.getPoints(SEG).map(f));
  out.holes = s.holes.map((h) => new THREE.Path(h.getPoints(SEG).map(f)));
  return out;
};

/** 글자 → 글자 상자(mm) 안 윤곽: 가운데 원점·위 +. 3D 채널(channelGeometry fitBox)과 같은 규칙 — 폰트 크기 = 상자 높이 90%, 폭 = 상자 폭 96%, 세로 중심 = 글자 상자 가운데 */
export function textCutShapes(font: Font, text: string, box: { w: number; h: number }, letterSpacing = 0): THREE.Shape[] {
  const shapes = textToShapes(font, text, letterSpacing);
  if (!shapes.length) return [];
  const pts = shapes.flatMap((s) => s.getPoints(SEG));
  const x0 = Math.min(...pts.map((p) => p.x)), x1 = Math.max(...pts.map((p) => p.x));
  const k = (box.h * 0.9) / 1000;
  const kx = (box.w * 0.96) / Math.max(1e-6, (x1 - x0) * k) * k;
  const cx = (x0 + x1) / 2, cy = ((font.ascender + font.descender) / 2) * (1000 / font.unitsPerEm);
  return shapes.map((s) => mapShape(s, (v) => new THREE.Vector2((v.x - cx) * kx, (v.y - cy) * k)));
}

const n = (v: number) => String(Math.round(v * 100) / 100);
const ring = (pts: THREE.Vector2[], tx: (p: [number, number]) => [number, number]) =>
  pts.length < 3 ? '' : pts.map((p, i) => { const [x, y] = tx([p.x, p.y]); return `${i ? 'L' : 'M'}${n(x)},${n(y)}`; }).join('') + 'Z';

/** 윤곽(바깥 + 구멍) → 하나의 path d. tx = 윤곽 좌표 → SVG 좌표 */
export function shapePathD(shapes: THREE.Shape[], tx: (p: [number, number]) => [number, number]): string {
  return shapes.map((s) => ring(s.getPoints(SEG), tx) + s.holes.map((h) => ring(h.getPoints(SEG), tx)).join('')).join('');
}

export interface CutCard { id: string; name: string; /** 카드 왼쪽 위(mm) */ x: number; y: number; w: number; h: number; /** 페이지 좌표(mm) path d */ paths: string[] }

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** 카드 배치 그대로 한 장의 칼선 SVG (1 단위 = 1mm) */
export function cutSvg(title: string, cards: CutCard[]): string {
  const W = Math.max(1, ...cards.map((c) => c.x + c.w)), H = Math.max(1, ...cards.map((c) => c.y + c.h));
  const font = Math.max(20, Math.min(120, W / 60));
  const cut = cards.flatMap((c) => c.paths.filter(Boolean).map((d) => `<path d="${d}"/>`)).join('');
  const labels = cards.map((c) => `<rect x="${n(c.x)}" y="${n(c.y)}" width="${n(c.w)}" height="${n(c.h)}"/><text x="${n(c.x + font * 0.3)}" y="${n(c.y + font * 1.1)}" fill="#9aa0a6" stroke="none">${esc(c.name)}</text>`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${n(W)}mm" height="${n(H)}mm" viewBox="0 0 ${n(W)} ${n(H)}">`
    + `<title>${esc(title)} 칼선</title>`
    + `<g id="Labels" fill="none" stroke="#9aa0a6" stroke-width="0.5" stroke-dasharray="4 4" font-size="${n(font)}" font-family="sans-serif">${labels}</g>`
    + `<g id="${CUT_LAYER}" fill="none" stroke="${CUT_COLOR}" stroke-width="0.25" fill-rule="evenodd">${cut}</g></svg>`;
}

/** 칼선을 낼 객체: 3D 에서 밀어내는(입체) 구성 요소의 글자·일러스트 벡터 그림 — 사인물 mm, 가운데 원점·위 +. 시트·인쇄·도형은 빠진다 */
export interface CutItem { id: string; partId: string; partKind: string; text?: string; vector?: boolean; x: number; y: number; w: number; h: number; letterSpacing: number }
export function cutItems(o: SignObject): CutItem[] {
  const ls = o.letter3d?.letterSpacing ?? DEFAULT_LETTER3D.letterSpacing;
  return placedItems(layersOf(o, drawnParts(o, partsOf(o))), (part) => componentOf(part.kind).depthMm(part, o)).flatMap(({ item: it, part }): CutItem[] => {
    if (!componentOf(part.kind).extrude) return [];
    const b = itemBox(it);
    const base = { id: it.id, partId: part.id, partKind: part.kind, x: it.x, y: it.y, w: b.w, h: it.h, letterSpacing: ls };
    if (it.kind === 'text' && hasText(it.text)) return [{ ...base, text: it.text!.trim() }];
    if (it.kind === 'image' && it.vector && it.image) return [{ ...base, vector: true }];
    return [];
  });
}
