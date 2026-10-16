// 사인물 전개도 → SVG (최종 출력용, PDF 는 이 SVG 를 인쇄해 만든다)
// 2026-10-15 사용자: "리스트 뷰는 최종 출력에 사용될 것이다. 최종 출력에 사용되기 전에 svg 를 사용해 사인물을 pdf 로 작성한다"
import { partsSvg, type LaidItem } from './partsLayout';
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
export interface SvgSheet { title: string; subtitle?: string; cards: SvgCard[]; /** 용지 mm */ pageW?: number; pageH?: number; margin?: number }

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
 * A4 가로(기본 297×210mm) 한 장에 전부 들어가도록 축척을 정해 그린다. 치수선(위·옆)과 이름·사양·금액을 카드 아래에.
 * 글자 크기는 용지 mm 기준 고정(축척과 무관)이라 어떤 축척에서도 읽힌다
 */
export function listSvg(sheet: SvgSheet): string {
  const pageW = sheet.pageW ?? 297, pageH = sheet.pageH ?? 210, m = sheet.margin ?? 12;
  const header = 14, labelH = 16, dimPad = 10; // mm (용지)
  const b = cardsBounds(sheet.cards);
  const availW = pageW - m * 2 - dimPad, availH = pageH - m * 2 - header - labelH - dimPad;
  // 카드 사이 라벨 공간을 위해 세로 여유를 둔다
  const k = Math.min(availW / b.w, availH / (b.h + sheet.cards.length * 0), 1); // 1 = 실물보다 크게 그리지 않음 (mm 그대로면 1:1)
  const ox = m + dimPad - b.x * k, oy = m + header + dimPad - b.y * k;
  const X = (x: number) => (ox + x * k).toFixed(2), Y = (y: number) => (oy + y * k).toFixed(2);
  const parts: string[] = [];
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${pageW}mm" height="${pageH}mm" viewBox="0 0 ${pageW} ${pageH}" font-family="Pretendard, 'Apple SD Gothic Neo', sans-serif">`);
  parts.push(`<rect width="${pageW}" height="${pageH}" fill="#fff"/>`);
  parts.push(`<text x="${m}" y="${m + 6}" font-size="5" font-weight="700" fill="#111">${esc(sheet.title)}</text>`);
  if (sheet.subtitle) parts.push(`<text x="${pageW - m}" y="${m + 6}" font-size="3" fill="#666" text-anchor="end">${esc(sheet.subtitle)}</text>`);
  parts.push(`<text x="${m}" y="${m + 10.5}" font-size="2.6" fill="#888">축척 1:${(1 / k).toFixed(1)} · 치수 mm</text>`);
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
    if (c.items?.length) parts.push(`<g data-items="${esc(c.id)}" transform="translate(${X(c.x)} ${Y(c.y)}) scale(${k.toFixed(6)})">${partsSvg(c.items, (l) => c.itemHrefs?.[l.id])}</g>`);
    // 치수선: 위(가로), 오른쪽(세로)
    const ty = oy + c.y * k - 3, rx2 = ox + (c.x + c.w) * k + 3;
    parts.push(`<line x1="${X(c.x)}" y1="${ty.toFixed(2)}" x2="${X(c.x + c.w)}" y2="${ty.toFixed(2)}" stroke="#2f8bff" stroke-width="0.25"/>`);
    parts.push(`<text x="${(ox + (c.x + c.w / 2) * k).toFixed(2)}" y="${(ty - 1).toFixed(2)}" font-size="2.8" fill="#2f8bff" text-anchor="middle">${fmt(c.w)}${c.estimated ? ' (추정)' : ''}</text>`);
    parts.push(`<line x1="${rx2.toFixed(2)}" y1="${Y(c.y)}" x2="${rx2.toFixed(2)}" y2="${Y(c.y + c.h)}" stroke="#2f8bff" stroke-width="0.25"/>`);
    parts.push(`<text x="${(rx2 + 1.5).toFixed(2)}" y="${(oy + (c.y + c.h / 2) * k + 1).toFixed(2)}" font-size="2.8" fill="#2f8bff">${fmt(c.h)}</text>`);
    // 라벨
    const ly = oy + (c.y + c.h) * k + 4;
    parts.push(`<text x="${X(c.x)}" y="${ly.toFixed(2)}" font-size="3.2" font-weight="700" fill="#111">${esc(c.name)}</text>`);
    c.lines.forEach((l, i) => parts.push(`<text x="${X(c.x)}" y="${(ly + 3.6 * (i + 1)).toFixed(2)}" font-size="2.6" fill="#444">${esc(l)}</text>`));
    if (c.amount) parts.push(`<text x="${X(c.x)}" y="${(ly + 3.6 * (c.lines.length + 1)).toFixed(2)}" font-size="2.8" font-weight="700" fill="#b58900">${esc(c.amount)}</text>`);
    parts.push('</g>');
  }
  parts.push('</svg>');
  return parts.join('\n');
}
