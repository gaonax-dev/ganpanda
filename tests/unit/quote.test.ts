import { describe, expect, it } from 'vitest';
import { CATALOG, SHEETS, productById } from '../../src/lib/core/catalog';
import { quoteObject, quoteProject, won } from '../../src/lib/core/quote';
import type { SignObject } from '../../src/lib/core/model';

const obj = (o: Partial<SignObject>): SignObject => ({
  id: 'o', photoId: 'p', name: '간판', shape: 'rect', quad: [[0, 0], [1, 0], [1, 1], [0, 1]],
  sheetIds: [], createdAt: 0, ...o,
});
const area = (id: string) => {
  const p = productById(id) ?? SHEETS.find((x) => x.id === id)!;
  if (p.pricing.type !== 'area') throw new Error();
  return p.pricing.perM2;
};

describe('카탈로그', () => {
  it('보드·채널·시트 종류가 모두 있다', () => {
    expect(CATALOG.some((p) => p.category === 'board')).toBe(true);
    expect(CATALOG.some((p) => p.category === 'channel')).toBe(true);
    expect(SHEETS.length).toBeGreaterThan(0);
  });
});

describe('오브젝트 견적', () => {
  it('보드는 외곽 직사각형 면적 기준', () => {
    const board = CATALOG.find((p) => p.category === 'board')!;
    const [line] = quoteObject(obj({ productId: board.id, widthMm: 2000, heightMm: 1000 }));
    expect(line.amount).toBe(2 * area(board.id));
  });

  it('원형 시트는 실제 원 면적(π/4·w·h) 기준', () => {
    const sheet = SHEETS[0];
    const lines = quoteObject(obj({ shape: 'ellipse', sheetIds: [sheet.id], widthMm: 1000, heightMm: 1000 }));
    const s = lines.find((l) => l.label.includes(sheet.name))!;
    expect(s.amount).toBe(Math.round((Math.PI / 4) * area(sheet.id)));
  });

  it('채널은 글자수 × 높이(cm) × 자당 단가', () => {
    const ch = CATALOG.find((p) => p.category === 'channel')!;
    if (ch.pricing.type !== 'char') throw new Error();
    const [line] = quoteObject(obj({ productId: ch.id, widthMm: 3000, heightMm: 600, charCount: 4 }));
    expect(line.amount).toBe(4 * 60 * ch.pricing.perCharPerCm);
  });

  it('치수가 없으면 0원 + "치수 필요" 표시', () => {
    const [line] = quoteObject(obj({ productId: CATALOG[0].id }));
    expect(line.amount).toBe(0);
    expect(line.detail).toContain('치수 필요');
  });

  it('프로젝트 합계와 부가세', () => {
    const board = CATALOG.find((p) => p.category === 'board')!;
    const q = quoteProject([obj({ productId: board.id, widthMm: 1000, heightMm: 1000 })]);
    expect(q.subtotal).toBe(area(board.id));
    expect(q.vat).toBe(Math.round(q.subtotal * 0.1));
    expect(q.total).toBe(q.subtotal + q.vat);
  });

  it('원화 표기', () => {
    expect(won(1234567.4)).toBe('1,234,567원');
  });
});
