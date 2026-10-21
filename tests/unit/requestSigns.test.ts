// 견적 요청에 싣는 사인물 (2026-10-21 소비자 견적 요청)
import { describe, expect, it } from 'vitest';
import { materializeRequestSigns, serializeRequestSigns, validateRequestSigns } from '../../src/lib/core/requestSigns';
import type { Photo, SignObject } from '../../src/lib/core/model';

const photo = (id: string, x: number): Photo => ({ id, name: id, assetId: 'a' + id, w: 1600, h: 1000, x, y: 0, width: 800 });
const sign = (o: Partial<SignObject>): SignObject => ({ id: 'o', photoId: 'p1', name: '사인물 1', shape: 'rect', quad: [[10.4, 20], [110, 20], [110, 60], [10, 60]], sheetIds: [], createdAt: 0, ...o });

describe('싣기', () => {
  it('사진은 보드 왼쪽부터 번호, 사인물은 사진 번호·영역(정수)·치수·종류·메모만, 연결 영역은 뺀다', () => {
    const { photoOrder, signs } = serializeRequestSigns([photo('p2', 900), photo('p1', 0)], [
      sign({ widthMm: 4000, heightMm: 1000, productId: 'board-flex', note: ' 야간 조명 ', corner: 0.5 }),
      sign({ id: 'o2', photoId: 'p2', name: '측면' }),
      sign({ id: 'o3', photoId: 'p1', sameAs: 'o' }),
      sign({ id: 'o4', photoId: 'gone' }),
      sign({ id: 'o5', photoId: '', quad: [], name: '카드만' }),
    ]);
    expect(photoOrder.map((p) => p.id)).toEqual(['p1', 'p2']);
    expect(signs).toEqual([
      { photo: 0, name: '사인물 1', shape: 'rect', quad: [[10, 20], [110, 20], [110, 60], [10, 60]], corner: 0.5, widthMm: 4000, heightMm: 1000, productId: 'board-flex', memo: '야간 조명' },
      { photo: 1, name: '측면', shape: 'rect', quad: [[10, 20], [110, 20], [110, 60], [10, 60]] },
      { photo: null, name: '카드만', shape: 'rect', quad: [] },
    ]);
  });
});

describe('검사', () => {
  it('맞는 것은 정리해서 돌려주고, 틀린 것은 null', () => {
    expect(validateRequestSigns([{ photo: 0, name: ' 간판 ', shape: 'rect', quad: [[0, 0], [1, 0], [1, 1], [0, 1]], widthMm: 3000.4, heightMm: -5, memo: 'x', junk: 1 }]))
      .toEqual([{ photo: 0, name: '간판', shape: 'rect', quad: [[0, 0], [1, 0], [1, 1], [0, 1]], widthMm: 3000, memo: 'x' }]);
    expect(validateRequestSigns([{ photo: null, name: '', shape: 'rect', quad: [] }])).toEqual([{ photo: null, name: '사인물', shape: 'rect', quad: [] }]);
    expect(validateRequestSigns('x')).toBeNull();
    expect(validateRequestSigns([{ photo: 0, name: 'a', shape: 'rect', quad: [] }])).toBeNull(); // 사진이 있으면 영역 4점
    expect(validateRequestSigns([{ photo: 'a', name: 'a', shape: 'rect', quad: [[0, 0], [1, 0], [1, 1], [0, 1]] }])).toBeNull();
    expect(validateRequestSigns([{ photo: 0, name: 'a', shape: 'ellipse', quad: [[0, 0], [1, 0], [1, 1], [0, 1]] }])).toBeNull();
    expect(validateRequestSigns(Array.from({ length: 51 }, () => ({ photo: null, name: 'a', shape: 'rect', quad: [] })))).toBeNull();
  });
});

describe('간판사 프로젝트에 그려 넣기', () => {
  it('요청 사진 번호 → 가져온 사진 id, 없는 사진의 사인물은 건너뛴다', () => {
    const out = materializeRequestSigns([
      { photo: 0, name: '간판', shape: 'rect', quad: [[0, 0], [1, 0], [1, 1], [0, 1]], widthMm: 3000, productId: 'board-flex', memo: 'm' },
      { photo: 3, name: '없음', shape: 'rect', quad: [[0, 0], [1, 0], [1, 1], [0, 1]] },
      { photo: null, name: '카드', shape: 'rect', quad: [] },
    ], ['ph-a']);
    expect(out).toEqual([
      { photoId: 'ph-a', name: '간판', shape: 'rect', quad: [[0, 0], [1, 0], [1, 1], [0, 1]], sheetIds: [], widthMm: 3000, productId: 'board-flex', note: 'm' },
      { photoId: '', name: '카드', shape: 'rect', quad: [], sheetIds: [] },
    ]);
  });
});
