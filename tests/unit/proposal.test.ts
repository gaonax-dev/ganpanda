import { describe, expect, it } from 'vitest';
import type { SignObject } from '../../src/lib/core/model';
import { DEFAULT_PRICES } from '../../src/lib/core/pricing';
import { approvalState, contentHash, proposalProblems, snapshotOf, type Approval } from '../../src/lib/core/proposal';
import { quoteProject } from '../../src/lib/core/quote';

const obj = (o: Partial<SignObject>): SignObject => ({ id: 'o', photoId: 'p', name: 'x', shape: 'rect', quad: [[0, 0], [1, 0], [1, 1], [0, 1]], sheetIds: [], createdAt: 0, ...o });
const sizeOf = (o: SignObject) => (o.widthMm && o.heightMm ? { w: o.widthMm, h: o.heightMm, estimated: false } : null);
const prices = { ...DEFAULT_PRICES, minimum: 0 };

describe('제안·승인: 내용 해시와 상태', () => {
  const a = obj({ id: 'a', name: '메인', productId: 'board-flex', widthMm: 3000, heightMm: 600, text: '간판다', options: { sides: '양면' } });
  const b = obj({ id: 'b', name: '시트', sheetIds: ['sh-cut'], widthMm: 2000, heightMm: 1000 });
  const q = quoteProject([a, b], prices);

  it('같은 내용이면 순서가 달라도 같은 해시, 치수·옵션·금액·디자인이 바뀌면 다른 해시', () => {
    const h1 = contentHash([a, b], sizeOf, q), h2 = contentHash([b, a], sizeOf, quoteProject([b, a], prices));
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[0-9a-f]{8}$/);
    const a2 = { ...a, widthMm: 3100 };
    expect(contentHash([a2, b], sizeOf, quoteProject([a2, b], prices))).not.toBe(h1);
    const a3 = { ...a, options: { sides: '단면' } };
    expect(contentHash([a3, b], sizeOf, quoteProject([a3, b], prices))).not.toBe(h1);
    expect(contentHash([a, b], sizeOf, quoteProject([a, b], { ...prices, install: 0 }))).not.toBe(h1);
    const a4 = { ...a, design: { sourceId: 's', page: 0, crop: { x: 0, y: 0, w: 10, h: 10 } } };
    expect(contentHash([a4, b], sizeOf, q)).not.toBe(h1);
    // 위치·사진 같은 규격 외 필드는 영향 없음
    expect(contentHash([{ ...a, quad: [[5, 5], [9, 5], [9, 9], [5, 9]], listX: 100 }, b], sizeOf, q)).toBe(h1);
  });

  it('스냅샷: 품목·사양·치수·금액·합계', () => {
    const s = snapshotOf([a, b], sizeOf, q, [{ id: 's', name: 'd.ai', kind: 'pdf', fileAssetId: 'f', pages: [{ assetId: 'p', w: 1, h: 1 }], author: 'x', createdAt: 0 }]);
    expect(s.items[0]).toMatchObject({ name: '메인', category: '간판', type: '후렉스', size: { w: 3000, h: 600, estimated: false }, text: '간판다' });
    expect(s.items[0].options).toContain('양면');
    expect(s.items[0].amount).toBeGreaterThan(0);
    expect(s.items[1]).toMatchObject({ category: '시트', sheets: ['재질 시트'] });
    expect(s.total).toBe(q.total);
  });

  it('승인 상태: 없음 → 승인됨 → 내용이 바뀌면 변경됨(재승인 필요), 최신 승인 기준', () => {
    const h = contentHash([a, b], sizeOf, q);
    expect(approvalState(undefined, h)).toEqual({ status: 'none' });
    const ap1: Approval = { id: '1', at: 1000, by: '홍길동', hash: 'old', snapshot: snapshotOf([a, b], sizeOf, q, []) };
    const ap2: Approval = { id: '2', at: 2000, by: '홍길동', hash: h, snapshot: snapshotOf([a, b], sizeOf, q, []) };
    expect(approvalState([ap1, ap2], h)).toMatchObject({ status: 'approved', approval: { id: '2' } });
    expect(approvalState([ap2, ap1], h)).toMatchObject({ status: 'approved', approval: { id: '2' } });
    expect(approvalState([ap2], 'different')).toMatchObject({ status: 'changed', approval: { id: '2' } });
  });

  it('제안 준비 점검: 사진·사인물·분류·치수·3D 가 비면 안내', () => {
    expect(proposalProblems([], sizeOf, [], () => true)).toEqual(['사진이 없습니다.', '사인물이 없습니다. 사진에 사인물 영역을 그리세요.']);
    const noCat = obj({ id: 'c', name: '무명', widthMm: 100, heightMm: 100 });
    const noSize = obj({ id: 'd', name: '크기없음', productId: 'board-acp' });
    const probs = proposalProblems([noCat, noSize], sizeOf, [{ id: 'p' }], () => false);
    expect(probs.some((p) => p.includes('무명') && p.includes('분류'))).toBe(true);
    expect(probs.some((p) => p.includes('크기없음') && p.includes('치수'))).toBe(true);
    expect(probs.some((p) => p.includes('원근'))).toBe(true);
    expect(proposalProblems([a, b], sizeOf, [{ id: 'p' }], () => true)).toEqual([]);
  });
});
