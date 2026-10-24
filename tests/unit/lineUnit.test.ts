// 견적 줄에서 단가를 바로 입력 (2026-10-24 사용자: "견적부분이 강제성이 있다 … 실제로는 단가을 사장이 바로 입력할 수 있어야한다 … 단가를 바로 변경할 수도 있고 해당 내역을 전체에 적용할 수도 있어야한다")
import { describe, expect, it } from 'vitest';
import { DEFAULT_PRICES } from '../../src/lib/core/pricing';
import { quoteObject, quoteProject } from '../../src/lib/core/quote';
import type { SignObject } from '../../src/lib/core/model';

const obj = (o: Partial<SignObject>): SignObject => ({ id: 'o', photoId: 'p', name: '간판', shape: 'rect', quad: [[0, 0], [1, 0], [1, 1], [0, 1]], sheetIds: [], createdAt: 0, ...o });
const P = { ...DEFAULT_PRICES, rounding: 100 as const, minimum: 0 };

describe('줄 수량·단위·단가', () => {
  it('직접 단가 줄은 수량 × 단가 — 수량·단위·단가를 함께 준다(단가가 0 이어도 수량은 있다)', () => {
    const [l] = quoteObject(obj({ productId: 'board-galva', widthMm: 3000, heightMm: 600 }), P);
    expect(l).toMatchObject({ qty: 1.8, unit: '㎡', unitPrice: P.products['board-galva'], priceId: 'board-galva' });
    const zero = { ...P, products: { ...P.products, 'board-galva': 0 } };
    expect(quoteObject(obj({ productId: 'board-galva', widthMm: 3000, heightMm: 600 }), zero)[0]).toMatchObject({ qty: 1.8, unitPrice: 0 });
  });
});

describe('이 줄만 단가 (lineUnits)', () => {
  const o1 = obj({ id: 'a', productId: 'board-galva', widthMm: 3000, heightMm: 600 });
  const o2 = obj({ id: 'b', productId: 'board-galva', widthMm: 2000, heightMm: 500 });
  it('그 줄만 새 단가로 계산되고 표시된다, 같은 품목의 다른 줄은 그대로', () => {
    const q = quoteProject([o1, o2], P, { lineUnits: { 'a:body': 50_000 } });
    expect(q.lines[0]).toMatchObject({ amount: 90_000, unitPrice: 50_000, unitOverride: true });
    expect(q.lines[1].amount).toBe(Math.round((1.0 * P.products['board-galva']) / 100) * 100);
    expect(q.lines[1].unitOverride).toBeUndefined();
  });
  it('수동 모드(새 프로젝트)에서도 단가를 넣은 줄은 입력한 것으로 본다, 금액을 직접 넣으면 금액이 이긴다', () => {
    const q = quoteProject([o1, o2], P, { mode: 'manual', lineUnits: { 'a:body': 50_000 }, lineAmounts: { 'b:body': 123_000 } });
    expect(q.lines[0].amount).toBe(90_000);
    expect(q.lines[0].needsInput).toBeUndefined();
    expect(q.lines[1]).toMatchObject({ amount: 123_000, manual: true });
  });
});
