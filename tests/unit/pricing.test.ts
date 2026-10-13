import { describe, expect, it } from 'vitest';
import { DEFAULT_PRICES, mergePrices, type PriceTable } from '../../src/lib/core/pricing';
import { CATALOG, SHEETS } from '../../src/lib/core/catalog';

describe('단가표', () => {
  it('기본 단가표는 카탈로그의 모든 제품·시트 값을 갖는다', () => {
    for (const p of CATALOG) expect(DEFAULT_PRICES.products[p.id]).toBeGreaterThan(0);
    for (const s of SHEETS) expect(DEFAULT_PRICES.sheets[s.id]).toBeGreaterThan(0);
    expect(DEFAULT_PRICES).toMatchObject({ version: 1, install: 250000, minimum: 0, rounding: 1000, vatIncluded: false });
  });

  it('저장된 값을 기본값 위에 합치고, 이상한 값은 버린다', () => {
    const t = mergePrices({ products: { 'board-acp': 99000, 'unknown': 5 }, sheets: { 'sh-cut': -1 }, install: 0, minimum: 'x', rounding: 100 });
    expect(t.products['board-acp']).toBe(99000);
    expect('unknown' in t.products).toBe(false);
    expect(t.sheets['sh-cut']).toBe(DEFAULT_PRICES.sheets['sh-cut']); // 음수 무시
    expect(t.install).toBe(0); // 0 은 허용 (설치비 없음)
    expect(t.minimum).toBe(DEFAULT_PRICES.minimum);
    expect(t.rounding).toBe(100);
    expect(mergePrices(null)).toEqual(DEFAULT_PRICES);
    expect(mergePrices('garbage')).toEqual(DEFAULT_PRICES);
  });

  it('반올림 단위는 1·10·100·1000·10000 만', () => {
    expect(mergePrices({ rounding: 7 }).rounding).toBe(DEFAULT_PRICES.rounding);
    expect(mergePrices({ rounding: 10000 }).rounding).toBe(10000);
  });

  it('타입: PriceTable 은 JSON 으로 왕복된다', () => {
    const t: PriceTable = JSON.parse(JSON.stringify(DEFAULT_PRICES));
    expect(t).toEqual(DEFAULT_PRICES);
  });
});
