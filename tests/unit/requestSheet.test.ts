// 견적 요청서 목록 (2026-10-22 사용자: "견적요청서 리스트가 있어야 견적이 쉽다")
import { describe, expect, it } from 'vitest';
import { requestSheet } from '../../src/lib/core/requestSheet';

describe('requestSheet — 실측 보기의 요청서 표', () => {
  it('사인물마다 번호·이름·크기·면적·종류·메모, 합계는 치수 있는 것만', () => {
    const sheet = requestSheet([
      { id: 'a', name: '전면 간판', widthMm: 4000, heightMm: 700, productId: 'board-flex', note: '야간 조명' },
      { id: 'b', name: '돌출', widthMm: 600, heightMm: 900 },
      { id: 'c', name: '창 시트' },
    ], (id) => (id === 'board-flex' ? '후렉스' : undefined));
    expect(sheet.rows).toEqual([
      { id: 'a', no: 1, name: '전면 간판', size: '4,000 × 700', area: 2.8, kind: '후렉스', memo: '야간 조명' },
      { id: 'b', no: 2, name: '돌출', size: '600 × 900', area: 0.54, kind: '', memo: '' },
      { id: 'c', no: 3, name: '창 시트', size: '치수 없음', area: 0, kind: '', memo: '' },
    ]);
    expect(sheet.total).toEqual({ count: 3, measured: 2, area: 3.34 });
  });
});
