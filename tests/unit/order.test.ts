import { describe, expect, it } from 'vitest';
import type { SignObject } from '../../src/lib/core/model';
import { orderJson } from '../../src/lib/core/order';
import { DEFAULT_PRICES } from '../../src/lib/core/pricing';
import { quoteProject } from '../../src/lib/core/quote';

const obj = (o: Partial<SignObject>): SignObject => ({ id: 'o', photoId: 'p', name: 'x', shape: 'rect', quad: [[0, 0], [1, 0], [1, 1], [0, 1]], sheetIds: [], createdAt: 0, ...o });

describe('주문서 JSON', () => {
  const signs = [
    obj({ id: 'a', name: '메인 간판', productId: 'board-galva', widthMm: 3000, heightMm: 600, text: '간판다', options: { form: '일체형(전면)', indirect: 'T5 LED 주백색', paintSystem: 'RAL', paintCode: '9005' }, design: { sourceId: 's1', page: 0, crop: { x: 0, y: 0, w: 10, h: 10 } }, note: '배선은 왼쪽' }),
    obj({ id: 'b', name: '유리 시트', sheetIds: ['sh-cut'], widthMm: 2000, heightMm: 1000, options: { transferTape: true, coating: '무광', halfCut: true } }),
    obj({ id: 'c', name: '스카시', productId: 'ch-rubber', heightMm: 300, text: 'OPEN', options: { thickness: '30T', paperTemplate: true } }),
  ];
  const sources = [{ id: 's1', name: 'design_v1.ai', kind: 'pdf' as const, fileAssetId: 'f', pages: [{ assetId: 'p1', w: 100, h: 100 }], author: '제작자', createdAt: 0 }];
  const quote = quoteProject(signs, { ...DEFAULT_PRICES, minimum: 0 });
  const json = orderJson({ projectName: '한울상사', signs, sizeOf: (o) => (o.widthMm && o.heightMm ? { w: o.widthMm, h: o.heightMm, estimated: false } : null), sources, quote, order: { customer: '홍길동', company: '한울상사', phone: '010-1234-5678', delivery: 'install', address: '경기도 이천시', dueDate: '2026-10-25', notes: '크레인 진입 확인' }, now: new Date('2026-10-14T00:00:00Z') });

  it('주문 정보·품목·사양·파일·합계를 담는다', () => {
    expect(json.order_info.delivery_label).toBe('시공 요청');
    expect(json.items).toHaveLength(3);
    const a = json.items[0];
    expect(a.category).toBe('간판'); expect(a.type).toBe('갈바 간판');
    expect(a.size).toEqual({ width_mm: 3000, height_mm: 600, estimated: false });
    expect(a.options.paintCode).toBe('9005');
    expect(a.option_summary).toContain('일체형(전면)');
    expect(a.design_file).toBe('design_v1.ai (1쪽)');
    expect(a.note).toBe('배선은 왼쪽');
    expect(a.amount).toBeGreaterThan(0);
    const b = json.items[1];
    expect(b.category).toBe('시트'); expect(b.sheets).toEqual(['시트 컷팅 (단색, 칼선)']); expect(b.option_summary).toContain('반컷팅');
    const c = json.items[2];
    expect(c.category).toBe('스카시'); expect(c.size).toBeUndefined(); expect(c.option_summary).toEqual(['30T', '시트 부착', '시공용 1:1 종이 도안', '부착 출고']);
    expect(json.files).toEqual([{ name: 'design_v1.ai', pages: 1 }]);
    expect(json.file_check.length).toBeGreaterThan(2);
    expect(json.totals.total).toBe(quote.total);
    expect(json.notes).toBe('크레인 진입 확인');
    expect(json.created_at).toBe('2026-10-14T00:00:00.000Z');
  });
});
