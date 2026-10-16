// 공급업체 단가표 (2026-10-16 사용자: "한울 단가표이다. 해당 단가는 한울 꼬리표가 있어야 한다. 추후 거래업체에 단가표를 공급받아 제공하려한다.
// 현재는 사용자가 등록한 단가표로 구성해 해당 사용자만의 단가표이다. 지금은 개발중으로 둘다 구성하고 추후 업로드나 api로 단가를 공급받고 사용자가 입력가능하게")
import { describe, expect, it } from 'vitest';
import { SUPPLIER_LISTS, findSupplierItem, linkableItems, parseSupplierList, supplierTagOf } from '../../src/lib/core/supplierPrices';
import { DEFAULT_PRICES, mergePrices } from '../../src/lib/core/pricing';
import { quoteObject } from '../../src/lib/core/quote';
import type { SignObject } from '../../src/lib/core/model';

const hw = SUPPLIER_LISTS.find((l) => l.supplier.id === 'hanwool')!;
const item = (group: string, name: string, option?: string) => hw.items.find((i) => i.group === group && i.name === name && (option === undefined || i.option === option));

describe('한울 단가표 (2026-03-27 원단별 단가표, PDF)', () => {
  it('공급업체·꼬리표·날짜·출처', () => {
    expect(hw.supplier).toMatchObject({ id: 'hanwool', name: '한울상사', tag: '한울' });
    expect(hw.effectiveDate).toBe('2026-03-27');
    expect(hw.source).toBe('pdf');
  });
  it('분류와 대표 단가 (회배 = 1㎡)', () => {
    expect([...new Set(hw.items.map((i) => i.group))]).toEqual(['수성', 'UV', '솔벤', '플렉스', '플렉스 마감', '라텍스', 'UV시트평판', '컷팅']);
    expect(item('수성', '유포/유포G')).toMatchObject({ maxWidthMm: 1470, unit: '회배', price: 8500 });
    expect(item('UV', '백색시트')).toMatchObject({ maxWidthMm: 1470, unit: '회배', price: 7500 });
    expect(item('UV', '와이드', '대형')).toMatchObject({ maxWidthMm: 2100, price: 35000 });
    expect(item('UV', '패브릭', '천갈이')).toMatchObject({ maxWidthMm: 1800, price: 27000 });
    expect(item('솔벤', '원웨이', '채널용')).toMatchObject({ maxWidthMm: 1150, price: 25000 });
    expect(item('플렉스', 'UV 양면', '장폭 4,800')).toMatchObject({ price: 12000 });
    expect(item('플렉스 마감', '클램프')).toMatchObject({ unit: '개', price: 3000 });
    expect(item('UV시트평판', 'C+W', '클리어·코팅지')).toMatchObject({ unit: '회배', price: 14000 });
    expect(item('컷팅', '돔보/시트')).toMatchObject({ price: 6000 });
    expect(item('컷팅', '시트지', 'LG시트 (내부용_LT)')).toMatchObject({ price: 12000 });
    expect(item('수성', '밴드미싱')).toMatchObject({ unit: '회배', price: 2000, surcharge: true });
    expect(hw.items.length).toBeGreaterThan(80);
  });
  it('모든 품목에 공급업체 id 가 붙은 고유 id (꼬리표)', () => {
    const ids = hw.items.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const i of hw.items) expect(i.id.startsWith('hanwool.')).toBe(true);
    expect(supplierTagOf('hanwool:hanwool.uv.백색시트')).toBe('한울');
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
    expect(xs.some((x) => x.item.name === '백색시트')).toBe(true);
    expect(xs.some((x) => x.item.surcharge || x.item.unit !== '회배')).toBe(false);
  });
  it('연결은 저장되고(이상한 값은 버림), 찾을 수 있다', () => {
    const p = mergePrices({ links: { 'sh-print': 'hanwool:hanwool.uv.백색시트', 'sh-cut': 123, x: 'nope' } });
    expect(p.links).toEqual({ 'sh-print': 'hanwool:hanwool.uv.백색시트' });
    expect(findSupplierItem(p.links!['sh-print'])!.item.price).toBe(7500);
  });
  it('견적 줄: 연결된 단가면 공급업체 꼬리표', () => {
    const prices = { ...DEFAULT_PRICES, sheets: { ...DEFAULT_PRICES.sheets, 'sh-cut': 6000 }, links: { 'sh-cut': 'hanwool:hanwool.cut.돔보/시트' } };
    const o: SignObject = { id: 'o', photoId: 'p', name: 'A', shape: 'rect', quad: [], sheetIds: ['sh-cut'], createdAt: 0, widthMm: 1000, heightMm: 1000 };
    const [l] = quoteObject(o, prices);
    expect(l.supplier).toBe('한울');
    expect(quoteObject({ ...o, sheetIds: ['sh-print'] }, prices)[0].supplier).toBeUndefined();
  });
});
