// 알리다솔루션 단가표 (2026-10-16 사용자: "/Volumes/…/알리다솔루션 주식회사 단가표 2025년 3월 1호.pdf 양이 상당하다.")
// 업로드·API 와 같은 형식(JSON)으로 두고 parseSupplierList 로 읽는다 — 1차는 실사 출력 + 광고물 제작(PDF 4~21쪽)
import { describe, expect, it } from 'vitest';
import { ALIDA_ERRORS, SUPPLIER_LISTS, findSupplierItem, linkableItems } from '../../src/lib/core/supplierPrices';

const al = SUPPLIER_LISTS.find((l) => l.supplier.id === 'alida')!;

describe('알리다 단가표 (2025년 3월 1호)', () => {
  it('공급업체·꼬리표·적용일, 검증 오류 없음', () => {
    expect(al.supplier).toMatchObject({ id: 'alida', name: '알리다솔루션', tag: '알리다' });
    expect(al.effectiveDate).toBe('2025-03-01');
    expect(ALIDA_ERRORS).toEqual([]);
    expect(al.items.length).toBeGreaterThan(1500);
    for (const i of al.items) expect(i.id.startsWith('alida.')).toBe(true);
  });
  it('UV후렉스 출력 (PDF 4쪽): 소폭·장폭, 대형, 마감', () => {
    const uv = al.items.filter((i) => i.group.startsWith('UV') && i.group.includes('후렉스'));
    const prices = uv.map((i) => i.price);
    for (const p of [4500, 8000, 5500, 9000, 6500, 10000, 7000, 13000, 15000, 18000, 21000]) expect(prices).toContain(p);
  });
  it('개 단위 제품에는 자당(글자) 단가를 연결하지 않는다', () => {
    const ea = linkableItems('ea').filter((x) => x.list.supplier.id === 'alida');
    expect(ea.length).toBeGreaterThan(0);
    expect(ea.some((x) => x.item.note?.includes('자당'))).toBe(false);
  });
  it('한울과 함께 연결 목록에 나온다 (꼬리표로 구분)', () => {
    const tags = new Set(linkableItems('m2').map((x) => x.list.supplier.tag));
    expect(tags).toEqual(new Set(['한울', '알리다']));
    const any = al.items.find((i) => i.unit === '회배' && !i.surcharge)!;
    expect(findSupplierItem(`alida:${any.id}`)!.list.supplier.tag).toBe('알리다');
  });
});
