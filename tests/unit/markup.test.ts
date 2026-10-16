// 공급 단가 × 배수 = 내 판매 단가 (2026-10-16 사용자: "이건 소비자가 예시로 한울 가격을 몇배로 할지 조정해봐" — 단가표.xlsx(가오낙스 판매가)를 예시로)
import { describe, expect, it } from 'vitest';
import { applyMarkup, linkedPrice, markupFor } from '../../src/lib/core/markup';
import { findSupplierItem } from '../../src/lib/core/supplierPrices';
import { DEFAULT_PRICES, mergePrices } from '../../src/lib/core/pricing';

const item = (link: string) => findSupplierItem(link)!.item;

describe('배수', () => {
  it('분류 배수 > 전체 배수 > 1', () => {
    const uv = item('hanwool:hanwool.uv.백색시트');
    expect(markupFor({ ...DEFAULT_PRICES }, uv)).toBe(1);
    expect(markupFor({ ...DEFAULT_PRICES, markup: { all: 1.5 } }, uv)).toBe(1.5);
    expect(markupFor({ ...DEFAULT_PRICES, markup: { all: 1.5, groups: { UV: 2 } } }, uv)).toBe(2);
  });
  it('연결 단가 = 공급 단가 × 배수, 100원 단위 반올림', () => {
    expect(linkedPrice({ ...DEFAULT_PRICES, markup: { all: 1.3 } }, 'hanwool:hanwool.uv.백색시트')).toBe(9800); // 7,500 × 1.3 = 9,750
    expect(linkedPrice(DEFAULT_PRICES, 'nope:x')).toBeNull();
  });
  it('배수를 바꾸면 연결된 항목만 다시 계산된다', () => {
    const p = { ...DEFAULT_PRICES, links: { 'sh-print': 'hanwool:hanwool.uv.백색시트', 'board-flex': 'hanwool:hanwool.flex.UV 단면.단폭 2,100' } };
    const next = applyMarkup(p, { all: 2, groups: { 플렉스: 3 } });
    expect(next.sheets['sh-print']).toBe(15000);
    expect(next.products['board-flex']).toBe(24000);
    expect(next.sheets['sh-cut']).toBe(DEFAULT_PRICES.sheets['sh-cut']);
    expect(next.markup).toEqual({ all: 2, groups: { 플렉스: 3 } });
  });
  it('저장값: 배수는 0 초과 10 이하만', () => {
    expect(mergePrices({ markup: { all: 1.8, groups: { UV: 2, 솔벤: -1, 수성: 'x' } } }).markup).toEqual({ all: 1.8, groups: { UV: 2 } });
    expect(mergePrices({ markup: { all: 0 } }).markup).toBeUndefined();
  });
});
