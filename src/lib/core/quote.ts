// 규칙 기반 견적 (2-2): 사인물 + 단가표 + 설치비·추가 항목 → 견적
import { partKindsFor, partsOf } from './parts';
import { componentOf, type PartPriceCtx } from './components';
import { supplierOf, termFor } from './terms';
import { shapeAreaM2 } from './shapeArea';
import { fmt, roundTo, scaled } from './priceFormat';
export { charCountOf } from './charCount';
export { shapeAreaM2 } from './shapeArea';
import { productById, sheetById, signParts } from './catalog';
import type { ExtraItem, SignObject } from './model';
import type { PriceTable } from './pricing';
import { findSupplierItem, supplierTagOf } from './supplierPrices';
import { evalArea, findMethod } from './calcMethods';
import { markupFor } from './markup';

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
  /** 직접 단가 줄의 수량·단위·단가 (2026-10-24 "단가을 사장이 바로 입력") — 금액 = 수량 × 단가. 계산법 줄에는 없다 */
  qty?: number;
  unit?: string;
  unitPrice?: number;
  /** 이 줄만 단가를 바꿈 (lineUnits) */
  unitOverride?: boolean;
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
  /** 이 줄만 단가 (2026-10-24): 줄 키 → 원. 수량 × 이 단가로 자동 금액을 다시 낸다 */
  lineUnits?: Record<string, number>;
}

const fmtQty = (n: number) => String(Number(n.toFixed(2)));
export const won = (n: number) => Math.round(n).toLocaleString('ko-KR') + '원';

export function quoteObject(o: SignObject, prices: PriceTable): QuoteLine[] {
  const lines: QuoteLine[] = [];
  /** 견적 줄 이름: 연결 공급사 용어 > 기본 이름 (2026-10-19 V5 "공급사의 용어가 우선한다") */
  const term = (key: string, fallback: string) => termFor(key, supplierOf(prices, key.slice(key.indexOf(':') + 1)), fallback);
  const sized = !!(o.widthMm && o.heightMm);
  const size = sized ? `${fmt(o.widthMm!)}×${fmt(o.heightMm!)}mm` : '';
  let key = `${o.id}:body`;
  /** cost: 계산법이면 배수 전 금액을 넘긴다. 없으면 공급 품목 연결에서 (수량 × 공급 단가) */
  const finish = (label: string, detail: string, raw: number, priceId?: string, cost?: number, sub?: string, qtyIn?: number) => {
    let amount = roundTo(raw, prices.rounding);
    // 직접 단가 줄: 수량 = 넘겨준 값 또는 금액 ÷ 단가 (계산법 줄 제외)
    const unitPrice = priceId && !prices.methods?.[priceId] ? (prices.products[priceId] ?? prices.sheets[priceId]) : undefined;
    const qty = unitPrice === undefined ? undefined : qtyIn ?? (unitPrice > 0 ? raw / unitPrice : undefined);
    const unitInfo = qty !== undefined && unitPrice !== undefined ? { qty: Math.round(qty * 1000) / 1000, unit: unitNameOf(priceId!), unitPrice } : {};
    if (amount < prices.minimum) { amount = prices.minimum; detail += ` · 최소 ${fmt(prices.minimum)}원 적용`; }
    const supplier = (priceId && findMethod(prices.methods?.[priceId])?.supplier.tag) || supplierTagOf(priceId && prices.links?.[priceId]);
    if (cost === undefined && priceId && !prices.methods?.[priceId]) {
      const hit = findSupplierItem(prices.links?.[priceId]);
      const unit = prices.products[priceId] ?? prices.sheets[priceId];
      if (hit && unit) cost = (raw * hit.item.price) / unit;
    }
    lines.push({ key: sub ? `${key}:${sub}` : key, objectId: o.id, label, detail: supplier ? `${detail} · ${supplier} 단가` : detail, amount, ...(priceId ? { priceId } : {}), ...(supplier ? { supplier } : {}), ...(cost !== undefined ? { cost: Math.round(cost) } : {}), ...unitInfo });
  };
  // 간판 = 몸통(㎡) + 채널 옵션(자·cm). 옛 데이터(채널 제품이 종류)는 몸통 없음 + 채널
  const { bodyId } = signParts(o);
  const body = productById(bodyId);
  if (body && body.unit === 'm2') {
    const label = `${o.name} · ${term(`product:${body.id}`, body.name)}`;
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
      finish(label, `${size} = ${m2.toFixed(2)}㎡ × ${fmt(unit)}원`, m2 * unit, body.id, undefined, undefined, m2);
    }
  }
  // 개 단위(사인미러·전광판·지주·에어간판): 치수와 무관하게 1식
  if (body && body.unit === 'ea') finish(`${o.name} · ${body.name}`, `1식 × ${fmt(prices.products[body.id] ?? 0)}원`, prices.products[body.id] ?? 0, body.id, undefined, undefined, 1);
  // 조합형 (2026-10-16): 구성 요소마다 종류 모듈이 줄을 만든다 (채널·스카시 = 글자수 × 높이, 시트 = 면적 — core/components, 0단계). 옛 데이터는 읽을 때 구성 요소로 바뀐다
  const parts = partsOf(o);
  const usesParts = partKindsFor(o).length > 0; // 조합형 분류는 시트도 구성 요소로 (2026-10-16 모든 분류 조합형)
  const ctx: PartPriceCtx = { o, prices, sized, finish, term, need: (label, detail) => lines.push({ key, objectId: o.id, label, detail, amount: 0 }) };
  const priceOf = (p: (typeof parts)[number]) => { const c = componentOf(p.kind); key = c.quoteKey?.(o, p) ?? `${o.id}:part:${p.id}`; c.price(p, ctx); };
  const layerOf = (x: (typeof parts)[number]) => componentOf(x.kind).layer;
  for (const p of parts.filter((x) => layerOf(x) > 0).sort((a, b) => layerOf(a) - layerOf(b))) priceOf(p); // 입체(채널·스카시) → 상단 조명 (전과 같은 줄 순서)
  for (const p of parts.filter((x) => componentOf(x.kind).layer === 0)) priceOf(p); // 면에 깔리는 것(시트)
  for (const id of usesParts ? [] : o.sheetIds) {
    key = `${o.id}:sheet:${id}`;
    const s = sheetById(id);
    if (!s) continue;
    const label = `${o.name} · ${term(`sheet:${id}`, s.name)}`;
    if (!sized) { lines.push({ key, objectId: o.id, label, detail: '치수 필요', amount: 0 }); continue; }
    const method = findMethod(prices.methods?.[id]);
    if (method && method.kind !== 'letters') {
      const r = evalArea(method, o.widthMm!, o.heightMm!, shapeAreaM2(o));
      const mk = markupFor(prices, r.item);
      finish(label, scaled(r.detail, mk), r.raw * mk, id, r.raw);
      continue;
    }
    const m2 = shapeAreaM2(o);
    finish(label, `${m2.toFixed(2)}㎡ × ${fmt(prices.sheets[id] ?? 0)}원`, m2 * (prices.sheets[id] ?? 0), id, undefined, undefined, m2);
  }
  return lines;
}

/** 단가 단위 이름: ㎡ · 자·cm · 개 · m (시트는 ㎡) */
function unitNameOf(priceId: string): string {
  const u = productById(priceId)?.unit;
  return u === 'charCm' ? '자·cm' : u === 'ea' ? '개' : u === 'm' ? 'm' : '㎡';
}

/** 줄 금액 정하기: 이 줄만 단가(lineUnits)면 수량 × 그 단가가 자동 금액(입력한 것으로 본다). 그다음 'auto' 면 자동, 숫자면 수동, 없으면 모드(manual = 입력 필요 0원, auto = 자동) */
function resolve(l0: QuoteLine, opts: QuoteOptions, prices: PriceTable): QuoteLine {
  const u = opts.lineUnits?.[l0.key];
  const l: QuoteLine = typeof u === 'number' && l0.qty !== undefined
    ? { ...l0, amount: Math.max(roundTo(l0.qty * u, prices.rounding), prices.minimum), unitPrice: u, unitOverride: true, detail: `${fmtQty(l0.qty)}${l0.unit} × ${fmt(u)}원 (이 줄 단가)` }
    : l0;
  const e = opts.lineAmounts?.[l.key];
  const auto = l.amount;
  const r: QuoteLine = e === 'auto' || (e === undefined && (opts.mode !== 'manual' || l.unitOverride)) ? { ...l, auto, manual: false }
    : typeof e === 'number' ? { ...l, auto, amount: e, manual: true }
    : { ...l, auto, amount: 0, manual: true, needsInput: true };
  if (r.cost !== undefined && !r.needsInput && r.amount < r.cost) r.loss = true;
  return r;
}

export function quoteProject(objs: SignObject[], prices: PriceTable, opts: QuoteOptions = {}): Quote {
  const lines = objs.flatMap((o) => quoteObject(o, prices)).map((l) => resolve(l, opts, prices));
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
