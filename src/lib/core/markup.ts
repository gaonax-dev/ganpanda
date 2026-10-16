// 공급 단가 × 배수 = 내 판매 단가 (2026-10-16 사용자: "이건 소비자가 예시로 한울 가격을 몇배로 할지 조정해봐")
// 연결된 단가 항목(`PriceTable.links`)은 공급 단가 × 배수(분류 배수 > 전체 배수 > 1)를 100원 단위로 반올림한 값.
// 배수는 사용자가 정한다("단가는 사용가 설정할거고"). 배수를 바꾸면 연결된 항목만 다시 계산한다.
import type { Markup, PriceTable } from './pricing';
import { findSupplierItem, type SupplierItem } from './supplierPrices';

export function markupFor(prices: Pick<PriceTable, 'markup'>, item: SupplierItem): number {
  return prices.markup?.groups?.[item.group] ?? prices.markup?.all ?? 1;
}

/** 직접 출력하는 분류의 품목 — 공급 단가에 연결하지 않고 직접 입력 */
export const isDirect = (prices: Pick<PriceTable, 'markup'>, item: SupplierItem) => !!prices.markup?.direct?.includes(item.group);

/** 연결 값의 판매 단가. 없는 품목·직접 출력 분류면 null */
export function linkedPrice(prices: Pick<PriceTable, 'markup'>, link: string): number | null {
  const hit = findSupplierItem(link);
  return hit && !isDirect(prices, hit.item) ? Math.round((hit.item.price * markupFor(prices, hit.item)) / 100) * 100 : null;
}

/** 배수를 바꾸고 연결된 항목을 다시 계산. 직접 출력이 된 분류의 연결은 풀고 단가는 남긴다 */
export function applyMarkup(prices: PriceTable, markup: Markup | undefined): PriceTable {
  const next: PriceTable = { ...prices, products: { ...prices.products }, sheets: { ...prices.sheets } };
  if (markup) next.markup = markup; else delete next.markup;
  const links: Record<string, string> = {};
  for (const [id, link] of Object.entries(prices.links ?? {})) {
    const v = linkedPrice(next, link);
    if (v === null) continue;
    links[id] = link;
    if (id in next.sheets) next.sheets[id] = v; else next.products[id] = v;
  }
  if (Object.keys(links).length) next.links = links; else delete next.links;
  return next;
}
