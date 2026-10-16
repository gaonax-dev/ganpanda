// 공급 단가 × 배수 = 내 판매 단가 (2026-10-16 사용자: "이건 소비자가 예시로 한울 가격을 몇배로 할지 조정해봐" — 단가표.xlsx(가오낙스 판매가)를 예시로)
import { describe, expect, it } from 'vitest';
import { applyMarkup, isDirect, linkedPrice, markupFor } from '../../src/lib/core/markup';
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
    expect(mergePrices({ markup: { all: 0 } }).markup).toEqual(DEFAULT_PRICES.markup); // 잘못된 값 → 샘플 기본값
  });
});

describe('직접 출력 (2026-10-16 사용자: "직접출력은 시트 후렉스 uv실사출력이고 나머지는 기존배수를 적용해야한다")', () => {
  it('샘플 기본값: UV 실사·후렉스·UV시트평판은 직접 출력', () => {
    expect(DEFAULT_PRICES.markup).toEqual({ all: 1, direct: ['UV', '플렉스', 'UV시트평판'] });
    expect(isDirect(DEFAULT_PRICES, item('hanwool:hanwool.uv.백색시트'))).toBe(true);
    expect(isDirect(DEFAULT_PRICES, item('hanwool:hanwool.solvent.백색시트'))).toBe(false);
  });
  it('직접 출력 분류는 연결 단가가 없고(직접 입력), 나머지는 배수', () => {
    const p = { ...DEFAULT_PRICES, markup: { all: 1.5, direct: ['UV'] } };
    expect(linkedPrice(p, 'hanwool:hanwool.uv.백색시트')).toBeNull();
    expect(linkedPrice(p, 'hanwool:hanwool.solvent.백색시트')).toBe(11300); // 7,500 × 1.5 = 11,250
  });
  it('분류를 직접 출력으로 바꾸면 그 연결은 풀리고 단가는 그대로 남는다', () => {
    const p = { ...DEFAULT_PRICES, markup: { all: 1 }, links: { 'sh-print': 'hanwool:hanwool.uv.백색시트', 'sh-cut': 'hanwool:hanwool.solvent.백색시트' } };
    const next = applyMarkup({ ...p, sheets: { ...p.sheets, 'sh-print': 7500 } }, { all: 2, direct: ['UV'] });
    expect(next.links).toEqual({ 'sh-cut': 'hanwool:hanwool.solvent.백색시트' });
    expect(next.sheets['sh-print']).toBe(7500);
    expect(next.sheets['sh-cut']).toBe(15000);
  });
  it('저장값: direct 는 문자열 목록만', () => {
    expect(mergePrices({ markup: { all: 1.2, direct: ['UV', 3] } }).markup).toEqual({ all: 1.2, direct: ['UV'] });
    expect(mergePrices({}).markup).toEqual(DEFAULT_PRICES.markup);
  });
});
