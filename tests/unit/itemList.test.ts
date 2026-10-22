// 금액 빠진 품목 리스트 (2026-10-22 사용자: "데스크탑의 견적을 약간 개량해서 금액이 빠진 품목 리스트로 작성가능한가? 사인물 리스트에서 볼수 있게")
import { describe, expect, it } from 'vitest';
import { itemDetail } from '../../src/lib/core/priceFormat';

describe('itemDetail — 견적 줄 설명에서 금액만 뺀다 (수량·크기·옵션은 남김)', () => {
  it('× 단가원, 1식 단가원, 기본가, 공급사 단가 표시를 지운다', () => {
    expect(itemDetail('4,000×700 = 2.80㎡ × 35,000원')).toBe('4,000×700 = 2.80㎡');
    expect(itemDetail('1식 × 250,000원')).toBe('1식');
    expect(itemDetail('2.80㎡ × 35,000원 (1,200폭)')).toBe('2.80㎡ (1,200폭)');
    expect(itemDetail('1개 12,000원 (반사, 2.00㎡)')).toBe('1개 (반사, 2.00㎡)');
    expect(itemDetail('2.00헤베 → 기본가 30,000원 (3헤베까지)')).toBe('2.00헤베 (3헤베까지)');
    expect(itemDetail('4×0.7m · 2.80㎡ × 35,000원 · 한울상사 단가')).toBe('4×0.7m · 2.80㎡');
    expect(itemDetail('치수 필요')).toBe('치수 필요');
  });
});
