// 규칙 기반 견적 (2-2): 사인물 + 단가표 + 설치비·추가 항목 → 견적
import { CHANNEL_OPTIONS, productById, sheetById, signParts } from './catalog';
import type { ExtraItem, SignObject } from './model';
import type { PriceTable } from './pricing';
import { polygonArea, quadToRect } from './perspective';
import { applyHomography } from './homography';

export const VAT_RATE = 0.1;

export interface QuoteLine { objectId: string; label: string; detail: string; amount: number }
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
  const finish = (label: string, detail: string, raw: number) => {
    let amount = roundTo(raw, prices.rounding);
    if (amount < prices.minimum) { amount = prices.minimum; detail += ` · 최소 ${fmt(prices.minimum)}원 적용`; }
    lines.push({ objectId: o.id, label, detail, amount });
  };
  // 간판 = 몸통(㎡) + 채널 옵션(자·cm). 옛 데이터(채널 제품이 종류)는 몸통 없음 + 채널
  const { bodyId, channelId, scashiId } = signParts(o);
  const body = productById(bodyId);
  if (body && body.unit === 'm2') {
    const label = `${o.name} · ${body.name}`;
    const unit = prices.products[body.id] ?? 0;
    if (!sized) lines.push({ objectId: o.id, label, detail: '치수 필요', amount: 0 });
    else {
      const m2 = (o.widthMm! * o.heightMm!) / 1e6;
      finish(label, `${size} = ${m2.toFixed(2)}㎡ × ${fmt(unit)}원`, m2 * unit);
    }
  }
  // 개 단위(사인미러·전광판·지주·에어간판): 치수와 무관하게 1식
  if (body && body.unit === 'ea') finish(`${o.name} · ${body.name}`, `1식 × ${fmt(prices.products[body.id] ?? 0)}원`, prices.products[body.id] ?? 0);
  if (channelId) {
    const ch = productById(channelId)!;
    const label = `${o.name} · ${CHANNEL_OPTIONS.find((c) => c.id === channelId)?.label ?? ch.name}`;
    const unit = prices.products[channelId] ?? 0;
    const chH = Number(o.options?.chHeight) || o.heightMm; // 글자 높이: 옵션, 없으면 간판 높이
    if (!chH) lines.push({ objectId: o.id, label, detail: '치수 필요', amount: 0 });
    else {
      const n = charCountOf(o);
      if (!n) lines.push({ objectId: o.id, label, detail: '문구 또는 글자수 필요', amount: 0 });
      else finish(label, `${n}자 × 높이 ${fmt(chH)}mm × ${fmt(unit)}원/자·cm`, n * (chH / 10) * unit);
    }
  }
  // 간판에 붙인 스카시 (2026-10-15 사용자: "스카시도 부착된다"): 채널처럼 자·cm, 글자 높이는 스카시 글자 높이 옵션 > 간판 높이
  if (scashiId) {
    const sc = productById(scashiId)!;
    const label = `${o.name} · ${sc.name}`;
    const unit = prices.products[scashiId] ?? 0;
    const h = Number(o.options?.scHeight) || o.heightMm;
    const n = charCountOf(o);
    if (!h) lines.push({ objectId: o.id, label, detail: '치수 필요', amount: 0 });
    else if (!n) lines.push({ objectId: o.id, label, detail: '문구 또는 글자수 필요', amount: 0 });
    else finish(label, `${n}자 × 높이 ${fmt(h)}mm × ${fmt(unit)}원/자·cm`, n * (h / 10) * unit);
  }
  for (const id of o.sheetIds) {
    const s = sheetById(id);
    if (!s) continue;
    const label = `${o.name} · ${s.name}`;
    if (!sized) { lines.push({ objectId: o.id, label, detail: '치수 필요', amount: 0 }); continue; }
    const m2 = shapeAreaM2(o);
    finish(label, `${m2.toFixed(2)}㎡ × ${fmt(prices.sheets[id] ?? 0)}원`, m2 * (prices.sheets[id] ?? 0));
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
