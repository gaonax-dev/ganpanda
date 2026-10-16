// 규칙 기반 견적 (2-2): 사인물 + 단가표 + 설치비·추가 항목 → 견적
import { topLightOf } from './topLight';
import { partKindsFor, partLabel, partsOf } from './parts';
import { productById, sheetById, signParts } from './catalog';
import type { ExtraItem, SignObject } from './model';
import type { PriceTable } from './pricing';
import { findSupplierItem, supplierTagOf } from './supplierPrices';
import { evalArea, evalLetter, findMethod } from './calcMethods';
import { markupFor } from './markup';
import { polygonArea, quadToRect } from './perspective';
import { applyHomography } from './homography';

export const VAT_RATE = 0.1;

export interface QuoteLine {
  /** 줄 고정 키: <사인물>:body · <사인물>:part:<구성 요소> · <사인물>:top · <사인물>:sheet:<시트> (수동 금액 저장용) */
  key: string;
  objectId: string; label: string; detail: string;
  /** 견적 금액 (수동 금액 또는 자동 금액) */
  amount: number;
  /** 연결된 공급 단가의 꼬리표 (예: '한울') */
  supplier?: string;
  /** 단가표·계산법으로 낸 자동 금액 */
  auto?: number;
  /** 원가 = 공급사 금액(배수 전). 공급 품목 연결·계산법일 때만 */
  cost?: number;
  /** 단가 항목 id (제품·시트) — 단가 연결·계산법을 찾을 때 */
  priceId?: string;
  /** 수동 금액 줄 */
  manual?: boolean;
  /** 수동 모드인데 아직 금액을 넣지 않음 */
  needsInput?: boolean;
  /** 판매가 < 원가 */
  loss?: boolean;
}
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
  /** 원가가 있는 줄의 원가·판매가·이익·이익율, 원가 없는 줄 수 */
  margin: { cost: number; sales: number; profit: number; rate: number | null; uncosted: number };
}
export interface QuoteOptions {
  extras?: ExtraItem[];
  /** null/undefined = 단가표 기본 설치비 */
  installFee?: number | null;
  /** manual = 줄 금액을 직접 넣는다(넣기 전 0원), auto = 자동 금액 (2026-10-16, 기본 auto = 기존 프로젝트) */
  mode?: 'manual' | 'auto';
  /** 줄 키 → 수동 금액 또는 'auto'(자동 전환) */
  lineAmounts?: Record<string, number | 'auto'>;
}

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
/** 계산법 설명의 공급 단가(숫자원)를 배수 적용 단가로 바꿔 보인다 — 고객에게 공급가·배수를 드러내지 않는다 */
const scaled = (detail: string, mk: number) => (mk === 1 ? detail : detail.replace(/([\d,]+)원/g, (_, n: string) => `${fmt(Number(n.replace(/,/g, '')) * mk)}원`));

export function quoteObject(o: SignObject, prices: PriceTable): QuoteLine[] {
  const lines: QuoteLine[] = [];
  const sized = !!(o.widthMm && o.heightMm);
  const size = sized ? `${fmt(o.widthMm!)}×${fmt(o.heightMm!)}mm` : '';
  let key = `${o.id}:body`;
  /** cost: 계산법이면 배수 전 금액을 넘긴다. 없으면 공급 품목 연결에서 (수량 × 공급 단가) */
  const finish = (label: string, detail: string, raw: number, priceId?: string, cost?: number) => {
    let amount = roundTo(raw, prices.rounding);
    if (amount < prices.minimum) { amount = prices.minimum; detail += ` · 최소 ${fmt(prices.minimum)}원 적용`; }
    const supplier = (priceId && findMethod(prices.methods?.[priceId])?.supplier.tag) || supplierTagOf(priceId && prices.links?.[priceId]);
    if (cost === undefined && priceId && !prices.methods?.[priceId]) {
      const hit = findSupplierItem(prices.links?.[priceId]);
      const unit = prices.products[priceId] ?? prices.sheets[priceId];
      if (hit && unit) cost = (raw * hit.item.price) / unit;
    }
    lines.push({ key, objectId: o.id, label, detail: supplier ? `${detail} · ${supplier} 단가` : detail, amount, ...(priceId ? { priceId } : {}), ...(supplier ? { supplier } : {}), ...(cost !== undefined ? { cost: Math.round(cost) } : {}) });
  };
  // 간판 = 몸통(㎡) + 채널 옵션(자·cm). 옛 데이터(채널 제품이 종류)는 몸통 없음 + 채널
  const { bodyId } = signParts(o);
  const body = productById(bodyId);
  if (body && body.unit === 'm2') {
    const label = `${o.name} · ${body.name}`;
    const unit = prices.products[body.id] ?? 0;
    const method = findMethod(prices.methods?.[body.id]);
    if (!sized) lines.push({ key, objectId: o.id, label, detail: '치수 필요', amount: 0 });
    else if (method) {
      // 공급사 계산법 (2026-10-16): 공급 단가 계산 × 배수
      const r = evalArea(method, o.widthMm!, o.heightMm!);
      const mk = markupFor(prices, r.item);
      finish(label, `${size} · ${scaled(r.detail, mk)}`, r.raw * mk, body.id, r.raw);
    } else {
      const m2 = (o.widthMm! * o.heightMm!) / 1e6;
      finish(label, `${size} = ${m2.toFixed(2)}㎡ × ${fmt(unit)}원`, m2 * unit, body.id);
    }
  }
  // 개 단위(사인미러·전광판·지주·에어간판): 치수와 무관하게 1식
  if (body && body.unit === 'ea') finish(`${o.name} · ${body.name}`, `1식 × ${fmt(prices.products[body.id] ?? 0)}원`, prices.products[body.id] ?? 0, body.id);
  // 조합형 (2026-10-16): 채널·스카시 구성 요소마다 글자 객체의 (글자수 × 높이 cm × 원/자·cm) 합. 옛 데이터는 읽을 때 구성 요소로 바뀐다
  const parts = partsOf(o);
  const usesParts = partKindsFor(o).length > 0; // 조합형 분류는 시트도 구성 요소로 (2026-10-16 모든 분류 조합형)
  for (const p of parts.filter((x) => x.kind !== 'sheet')) {
    key = `${o.id}:part:${p.id}`;
    const label = `${o.name} · ${partLabel(p)}`, unit = prices.products[p.type] ?? 0;
    const texts = p.items.filter((it) => it.kind === 'text').map((it) => ({ t: (it.text ?? '').trim(), n: it.count ?? charCountOf({ text: it.text }), h: it.h || o.heightMm || 0 })).filter((x) => x.n > 0);
    if (!texts.length) { lines.push({ key, objectId: o.id, label, detail: o.heightMm || p.items.some((it) => it.h) ? '문구 또는 글자수 필요' : '치수 필요', amount: 0 }); continue; }
    if (texts.some((x) => !x.h)) { lines.push({ key, objectId: o.id, label, detail: '치수 필요', amount: 0 }); continue; }
    const method = findMethod(prices.methods?.[p.type]);
    if (method && method.kind === 'letters') {
      // 공급사 계산법: 글자 크기 구간 자당 × 배수
      const rs = texts.map((x) => { const r = evalLetter(method, x.h, x.t)!; const each = r.item.price * markupFor(prices, r.item); return { ...x, r, each }; });
      const desc = (x: (typeof rs)[number]) => `${x.r.item.option} ${fmt(x.each)}원/자${x.r.over ? ' (최대 구간 초과)' : ''}`;
      const detail = rs.length === 1 ? `${rs[0].n}자 × ${desc(rs[0])}` : rs.map((x) => `"${x.t}" ${x.n}자 × ${desc(x)}`).join(' + ');
      finish(label, detail, rs.reduce((a, x) => a + x.n * x.each, 0), p.type, rs.reduce((a, x) => a + x.n * x.r.item.price, 0));
      continue;
    }
    const raw = texts.reduce((a, x) => a + x.n * (x.h / 10) * unit, 0);
    const detail = texts.length === 1 ? `${texts[0].n}자 × 높이 ${fmt(texts[0].h)}mm × ${fmt(unit)}원/자·cm` : `${texts.map((x) => `"${x.t}" ${x.n}자×${fmt(x.h)}mm`).join(' + ')} × ${fmt(unit)}원/자·cm`;
    finish(label, detail, raw, p.type);
  }
  // 상단 조명 (2026-10-16): 투광등 = 개수 × 원/개, 트러스 = 간판 가로(m) × 원/m
  const tl = topLightOf(o);
  if (tl) {
    key = `${o.id}:top`;
    const label = `${o.name} · ${tl.label}`, unit = prices.products[tl.priceId] ?? 0;
    if (tl.kind === 'arm') finish(label, `${tl.count}개 × ${fmt(unit)}원`, tl.count * unit, tl.priceId);
    else if (!o.widthMm) lines.push({ key, objectId: o.id, label, detail: '치수 필요', amount: 0 });
    else finish(label, `가로 ${(o.widthMm / 1000).toFixed(2)}m × ${fmt(unit)}원/m`, (o.widthMm / 1000) * unit, tl.priceId);
  }
  // 시트 구성 요소: 객체가 크기(가로·세로)를 가지면 그 면적 합, 아니면 간판 면적
  for (const p of parts.filter((x) => x.kind === 'sheet')) {
    key = `${o.id}:part:${p.id}`;
    const sh = sheetById(p.type);
    if (!sh) continue;
    const label = `${o.name} · ${sh.name}`, unit = prices.sheets[p.type] ?? 0;
    const sizedItems = p.items.filter((it) => it.w && it.h);
    if (!sizedItems.length && !sized) { lines.push({ key, objectId: o.id, label, detail: '치수 필요', amount: 0 }); continue; }
    const method = findMethod(prices.methods?.[p.type]);
    if (method && method.kind !== 'letters') {
      const rs = sizedItems.length ? sizedItems.map((it) => evalArea(method, it.w!, it.h)) : [evalArea(method, o.widthMm!, o.heightMm!, shapeAreaM2(o))];
      const amt = rs.reduce((a, r) => a + r.raw * markupFor(prices, r.item), 0);
      finish(label, rs.map((r) => scaled(r.detail, markupFor(prices, r.item))).join(' + '), amt, p.type, rs.reduce((a, r) => a + r.raw, 0));
      continue;
    }
    const m2 = sizedItems.length ? sizedItems.reduce((a, it) => a + (it.w! * it.h) / 1e6, 0) : shapeAreaM2(o);
    finish(label, `${m2.toFixed(2)}㎡ × ${fmt(unit)}원`, m2 * unit, p.type);
  }
  for (const id of usesParts ? [] : o.sheetIds) {
    key = `${o.id}:sheet:${id}`;
    const s = sheetById(id);
    if (!s) continue;
    const label = `${o.name} · ${s.name}`;
    if (!sized) { lines.push({ key, objectId: o.id, label, detail: '치수 필요', amount: 0 }); continue; }
    const method = findMethod(prices.methods?.[id]);
    if (method && method.kind !== 'letters') {
      const r = evalArea(method, o.widthMm!, o.heightMm!, shapeAreaM2(o));
      const mk = markupFor(prices, r.item);
      finish(label, scaled(r.detail, mk), r.raw * mk, id, r.raw);
      continue;
    }
    const m2 = shapeAreaM2(o);
    finish(label, `${m2.toFixed(2)}㎡ × ${fmt(prices.sheets[id] ?? 0)}원`, m2 * (prices.sheets[id] ?? 0), id);
  }
  return lines;
}

/** 줄 금액 정하기: 'auto' 면 자동, 숫자면 수동, 없으면 모드(manual = 입력 필요 0원, auto = 자동) */
function resolve(l: QuoteLine, opts: QuoteOptions): QuoteLine {
  const e = opts.lineAmounts?.[l.key];
  const auto = l.amount;
  const r: QuoteLine = e === 'auto' || (e === undefined && opts.mode !== 'manual') ? { ...l, auto, manual: false }
    : typeof e === 'number' ? { ...l, auto, amount: e, manual: true }
    : { ...l, auto, amount: 0, manual: true, needsInput: true };
  if (r.cost !== undefined && !r.needsInput && r.amount < r.cost) r.loss = true;
  return r;
}

export function quoteProject(objs: SignObject[], prices: PriceTable, opts: QuoteOptions = {}): Quote {
  const lines = objs.flatMap((o) => quoteObject(o, prices)).map((l) => resolve(l, opts));
  const done = lines.filter((l) => !l.needsInput);
  const costed = done.filter((l) => l.cost !== undefined);
  const cost = costed.reduce((a, l) => a + l.cost!, 0), sales = costed.reduce((a, l) => a + l.amount, 0);
  const margin = { cost, sales, profit: sales - cost, rate: sales ? (sales - cost) / sales : null, uncosted: done.filter((l) => l.cost === undefined && l.amount > 0).length };
  const itemsTotal = lines.reduce((a, l) => a + l.amount, 0);
  const install = opts.installFee ?? prices.install;
  const extras = opts.extras ?? [];
  const subtotal = itemsTotal + install + extras.reduce((a, e) => a + e.amount, 0);
  if (prices.vatIncluded) {
    const vat = Math.round(subtotal - subtotal / (1 + VAT_RATE));
    return { lines, itemsTotal, install, extras, subtotal, vat, total: subtotal, vatIncluded: true, margin };
  }
  const vat = Math.round(subtotal * VAT_RATE);
  return { lines, itemsTotal, install, extras, subtotal, vat, total: subtotal + vat, vatIncluded: false, margin };
}
