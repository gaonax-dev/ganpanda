// SVG 글자 렌더러 (2026-10-17 사용자: "리스트가 일러스트로 내보내기 되는가?" → "비율, 윤곽선은 옵션으로").
// 기본은 <text>, 윤곽선 옵션이면 폰트(opentype.js)로 <path> — 일러스트레이터에 폰트가 없어도 같은 모양.
import type { Font } from 'opentype.js';

export interface TextSpec {
  x: number; y: number;
  /** 글자 크기 (SVG 단위 = 용지 mm) */
  size: number;
  anchor?: 'start' | 'middle' | 'end';
  /** central = 세로 가운데를 y 에 (구성 요소 글자), alphabetic = 기준선 (기본) */
  baseline?: 'alphabetic' | 'central';
  /** 주어지면 이 폭에 정확히 맞춰 늘이고 줄인다 (textLength spacingAndGlyphs 와 같음) */
  fitWidth?: number;
  fill: string;
  weight?: number;
  /** 추가 속성 (data-…, font-family 등은 호출자가) */
  extra?: string;
}
export type TextRenderer = (text: string, s: TextSpec) => string;

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const f = (n: number) => n.toFixed(2);

/** <text> 그대로 */
export const svgText: TextRenderer = (text, s) => {
  const attrs = [`x="${f(s.x)}"`, `y="${f(s.y)}"`, `font-size="${f(s.size)}"`, `fill="${s.fill}"`];
  if (s.weight) attrs.push(`font-weight="${s.weight}"`);
  if (s.anchor && s.anchor !== 'start') attrs.push(`text-anchor="${s.anchor}"`);
  if (s.baseline === 'central') attrs.push('dominant-baseline="central"');
  if (s.fitWidth !== undefined) attrs.push(`textLength="${f(s.fitWidth)}"`, 'lengthAdjust="spacingAndGlyphs"');
  if (s.extra) attrs.push(s.extra);
  return `<text ${attrs.join(' ')}>${esc(text)}</text>`;
};

/** 폰트로 글자를 <path> 로. 기준선·정렬·폭 맞춤을 <text> 와 같게 */
export function outlineRenderer(font: Font): TextRenderer {
  const upm = font.unitsPerEm;
  return (text, s) => {
    if (!text) return '';
    const width = font.getAdvanceWidth(text, s.size);
    const kx = s.fitWidth !== undefined && width > 0 ? s.fitWidth / width : 1;
    const w = width * kx;
    const x0 = s.anchor === 'middle' ? s.x - w / 2 : s.anchor === 'end' ? s.x - w : s.x;
    // central: 글자 상자(어센더~디센더)의 가운데가 y 에 오게
    const y0 = s.baseline === 'central' ? s.y + ((font.ascender + font.descender) / 2 / upm) * s.size : s.y;
    const d = font.getPath(text, 0, 0, s.size).toPathData(2);
    if (!d) return '';
    const transform = kx === 1 ? `translate(${f(x0)} ${f(y0)})` : `translate(${f(x0)} ${f(y0)}) scale(${kx.toFixed(4)} 1)`;
    return `<path d="${d}" fill="${s.fill}" transform="${transform}"${s.extra ? ` ${s.extra}` : ''}/>`;
  };
}
