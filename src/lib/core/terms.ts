// 용어 통일 (2026-10-19 V5, docs/features/spec-vocabulary.md 8절; 사용자: "공급사의 용어가 우선한다", "이후에는 용어의 통일화가 진행된다").
// 해석(어느 값인가)은 대세·사전이 정하고, **표시 이름은 공급사 > 대세 표현 > 레지스트리 기본 이름**. 값(의미)의 단위는 레지스트리 값이고,
// 값마다 공급사별 이름 표(SUPPLIER_TERMS)를 둔다. 그 품목에 연결된 공급사(단가표의 연결·계산법)가 기준. 1차: 확인 창 힌트 · 주문 JSON · 용어집 내보내기
import type { PriceTable } from './pricing';
import type { SignObject, SignPart } from './model';
import type { SpecItem } from './specText';
import type { SpecRule } from './specRules';
import { CATALOG, SHEETS, CHANNEL_OPTIONS, SCASHI_OPTIONS, productById, sheetById, signParts } from './catalog';
import { findMethod } from './calcMethods';
import { componentOf } from './components';
import { SUPPLIER_LISTS } from './supplierPrices';

/** 공급사 id → (값 키 → 공급사 용어). 키: product:<제품 id> · sheet:<시트 id> · opt:<옵션 키>=<값>. 공급사 단가표의 품목·분류 이름에서 옮겨 적음 — 없는 값은 레지스트리 이름 그대로 */
export const SUPPLIER_TERMS: Record<string, Record<string, string>> = {
  // 알리다솔루션 2025-03 (채널·스카시·UV시트 분류명)
  alida: {
    'product:ch-halo': '후광 채널', 'product:ch-front': '전광 채널', 'product:ch-galva': '3D 에폭시 채널', 'product:ch-rubber': '고무 스카시',
    'opt:chType=오싸이': '오사이', 'opt:chType=일체형': '일체형 채널',
    'sheet:sh-print': 'UV시트 출력', 'opt:cut=돔보컷팅': '돔보컷팅', 'opt:base=회색': '그레이 시트', 'opt:base=흰색': '백색 시트',
  },
  // 한울상사 2026-03-27 (원단별 단가표 품목명)
  hanwool: {
    'sheet:sh-print': 'UV 백색시트', 'opt:base=흰색': '백색시트', 'opt:base=회색': '그레이시트', 'opt:cut=돔보컷팅': '돔보', 'opt:ink=솔벤트': '솔벤', 'opt:ink=UV': 'UV',
    'product:board-flex': '플렉스',
  },
};

/** 단가 항목(제품·시트 id)에 연결된 공급사 id — 계산법 > 연결. 없으면 undefined */
export function supplierOf(prices: PriceTable | null | undefined, priceId: string | undefined): string | undefined {
  if (!prices || !priceId) return undefined;
  const m = findMethod(prices.methods?.[priceId]);
  if (m) return m.supplier.id;
  const link = prices.links?.[priceId];
  return link ? link.slice(0, link.indexOf(':')) : undefined;
}
export const supplierNameOf = (id: string | undefined) => SUPPLIER_LISTS.find((l) => l.supplier.id === id)?.supplier.tag ?? id;

/** 값 키의 표시 이름: 공급사 용어 > 기본 이름 */
export function termFor(key: string, supplier: string | undefined, fallback: string): string {
  return (supplier && SUPPLIER_TERMS[supplier]?.[key]) || fallback;
}
/** 공급사 용어가 기본 이름과 다를 때만 그 용어 (힌트용) */
export function supplierTerm(key: string, supplier: string | undefined, fallback: string): string | null {
  const t = termFor(key, supplier, fallback);
  return t !== fallback ? t : null;
}

/** 구성 요소의 공급사 이름 (주문서): 그 구성 요소 종류(type)에 연결된 공급사의 용어 */
export function partSupplierLabel(part: SignPart, prices: PriceTable | null | undefined, fallback: string): { supplier?: string; label: string } {
  const sup = supplierOf(prices, part.type);
  const key = `${componentOf(part.kind).termKey}:${part.type}`; // 시트는 sheet:, 채널·스카시는 product: — 종류 모듈이 정한다
  const t = supplierTerm(key, sup, fallback);
  return t ? { supplier: sup, label: t } : { label: fallback };
}

/** 확인 창 항목의 공급사 용어 힌트 ("→ 공급사 용어 '오사이'"). 종류·채널·스카시·옵션 값만 */
export function termHint(item: SpecItem, o: SignObject | undefined, prices: PriceTable | null | undefined): string | null {
  if (item.kind === 'product' || item.kind === 'channel' || item.kind === 'scashi') {
    const sup = supplierOf(prices, item.id);
    const base = item.kind === 'product' ? productById(item.id)?.name ?? item.id : item.kind === 'channel' ? CHANNEL_OPTIONS.find((c) => c.id === item.id)?.label ?? item.id : SCASHI_OPTIONS.find((c) => c.id === item.id)?.label ?? item.id;
    const t = supplierTerm(`product:${item.id}`, sup, base);
    return t ? `${supplierNameOf(sup)} 용어 '${t}'` : null;
  }
  if (item.kind === 'option' || item.kind === 'channelOption') {
    const priceId = item.kind === 'option' ? o?.productId : o ? signParts(o).channelId ?? undefined : undefined;
    const sup = supplierOf(prices, priceId ?? undefined);
    const t = supplierTerm(`opt:${item.key}=${item.value}`, sup, item.value);
    return t ? `${supplierNameOf(sup)} 용어 '${t}'` : null;
  }
  return null;
}

export interface GlossaryRow { kind: string; key: string; standard: string; supplier?: string; supplierTerm?: string; synonyms: string[] }
/** 용어집: 레지스트리 값(종류·시트·공급사 용어가 있는 옵션 값)마다 표준 이름 · 연결 공급사 용어 · 내 동의어(사전 규칙의 말) */
export function glossary(prices: PriceTable | null | undefined, rules: SpecRule[]): GlossaryRow[] {
  const synonymsOf = (pred: (m: SpecItem) => boolean) => rules.filter((r) => r.meaning.some(pred)).map((r) => r.phrase);
  const rows: GlossaryRow[] = [];
  for (const p of CATALOG) {
    const sup = supplierOf(prices, p.id);
    // 표준 이름 = 레지스트리 이름 (채널·스카시는 구성 요소 세부 종류 이름 — "후광 채널"), 그 밖은 카탈로그 이름
    const std = CHANNEL_OPTIONS.find((c) => c.id === p.id)?.label ?? SCASHI_OPTIONS.find((c) => c.id === p.id)?.label ?? p.name;
    rows.push({ kind: p.category === 'channel' ? '채널·스카시' : '종류', key: `product:${p.id}`, standard: std, ...(sup ? { supplier: supplierNameOf(sup) } : {}), ...(supplierTerm(`product:${p.id}`, sup, std) ? { supplierTerm: supplierTerm(`product:${p.id}`, sup, std)! } : {}), synonyms: synonymsOf((m) => (m.kind === 'product' || m.kind === 'channel' || m.kind === 'scashi') && m.id === p.id) });
  }
  for (const s of SHEETS) {
    const sup = supplierOf(prices, s.id);
    rows.push({ kind: '시트', key: `sheet:${s.id}`, standard: s.name, ...(sup ? { supplier: supplierNameOf(sup) } : {}), ...(supplierTerm(`sheet:${s.id}`, sup, s.name) ? { supplierTerm: supplierTerm(`sheet:${s.id}`, sup, s.name)! } : {}), synonyms: [] });
  }
  // 옵션 값: 공급사 용어 표에 있는 것만 (표준 = 값 그대로)
  const optKeys = new Set(Object.values(SUPPLIER_TERMS).flatMap((t) => Object.keys(t)).filter((k) => k.startsWith('opt:')));
  for (const k of optKeys) {
    const [key, value] = k.slice(4).split('=');
    const sups = Object.entries(SUPPLIER_TERMS).filter(([, t]) => t[k]).map(([id, t]) => `${supplierNameOf(id)}: ${t[k]}`);
    rows.push({ kind: '옵션 값', key: k, standard: value, supplierTerm: sups.join(' / '), synonyms: synonymsOf((m) => (m.kind === 'option' || m.kind === 'channelOption') && m.key === key && m.value === value) });
  }
  return rows;
}
const csvCell = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
export function glossaryCsv(prices: PriceTable | null | undefined, rules: SpecRule[]): string {
  const head = ['구분', '표준 용어', '연결 공급사', '공급사 용어', '내 동의어'];
  const lines = glossary(prices, rules).map((r) => [r.kind, r.standard, r.supplier ?? '', r.supplierTerm ?? '', r.synonyms.join(' / ')].map(csvCell).join(','));
  return '﻿' + [head.join(','), ...lines].join('\n');
}
export const sheetLabel = (id: string) => sheetById(id)?.name ?? id;
