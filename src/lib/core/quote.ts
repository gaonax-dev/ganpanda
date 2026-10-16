// 규칙 기반 견적 (2-2): 사인물 + 단가표 + 설치비·추가 항목 → 견적
import { topLightOf } from './topLight';
import { partLabel, partsOf } from './parts';
import { isChannelProduct, productById, sheetById, signParts, takesLetters } from './catalog';
import type { ExtraItem, SignObject } from './model';
import type { PriceTable } from './pricing';
import { supplierTagOf } from './supplierPrices';
import { polygonArea, quadToRect } from './perspective';
import { applyHomography } from './homography';

export const VAT_RATE = 0.1;

export interface QuoteLine { objectId: string; label: string; detail: string; amount: number; /** 연결된 공급 단가의 꼬리표 (예: '한울') */ supplier?: string }
export interface Quote {
  lines: QuoteLine[];
  /** 사인물 항목 합계 */
  itemsTotal: number;
  install: number;
  extras: ExtraItem[];
  /** 항목 + 설치비 + 추가 항목 */
  subtotal: number;
  vat: number;
  total: number;
  vatIncluded: boolean;
}
export interface QuoteOptions { extras?: ExtraItem[]; /** null/undefined = 단가표 기본 설치비 */ installFee?: number | null }

export const won = (n: number) => Math.round(n).toLocaleString('ko-KR') + '원';
const fmt = (n: number) => Math.round(n).toLocaleString('ko-KR');

/** 글자수: 수동 입력 우선, 없으면 문구에서 공백·줄바꿈 제외 */
export function charCountOf(o: Pick<SignObject, 'text' | 'charCount'>): number {
  if (o.charCount) return o.charCount;
  return [...(o.text ?? '')].filter((c) => c.trim()).length;
}

/** 실제 도형 면적(㎡). 사각=w·h, 둥근 사각=w·h−(4−π)r², 원=π/4·w·h, 다각형=정면 보정 후 면적 */
export function shapeAreaM2(o: SignObject): number {
  const w = o.widthMm!, h = o.heightMm!;
  if (o.shape === 'ellipse') return ((Math.PI / 4) * w * h) / 1e6;
  if (o.shape === 'rect' && o.corner) { const r = Math.min(0.5, o.corner) * Math.min(w, h); return (w * h - (4 - Math.PI) * r * r) / 1e6; }
  if (o.shape === 'polygon' && o.polygon?.length) {
    try {
      const H = quadToRect(o.quad, w, h);
      return polygonArea(o.polygon.map((p) => applyHomography(H, p))) / 1e6;
    } catch { /* 찌그러진 영역 → 외곽 사각형 면적 */ }
  }
  return (w * h) / 1e6;
}

const roundTo = (n: number, unit: number) => Math.round(n / unit) * unit;

export function quoteObject(o: SignObject, prices: PriceTable): QuoteLine[] {
  const lines: QuoteLine[] = [];
  const sized = !!(o.widthMm && o.heightMm);
  const size = sized ? `${fmt(o.widthMm!)}×${fmt(o.heightMm!)}mm` : '';
  const finish = (label: string, detail: string, raw: number, priceId?: string) => {
    let amount = roundTo(raw, prices.rounding);
    if (amount < prices.minimum) { amount = prices.minimum; detail += ` · 최소 ${fmt(prices.minimum)}원 적용`; }
    const supplier = supplierTagOf(priceId && prices.links?.[priceId]);
    lines.push({ objectId: o.id, label, detail: supplier ? `${detail} · ${supplier} 단가` : detail, amount, ...(supplier ? { supplier } : {}) });
  };
  // 간판 = 몸통(㎡) + 채널 옵션(자·cm). 옛 데이터(채널 제품이 종류)는 몸통 없음 + 채널
  const { bodyId } = signParts(o);
  const body = productById(bodyId);
  if (body && body.unit === 'm2') {
    const label = `${o.name} · ${body.name}`;
    const unit = prices.products[body.id] ?? 0;
    if (!sized) lines.push({ objectId: o.id, label, detail: '치수 필요', amount: 0 });
    else {
      const m2 = (o.widthMm! * o.heightMm!) / 1e6;
      finish(label, `${size} = ${m2.toFixed(2)}㎡ × ${fmt(unit)}원`, m2 * unit, body.id);
    }
  }
  // 개 단위(사인미러·전광판·지주·에어간판): 치수와 무관하게 1식
  if (body && body.unit === 'ea') finish(`${o.name} · ${body.name}`, `1식 × ${fmt(prices.products[body.id] ?? 0)}원`, prices.products[body.id] ?? 0, body.id);
  // 조합형 (2026-10-16): 채널·스카시 구성 요소마다 글자 객체의 (글자수 × 높이 cm × 원/자·cm) 합. 옛 데이터는 읽을 때 구성 요소로 바뀐다
  const parts = partsOf(o);
  const usesParts = takesLetters(o.productId) || isChannelProduct(o.productId);
  for (const p of parts.filter((x) => x.kind !== 'sheet')) {
    const label = `${o.name} · ${partLabel(p)}`, unit = prices.products[p.type] ?? 0;
    const texts = p.items.filter((it) => it.kind === 'text').map((it) => ({ t: (it.text ?? '').trim(), n: it.count ?? charCountOf({ text: it.text }), h: it.h || o.heightMm || 0 })).filter((x) => x.n > 0);
    if (!texts.length) { lines.push({ objectId: o.id, label, detail: o.heightMm || p.items.some((it) => it.h) ? '문구 또는 글자수 필요' : '치수 필요', amount: 0 }); continue; }
    if (texts.some((x) => !x.h)) { lines.push({ objectId: o.id, label, detail: '치수 필요', amount: 0 }); continue; }
    const raw = texts.reduce((a, x) => a + x.n * (x.h / 10) * unit, 0);
    const detail = texts.length === 1 ? `${texts[0].n}자 × 높이 ${fmt(texts[0].h)}mm × ${fmt(unit)}원/자·cm` : `${texts.map((x) => `"${x.t}" ${x.n}자×${fmt(x.h)}mm`).join(' + ')} × ${fmt(unit)}원/자·cm`;
    finish(label, detail, raw, p.type);
  }
  // 상단 조명 (2026-10-16): 투광등 = 개수 × 원/개, 트러스 = 간판 가로(m) × 원/m
  const tl = topLightOf(o);
  if (tl) {
    const label = `${o.name} · ${tl.label}`, unit = prices.products[tl.priceId] ?? 0;
    if (tl.kind === 'arm') finish(label, `${tl.count}개 × ${fmt(unit)}원`, tl.count * unit, tl.priceId);
    else if (!o.widthMm) lines.push({ objectId: o.id, label, detail: '치수 필요', amount: 0 });
    else finish(label, `가로 ${(o.widthMm / 1000).toFixed(2)}m × ${fmt(unit)}원/m`, (o.widthMm / 1000) * unit, tl.priceId);
  }
  // 시트 구성 요소: 객체가 크기(가로·세로)를 가지면 그 면적 합, 아니면 간판 면적
  for (const p of parts.filter((x) => x.kind === 'sheet')) {
    const sh = sheetById(p.type);
    if (!sh) continue;
    const label = `${o.name} · ${sh.name}`, unit = prices.sheets[p.type] ?? 0;
    const sizedItems = p.items.filter((it) => it.w && it.h);
    if (!sizedItems.length && !sized) { lines.push({ objectId: o.id, label, detail: '치수 필요', amount: 0 }); continue; }
    const m2 = sizedItems.length ? sizedItems.reduce((a, it) => a + (it.w! * it.h) / 1e6, 0) : shapeAreaM2(o);
    finish(label, `${m2.toFixed(2)}㎡ × ${fmt(unit)}원`, m2 * unit, p.type);
  }
  for (const id of usesParts ? [] : o.sheetIds) {
    const s = sheetById(id);
    if (!s) continue;
    const label = `${o.name} · ${s.name}`;
    if (!sized) { lines.push({ objectId: o.id, label, detail: '치수 필요', amount: 0 }); continue; }
    const m2 = shapeAreaM2(o);
    finish(label, `${m2.toFixed(2)}㎡ × ${fmt(prices.sheets[id] ?? 0)}원`, m2 * (prices.sheets[id] ?? 0), id);
  }
  return lines;
}

export function quoteProject(objs: SignObject[], prices: PriceTable, opts: QuoteOptions = {}): Quote {
  const lines = objs.flatMap((o) => quoteObject(o, prices));
  const itemsTotal = lines.reduce((a, l) => a + l.amount, 0);
  const install = opts.installFee ?? prices.install;
  const extras = opts.extras ?? [];
  const subtotal = itemsTotal + install + extras.reduce((a, e) => a + e.amount, 0);
  if (prices.vatIncluded) {
    const vat = Math.round(subtotal - subtotal / (1 + VAT_RATE));
    return { lines, itemsTotal, install, extras, subtotal, vat, total: subtotal, vatIncluded: true };
  }
  const vat = Math.round(subtotal * VAT_RATE);
  return { lines, itemsTotal, install, extras, subtotal, vat, total: subtotal + vat, vatIncluded: false };
}
