import { describe, expect, it } from 'vitest';
import { CATALOG, SHEETS } from '../../src/lib/core/catalog';
import { DEFAULT_PRICES } from '../../src/lib/core/pricing';
import { charCountOf, quoteObject, quoteProject, won } from '../../src/lib/core/quote';
import type { SignObject } from '../../src/lib/core/model';

const obj = (o: Partial<SignObject>): SignObject => ({
  id: 'o', photoId: 'p', name: '간판', shape: 'rect', quad: [[0, 0], [1, 0], [1, 1], [0, 1]],
  sheetIds: [], createdAt: 0, ...o,
});
const P = DEFAULT_PRICES;
const board = CATALOG.find((p) => p.category === 'board')!;
const ch = CATALOG.find((p) => p.category === 'channel')!;

describe('글자수', () => {
  it('문구에서 공백·줄바꿈을 뺀 글자수, 수동 입력이 있으면 우선', () => {
    expect(charCountOf(obj({ text: '간판다 카페\n2호점' }))).toBe(8);
    expect(charCountOf(obj({ text: '간판다', charCount: 10 }))).toBe(10);
    expect(charCountOf(obj({}))).toBe(0);
  });
});

describe('오브젝트 견적 (단가표 기준)', () => {
  it('보드는 외곽 직사각형 면적 × 단가표의 ㎡ 단가, 반올림 단위 적용', () => {
    const prices = { ...P, products: { ...P.products, [board.id]: 85000 }, rounding: 1000 as const, minimum: 0 };
    const [line] = quoteObject(obj({ productId: board.id, widthMm: 2100, heightMm: 1000 }), prices);
    expect(line.amount).toBe(179000); // 2.1㎡ × 85,000 = 178,500 → 1,000 단위 반올림
  });

  it('채널은 글자수 × 높이(cm) × 자당 단가, 문구로 글자수 자동', () => {
    const prices = { ...P, products: { ...P.products, [ch.id]: 3000 }, rounding: 1 as const, minimum: 0 };
    const [line] = quoteObject(obj({ productId: ch.id, text: '간판다 카페', widthMm: 3000, heightMm: 600 }), prices);
    expect(line.amount).toBe(5 * 60 * 3000);
    expect(line.detail).toContain('5자');
  });

  it('원형 시트는 실제 원 면적', () => {
    const sheet = SHEETS[0];
    const prices = { ...P, sheets: { ...P.sheets, [sheet.id]: 40000 }, rounding: 1 as const, minimum: 0 };
    const lines = quoteObject(obj({ shape: 'ellipse', sheetIds: [sheet.id], widthMm: 1000, heightMm: 1000 }), prices);
    expect(lines[0].amount).toBe(Math.round((Math.PI / 4) * 40000));
  });

  it('최소 금액 미만이면 최소 금액', () => {
    const prices = { ...P, minimum: 300000, rounding: 1 as const };
    const [line] = quoteObject(obj({ productId: board.id, widthMm: 100, heightMm: 100 }), prices);
    expect(line.amount).toBe(300000);
    expect(line.detail).toContain('최소');
  });

  it('치수가 없으면 0원 + 치수 필요', () => {
    const [line] = quoteObject(obj({ productId: board.id }), P);
    expect(line).toMatchObject({ amount: 0, detail: expect.stringContaining('치수 필요') });
  });
});

describe('프로젝트 견적', () => {
  const prices = { ...P, products: { ...P.products, [board.id]: 100000 }, install: 250000, minimum: 0, rounding: 1 as const };
  const objs = [obj({ id: 'a', productId: board.id, widthMm: 1000, heightMm: 1000 })];

  it('항목 합계 + 설치비 + 추가 항목(할인은 음수) → 공급가·부가세·합계', () => {
    const q = quoteProject(objs, prices, { extras: [{ id: 'x', label: '야간 작업', amount: 50000 }, { id: 'y', label: '소개 할인', amount: -20000 }] });
    expect(q.itemsTotal).toBe(100000);
    expect(q.install).toBe(250000);
    expect(q.subtotal).toBe(380000);
    expect(q.vat).toBe(38000);
    expect(q.total).toBe(418000);
  });

  it('설치비를 프로젝트에서 바꾸거나 없앨 수 있다', () => {
    expect(quoteProject(objs, prices, { installFee: 0 }).install).toBe(0);
    expect(quoteProject(objs, prices, { installFee: 300000 }).subtotal).toBe(400000);
  });

  it('부가세 포함 표시: 단가가 이미 부가세 포함이면 합계 = 공급가, 부가세는 안내용으로 역산', () => {
    const q = quoteProject(objs, { ...prices, vatIncluded: true }, {});
    expect(q.total).toBe(350000);
    expect(q.vat).toBe(Math.round(350000 - 350000 / 1.1));
    expect(q.vatIncluded).toBe(true);
  });

  it('원화 표기', () => {
    expect(won(1234567.4)).toBe('1,234,567원');
    expect(won(-20000)).toBe('-20,000원');
  });
});
