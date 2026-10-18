// 사인물 전개도 → SVG (최종 출력용, PDF 는 이 SVG 를 인쇄해 만든다. 일러스트레이터용 SVG 내려받기는 비율·윤곽선 옵션)
// 2026-10-15 사용자: "리스트 뷰는 최종 출력에 사용될 것이다. 최종 출력에 사용되기 전에 svg 를 사용해 사인물을 pdf 로 작성한다"
// 2026-10-17 사용자: "리스트가 일러스트로 내보내기 되는가?" → "비율, 윤곽선은 옵션으로"
import { partsSvg, type LaidItem } from './partsLayout';
import { svgText, type TextRenderer } from './svgText';

export interface SvgCard {
  id: string; name: string;
  /** 배치 (mm, 리스트 뷰 좌표) */
  x: number; y: number; w: number; h: number;
  estimated?: boolean;
  /** 종류·옵션·문구 등 한 줄씩 */
  lines: string[];
  amount?: string;
  /** 입힌 디자인 이미지 (data URL 또는 URL) 와 페이지 px 기준 잘라낸 영역 */
  image?: { href: string; pageW: number; pageH: number; crop: { x: number; y: number; w: number; h: number } };
  /** 둥근 모서리 비율 */
  corner?: number;
  /** 조합형 객체 (카드 mm 크기 w×h 에 배치한 것, layoutParts) 와 그림 주소(객체 id → data URL) — 2026-10-16 4단계 */
  items?: LaidItem[];
  itemHrefs?: Record<string, string>;
}
export interface SvgSheet {
  title: string; subtitle?: string; cards: SvgCard[];
  /** 용지 mm (scale 이 없을 때, 기본 A4 가로) */
  pageW?: number; pageH?: number; margin?: number;
  /** 고정 비율 (1 = 실물 1:1, 0.1 = 1:10). 주면 용지가 A4 가 아니라 카드 전체 + 여백 크기가 된다 (일러스트레이터용) */
  scale?: number;
  /** 글자 렌더러: 기본 <text>, 윤곽선이면 outlineRenderer(font) */
  text?: TextRenderer;
  /** 대지 레이어 (2026-10-18 "사인물을 대지별로 담아서 일러스트로", "현재 구성한 레이아웃이 유지되어야"): 사인물마다 같은 자리에 보이지 않는 사각형을 `id="대지"` 레이어로 — 일러스트레이터에서 그 레이어를 선택해 [오브젝트 › 대지 › 선택 오브젝트를 대지로 변환] 하면 배치 그대로 대지가 된다 */
  artboards?: boolean;
}

/** 글자 폭 추정 (용지 mm): 한글·한자 1em, 그 외 0.6em */
const textWidth = (s: string, size: number) => [...s].reduce((w, ch) => w + (ch.charCodeAt(0) > 0x2e80 ? 1 : 0.6) * size, 0);
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const fmt = (n: number) => Math.round(n).toLocaleString('ko-KR');

/** 카드 묶음의 mm 경계 (라벨 여백 포함) */
export function cardsBounds(cards: SvgCard[]): { x: number; y: number; w: number; h: number } {
  if (!cards.length) return { x: 0, y: 0, w: 1000, h: 1000 };
  const x0 = Math.min(...cards.map((c) => c.x)), y0 = Math.min(...cards.map((c) => c.y));
  const x1 = Math.max(...cards.map((c) => c.x + c.w)), y1 = Math.max(...cards.map((c) => c.y + c.h));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/**
 * 기본: A4 가로(297×210mm) 한 장에 전부 들어가도록 축척을 정해 그린다. scale 을 주면 그 비율로, 용지는 내용 크기에 맞춘다.
 * 치수선(위·옆)과 이름·사양·금액을 카드 아래에. 글자 크기는 용지 mm 기준 고정(축척과 무관)이라 어떤 축척에서도 읽힌다
 */
export function listSvg(sheet: SvgSheet): string {
  const T = sheet.text ?? svgText;
  const m = sheet.margin ?? 12;
  const header = 14, labelH = 16, dimPad = 10; // mm (용지)
  const b = cardsBounds(sheet.cards);
  // 라벨(이름·사양 줄·금액)이 카드 아래로 뻗는 높이: 가장 긴 라벨 기준
  const labelLines = Math.max(0, ...sheet.cards.map((c) => c.lines.length + (c.amount ? 1 : 0)));
  const labelsH = labelH + 3.6 * labelLines;
  let pageW: number, pageH: number, k: number;
  if (sheet.scale) {
    k = sheet.scale;
    // 카드 아래 라벨(이름·사양·금액)은 카드보다 넓을 수 있다 — 오른쪽으로 넘치는 만큼 용지를 넓힌다 (글자 폭 추정: 한글 1em, 그 외 0.6em)
    const labelRight = Math.max(0, ...sheet.cards.map((c) => (c.x - b.x) * k + Math.max(textWidth(c.name, 3.2), ...c.lines.map((l) => textWidth(l, 2.6)), c.amount ? textWidth(c.amount, 2.8) : 0)));
    pageW = Math.ceil(Math.max(b.w * k, labelRight) + m * 2 + dimPad + 12);
    pageH = Math.ceil(b.h * k + m * 2 + header + dimPad + labelsH);
  } else {
    pageW = sheet.pageW ?? 297; pageH = sheet.pageH ?? 210;
    const availW = pageW - m * 2 - dimPad, availH = pageH - m * 2 - header - labelH - dimPad;
    k = Math.min(availW / b.w, availH / b.h, 1); // 1 = 실물보다 크게 그리지 않음 (mm 그대로면 1:1)
  }
  const ox = m + dimPad - b.x * k, oy = m + header + dimPad - b.y * k;
  const X = (x: number) => (ox + x * k).toFixed(2), Y = (y: number) => (oy + y * k).toFixed(2);
  const parts: string[] = [];
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${pageW}mm" height="${pageH}mm" viewBox="0 0 ${pageW} ${pageH}" font-family="Pretendard, 'Apple SD Gothic Neo', sans-serif">`);
  parts.push(`<rect width="${pageW}" height="${pageH}" fill="#fff"/>`);
  parts.push(T(sheet.title, { x: m, y: m + 6, size: 5, weight: 700, fill: '#111' }));
  if (sheet.subtitle) parts.push(T(sheet.subtitle, { x: pageW - m, y: m + 6, size: 3, fill: '#666', anchor: 'end' }));
  const ratio = 1 / k;
  parts.push(T(`축척 1:${Number.isInteger(ratio) ? ratio : ratio.toFixed(1)} · 치수 mm`, { x: m, y: m + 10.5, size: 2.6, fill: '#888' }));
  parts.push('<defs>');
  for (const c of sheet.cards) {
    if (!c.image) continue;
    parts.push(`<clipPath id="clip-${esc(c.id)}"><rect x="${X(c.x)}" y="${Y(c.y)}" width="${(c.w * k).toFixed(2)}" height="${(c.h * k).toFixed(2)}" rx="${c.corner ? (Math.min(0.5, c.corner) * Math.min(c.w, c.h) * k).toFixed(2) : 0}"/></clipPath>`);
  }
  parts.push('</defs>');
  for (const c of sheet.cards) {
    const w = c.w * k, h = c.h * k;
    const rx = c.corner ? Math.min(0.5, c.corner) * Math.min(c.w, c.h) * k : 0;
    parts.push(`<g data-card="${esc(c.id)}">`);
    parts.push(`<rect x="${X(c.x)}" y="${Y(c.y)}" width="${w.toFixed(2)}" height="${h.toFixed(2)}" rx="${rx.toFixed(2)}" fill="#f1efe9" stroke="#333" stroke-width="0.3"/>`);
    if (c.image) {
      // 잘라낸 영역이 카드에 꽉 차게: 페이지 전체를 카드 축척으로 늘리고 영역만 보이게
      const sx = w / c.image.crop.w, sy = h / c.image.crop.h;
      parts.push(`<image clip-path="url(#clip-${esc(c.id)})" href="${esc(c.image.href)}" x="${(ox + c.x * k - c.image.crop.x * sx).toFixed(2)}" y="${(oy + c.y * k - c.image.crop.y * sy).toFixed(2)}" width="${(c.image.pageW * sx).toFixed(2)}" height="${(c.image.pageH * sy).toFixed(2)}" preserveAspectRatio="none"/>`);
    }
    // 조합형 객체: 카드 좌표(mm)에서 그려 translate·scale 로 — 글자 렌더러에는 용지 좌표로 바꿔 넘긴다 (윤곽선 path 가 변환에 영향받지 않게)
    if (c.items?.length) parts.push(`<g data-items="${esc(c.id)}">${partsSvg(c.items.map((l) => ({ ...l, x: ox + (c.x + l.x) * k, y: oy + (c.y + l.y) * k, w: l.w * k, h: l.h * k })), (l) => c.itemHrefs?.[l.id], 0, 0, T)}</g>`);
    // 치수선: 위(가로), 오른쪽(세로)
    const ty = oy + c.y * k - 3, rx2 = ox + (c.x + c.w) * k + 3;
    parts.push(`<line x1="${X(c.x)}" y1="${ty.toFixed(2)}" x2="${X(c.x + c.w)}" y2="${ty.toFixed(2)}" stroke="#2f8bff" stroke-width="0.25"/>`);
    parts.push(T(`${fmt(c.w)}${c.estimated ? ' (추정)' : ''}`, { x: ox + (c.x + c.w / 2) * k, y: ty - 1, size: 2.8, fill: '#2f8bff', anchor: 'middle' }));
    parts.push(`<line x1="${rx2.toFixed(2)}" y1="${Y(c.y)}" x2="${rx2.toFixed(2)}" y2="${Y(c.y + c.h)}" stroke="#2f8bff" stroke-width="0.25"/>`);
    parts.push(T(fmt(c.h), { x: rx2 + 1.5, y: oy + (c.y + c.h / 2) * k + 1, size: 2.8, fill: '#2f8bff' }));
    // 라벨
    const ly = oy + (c.y + c.h) * k + 4;
    parts.push(T(c.name, { x: ox + c.x * k, y: ly, size: 3.2, weight: 700, fill: '#111' }));
    c.lines.forEach((l, i) => parts.push(T(l, { x: ox + c.x * k, y: ly + 3.6 * (i + 1), size: 2.6, fill: '#444' })));
    if (c.amount) parts.push(T(c.amount, { x: ox + c.x * k, y: ly + 3.6 * (c.lines.length + 1), size: 2.8, weight: 700, fill: '#b58900' }));
    parts.push('</g>');
  }
  if (sheet.artboards) {
    parts.push('<g id="대지" data-layer="artboards">');
    for (const c of sheet.cards) parts.push(`<rect data-artboard="${esc(c.id)}" data-name="${esc(c.name)}" x="${X(c.x)}" y="${Y(c.y)}" width="${(c.w * k).toFixed(2)}" height="${(c.h * k).toFixed(2)}" fill="none" stroke="none"/>`);
    parts.push('</g>');
  }
  parts.push('</svg>');
  return parts.join('\n');
}
