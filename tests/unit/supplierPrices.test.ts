// 공급업체 단가표 (2026-10-16 사용자: "해당 단가는 공급사 꼬리표가 있어야 한다. 추후 거래업체에 단가표를 공급받아 제공하려한다.
// 현재는 사용자가 등록한 단가표로 구성해 해당 사용자만의 단가표이다. 지금은 개발중으로 둘다 구성하고 추후 업로드나 api로 단가를 공급받고 사용자가 입력가능하게")
// 공개 자료(알리다)만 — 거래처가 개별로 준 단가표는 넣지 않는다 (2026-10-31 "한울 빼")
import { describe, expect, it } from 'vitest';
import { SUPPLIER_LISTS, findSupplierItem, linkableItems, parseSupplierList, supplierTagOf } from '../../src/lib/core/supplierPrices';
import { DEFAULT_PRICES, mergePrices } from '../../src/lib/core/pricing';
import { quoteObject } from '../../src/lib/core/quote';
import type { SignObject } from '../../src/lib/core/model';

const al = SUPPLIER_LISTS.find((l) => l.supplier.id === 'alida')!;

describe('공급 단가표 목록', () => {
  it('공개 단가표(알리다)만 있고, 거래처 개별 단가표는 없다 (2026-10-31)', () => {
    expect(SUPPLIER_LISTS.map((l) => l.supplier.id)).toEqual(['alida']);
    expect(al.supplier).toMatchObject({ id: 'alida', name: '알리다솔루션', tag: '알리다' });
    expect(al.effectiveDate).toBe('2025-03-01');
  });
  it('모든 품목에 공급업체 id 가 붙은 고유 id (꼬리표)', () => {
    const ids = al.items.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const i of al.items) expect(i.id.startsWith('alida.')).toBe(true);
    expect(supplierTagOf('alida:alida.aqua.유포지')).toBe('알리다');
  });
});

describe('업로드·API 로 받을 단가표 형식 (검증)', () => {
  it('맞는 형식은 받아들이고, 잘못된 품목은 이유와 함께 거른다', () => {
    const r = parseSupplierList({ supplier: { id: 'acme', name: '에이크미', tag: '에이' }, effectiveDate: '2026-11-01', source: 'upload', items: [
      { id: 'acme.a', group: 'UV', name: '백색', unit: '회배', price: 7000 },
      { id: 'acme.b', group: 'UV', name: '음수', unit: '회배', price: -1 },
      { id: 'acme.c', group: 'UV', name: '단위', unit: '자', price: 100 },
    ] });
    expect(r.list!.items.map((i) => i.id)).toEqual(['acme.a']);
    expect(r.errors).toHaveLength(2);
  });
  it('공급업체 정보가 없으면 거부', () => {
    expect(parseSupplierList({ items: [] }).list).toBeNull();
  });
});

describe('내 단가표 ↔ 공급 단가 연결', () => {
  it('㎡ 단가에는 회배 기본 품목만 연결할 수 있다 (추가금·개당 제외)', () => {
    const xs = linkableItems('m2');
    expect(xs.some((x) => x.item.name === '유포지')).toBe(true);
    expect(xs.some((x) => x.item.surcharge || x.item.unit !== '회배')).toBe(false);
  });
  it('연결은 저장되고(이상한 값은 버림), 찾을 수 있다', () => {
    const p = mergePrices({ links: { 'sh-print': 'alida:alida.aqua.유포지', 'sh-cut': 123, x: 'nope' } });
    expect(p.links).toEqual({ 'sh-print': 'alida:alida.aqua.유포지' });
    expect(findSupplierItem(p.links!['sh-print'])!.item.price).toBe(8000);
  });
  it('견적 줄: 연결된 단가면 공급업체 꼬리표', () => {
    const prices = { ...DEFAULT_PRICES, sheets: { ...DEFAULT_PRICES.sheets, 'sh-cut': 6000 }, links: { 'sh-cut': 'alida:alida.aqua.유포지' } };
    const o: SignObject = { id: 'o', photoId: 'p', name: 'A', shape: 'rect', quad: [], sheetIds: ['sh-cut'], createdAt: 0, widthMm: 1000, heightMm: 1000 };
    const [l] = quoteObject(o, prices);
    expect(l.supplier).toBe('알리다');
    expect(quoteObject({ ...o, sheetIds: ['sh-print'] }, prices)[0].supplier).toBeUndefined();
  });
});
