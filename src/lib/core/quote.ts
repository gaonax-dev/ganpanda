// 규칙 기반 견적: 사인물 리스트 → 견적
import { productById, sheetById } from './catalog';
import type { SignObject } from './model';
import { polygonArea, quadToRect } from './perspective';
import { applyHomography } from './homography';

export const VAT_RATE = 0.1;

export interface QuoteLine { objectId: string; label: string; detail: string; amount: number }
export interface Quote { lines: QuoteLine[]; subtotal: number; vat: number; total: number }

export const won = (n: number) => Math.round(n).toLocaleString('ko-KR') + '원';
const fmt = (n: number) => Math.round(n).toLocaleString('ko-KR');

/** 실제 도형 면적(㎡). 사각=w·h, 원=π/4·w·h, 다각형=정면 보정 후 면적 */
export function shapeAreaM2(o: SignObject): number {
  const w = o.widthMm!, h = o.heightMm!;
  if (o.shape === 'ellipse') return ((Math.PI / 4) * w * h) / 1e6;
  if (o.shape === 'polygon' && o.polygon?.length) {
    try {
      const H = quadToRect(o.quad, w, h);
      return polygonArea(o.polygon.map((p) => applyHomography(H, p))) / 1e6;
    } catch { /* 찌그러진 영역 → 외곽 사각형 면적 */ }
  }
  return (w * h) / 1e6;
}

export function quoteObject(o: SignObject): QuoteLine[] {
  const lines: QuoteLine[] = [];
  const sized = !!(o.widthMm && o.heightMm);
  const size = sized ? `${fmt(o.widthMm!)}×${fmt(o.heightMm!)}mm` : '';
  const p = productById(o.productId);
  if (p) {
    const label = `${o.name} · ${p.name}`;
    if (!sized) lines.push({ objectId: o.id, label, detail: '치수 필요', amount: 0 });
    else if (p.pricing.type === 'area') {
      const m2 = (o.widthMm! * o.heightMm!) / 1e6;
      lines.push({ objectId: o.id, label, detail: `${size} = ${m2.toFixed(2)}㎡`, amount: Math.round(m2 * p.pricing.perM2) });
    } else if (!o.charCount) {
      lines.push({ objectId: o.id, label, detail: '글자수 필요', amount: 0 });
    } else {
      const unit = p.pricing.perCharPerCm * (o.heightMm! / 10);
      lines.push({ objectId: o.id, label, detail: `${o.charCount}자 × 높이 ${fmt(o.heightMm!)}mm`, amount: Math.round(unit * o.charCount) });
    }
  }
  for (const id of o.sheetIds) {
    const s = sheetById(id);
    if (!s) continue;
    const label = `${o.name} · ${s.name}`;
    if (!sized) { lines.push({ objectId: o.id, label, detail: '치수 필요', amount: 0 }); continue; }
    const m2 = shapeAreaM2(o);
    lines.push({ objectId: o.id, label, detail: `${m2.toFixed(2)}㎡`, amount: Math.round(m2 * s.pricing.perM2) });
  }
  return lines;
}

export function quoteProject(objs: SignObject[]): Quote {
  const lines = objs.flatMap(quoteObject);
  const subtotal = lines.reduce((a, l) => a + l.amount, 0);
  const vat = Math.round(subtotal * VAT_RATE);
  return { lines, subtotal, vat, total: subtotal + vat };
}
