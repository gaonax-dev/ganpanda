// 공급사별 계산법 (2026-10-16 사용자: "공급사별 계산법을 사용할 수 있게해줘")
// 공급 단가표 품목의 세부 표기(구간·기본가·폭)를 읽어 계산법을 만든다. 공급업체마다 표 모양이 달라도 표기만 맞으면 같은 엔진으로 계산한다.
//  - letters  글자 크기 구간 자당 (예: 알리다 캡 채널 30~200cm, 갈바 채널 30각…, 고무 스카시 "11~20cm", 레이저 "10mm" · 영문/한글)
//  - width    폭 구간 ㎡ (예: 한울 플렉스 단폭 2,100 / 장폭 3,000 / 4,800 — 짧은 변이 들어가는 가장 좁은 폭)
//  - area     헤베(또는 M) 단가 + 기본가(1.8헤베까지) + 광폭(2,010폭 이상) (예: 알리다 프레임 간판)
//  - areaTier 면적 구간 (예: 한울 현수막 1회배 이하 장당 / 3회배 미만 장당 / 3회배 이상 회배당)
// 금액은 공급 단가 기준(raw)이고, 견적에서 배수(`markupFor`)를 곱한다.
import type { PriceTable } from './pricing';
import { isDirect } from './markup';
import { SUPPLIER_LISTS, type Supplier, type SupplierItem, type SupplierPriceList } from './supplierPrices';

export type MethodKind = 'letters' | 'width' | 'area' | 'areaTier';
export interface CalcMethod {
  id: string;
  supplier: Supplier;
  kind: MethodKind;
  /** 내 단가 항목 단위: 글자(원/자·cm 항목) 또는 ㎡ */
  unit: 'charCm' | 'm2';
  group: string;
  name: string;
  /** 같은 품목의 변형 (예: "LED조립", "고무 5T~30T") */
  variant: string;
  label: string;
  items: SupplierItem[];
}

const KIND_HINT: Record<MethodKind, string> = { letters: '글자 크기별 자당', width: '폭 구간', area: '헤베 + 기본가', areaTier: '면적 구간' };
const num = (s: string) => Number(s.replace(/,/g, ''));

/** 글자 크기 구간: "30cm", "30각"(= cm), "10mm", "10cm 이하", "11~20cm", "5~10각" → 위 경계(mm) */
function sizeOf(option: string): { maxMm: number; rest: string } | null {
  const [head, ...rest] = option.split(' · ');
  const m = /^(?:\d+\s*~\s*)?(\d+(?:\.\d+)?)\s*(cm|각|mm)(?:\s*이하)?$/.exec(head.trim());
  if (!m) return null;
  return { maxMm: Number(m[1]) * (m[2] === 'mm' ? 1 : 10), rest: rest.join(' · ') };
}
const langOf = (rest: string): '한글' | '영문' | null => (rest.includes('한글') ? '한글' : rest.includes('영문') ? '영문' : null);
const variantOf = (rest: string) => rest.split(' · ').filter((t) => !/^(영문|한글)\s*고딕?$/.test(t.trim())).join(' · ').trim();
const hasHangul = (t: string) => /[가-힣]/.test(t);
const areaTierOf = (option: string | undefined) => {
  const m = /(\d+(?:\.\d+)?)\s*회배\s*(이하|미만|이상)/.exec(option ?? '');
  return m ? { n: Number(m[1]), op: m[2] as '이하' | '미만' | '이상' } : null;
};

function build(list: SupplierPriceList): CalcMethod[] {
  const out: CalcMethod[] = [];
  const byName = new Map<string, SupplierItem[]>();
  for (const it of list.items) {
    if (it.surcharge) continue;
    const k = `${it.group}|${it.name}`;
    if (!byName.has(k)) byName.set(k, []);
    byName.get(k)!.push(it);
  }
  const add = (kind: MethodKind, unit: CalcMethod['unit'], items: SupplierItem[], variant = '') => {
    const { group, name } = items[0];
    out.push({
      id: `${list.supplier.id}:${kind}:${group}|${name}|${variant}`, supplier: list.supplier, kind, unit, group, name, variant, items,
      label: `${group} · ${name}${variant ? ` · ${variant}` : ''} (${KIND_HINT[kind]})`,
    });
  };
  for (const items of byName.values()) {
    // 글자: 자당 품목이 모두 크기 구간을 가질 때, 변형마다
    const letters = items.filter((i) => i.unit === '개' && i.note?.includes('자당'));
    if (letters.length && letters.every((i) => i.option && sizeOf(i.option))) {
      const byVariant = new Map<string, SupplierItem[]>();
      for (const i of letters) { const v = variantOf(sizeOf(i.option!)!.rest); if (!byVariant.has(v)) byVariant.set(v, []); byVariant.get(v)!.push(i); }
      for (const [v, xs] of byVariant) add('letters', 'charCm', xs, v);
      continue;
    }
    const sqm = items.filter((i) => i.unit === '회배');
    // 헤베(또는 M) + 기본가
    const rate = items.find((i) => (i.unit === '회배' || i.unit === 'm') && i.option?.includes('기준'));
    const base = items.find((i) => i.unit === '개' && i.option?.includes('기본'));
    if (rate && base) { add('area', 'm2', items); continue; }
    // 면적 구간
    if (items.length >= 2 && items.every((i) => areaTierOf(i.option))) { add('areaTier', 'm2', items); continue; }
    // 폭 구간: 세부가 폭(단폭·장폭·소폭)을 말하고 최대폭이 서로 다를 때만 (레이어·용도 변형은 아님)
    if (sqm.length >= 2 && sqm.length === items.length && sqm.every((i) => i.maxWidthMm && /폭/.test(i.option ?? '')) && new Set(sqm.map((i) => i.maxWidthMm)).size === sqm.length) add('width', 'm2', items);
  }
  return out;
}

export const CALC_METHODS: CalcMethod[] = SUPPLIER_LISTS.flatMap(build);
const BY_ID = new Map(CALC_METHODS.map((m) => [m.id, m]));
export const findMethod = (id: string | undefined) => (id ? BY_ID.get(id) : undefined);

/** 단가 항목 단위에 고를 수 있는 계산법 (직접 출력 분류 제외) */
export function methodsFor(unit: string, prices: Pick<PriceTable, 'markup'>): CalcMethod[] {
  return CALC_METHODS.filter((m) => m.unit === unit && !isDirect(prices, m.items[0]));
}

/** 글자 1자 단가: 높이 이상인 가장 작은 구간, 한글이 있으면 한글 단가. 가장 큰 구간보다 크면 그 구간 + over */
export function evalLetter(m: CalcMethod, hMm: number, text: string): { item: SupplierItem; over: boolean } | null {
  const want = hasHangul(text) ? '한글' : '영문';
  const all = m.items.map((item) => ({ item, ...sizeOf(item.option!)! }));
  const langs = all.filter((x) => langOf(x.rest) === want);
  const pool = (langs.length ? langs : all).sort((a, b) => a.maxMm - b.maxMm);
  if (!pool.length) return null;
  const hit = pool.find((x) => x.maxMm >= hMm - 1e-6);
  return hit ? { item: hit.item, over: false } : { item: pool[pool.length - 1].item, over: true };
}

const fmt = (n: number) => Math.round(n).toLocaleString('ko-KR');

/** 면적 계산법: 공급 단가 기준 금액(raw)과 설명. m2 를 주면 그 면적(도형 면적 등)으로 */
export function evalArea(m: CalcMethod, wMm: number, hMm: number, m2 = (wMm * hMm) / 1e6): { raw: number; detail: string; item: SupplierItem } {
  const short = Math.min(wMm, hMm), long = Math.max(wMm, hMm);
  if (m.kind === 'width') {
    const xs = [...m.items].sort((a, b) => a.maxWidthMm! - b.maxWidthMm!);
    const hit = xs.find((x) => x.maxWidthMm! >= short) ?? xs[xs.length - 1];
    const over = hit.maxWidthMm! < short ? ' (최대폭 초과)' : '';
    return { raw: m2 * hit.price, item: hit, detail: `${m2.toFixed(2)}㎡ × ${fmt(hit.price)}원 (${hit.option ?? `${fmt(hit.maxWidthMm!)}폭`})${over}` };
  }
  if (m.kind === 'areaTier') {
    const hit = m.items.find((x) => { const t = areaTierOf(x.option)!; return t.op === '이하' ? m2 <= t.n : t.op === '미만' ? m2 < t.n : m2 >= t.n; }) ?? m.items[m.items.length - 1];
    return hit.unit === '회배'
      ? { raw: m2 * hit.price, item: hit, detail: `${m2.toFixed(2)}㎡ × ${fmt(hit.price)}원 (${hit.option})` }
      : { raw: hit.price, item: hit, detail: `1${hit.unit} ${fmt(hit.price)}원 (${hit.option}, ${m2.toFixed(2)}㎡)` };
  }
  // area: 헤베(또는 M) + 기본가 + 광폭
  const rate = m.items.find((i) => (i.unit === '회배' || i.unit === 'm') && i.option?.includes('기준'))!;
  const base = m.items.find((i) => i.unit === '개' && i.option?.includes('기본'))!;
  const wide = m.items.find((i) => i.option?.includes('광폭'));
  const wideFrom = wide ? num(/([\d,]+)\s*폭\s*이상/.exec(wide.option!)?.[1] ?? 'Infinity') : Infinity;
  const per = wide && short >= wideFrom ? wide : rate;
  const perM = per.unit === 'm';
  const qty = perM ? long / 1000 : m2;
  const unitLabel = perM ? 'm' : '㎡';
  const baseUpTo = Number(/([\d.]+)\s*(헤베|M)/.exec(base.option!)?.[1] ?? 0);
  if (qty <= baseUpTo) return { raw: base.price, item: base, detail: `${qty.toFixed(2)}${unitLabel} → 기본가 ${fmt(base.price)}원 (${baseUpTo}${perM ? 'M' : '헤베'}까지)` };
  return { raw: qty * per.price, item: per, detail: `${qty.toFixed(2)}${unitLabel} × ${fmt(per.price)}원 (${per.option})` };
}
