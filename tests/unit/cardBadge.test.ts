// 평면도 카드 배지 (2026-10-17 사용자: "정면도에도 배경색 나오게 해줘. 정면도 제목 왼쪽에 인디케이터 원본, 설정, 디자인 — 속성에서 넣는 것은 설정, 디자인 파일이 연결되면 디자인 배지")
import { describe, expect, it } from 'vitest';
import type { SignObject } from '../../src/lib/core/model';
import { faceBadge } from '../../src/lib/core/cardFace';

const obj = (o: Partial<SignObject>): SignObject => ({ id: 'o', photoId: 'p', name: 'A', shape: 'rect', quad: [[0, 0], [1, 0], [1, 1], [0, 1]], sheetIds: [], createdAt: 0, ...o });

describe('faceBadge: 카드 얼굴이 무엇을 보여 주는가', () => {
  it('종류·구성 없음 → 원본(사진 그대로)', () => {
    expect(faceBadge(obj({}))).toEqual({ id: 'original', label: '원본' });
    expect(faceBadge(obj({ productId: 'body-none' }))).toEqual({ id: 'original', label: '원본' });
  });
  it('몸통 종류(바탕색)나 구성 요소 글자가 있으면 → 설정', () => {
    expect(faceBadge(obj({ productId: 'board-flex' }))).toEqual({ id: 'settings', label: '설정' });
    expect(faceBadge(obj({ productId: 'body-none', parts: [{ id: 'c', kind: 'channel', type: 'ch-front', options: {}, items: [{ id: 't', kind: 'text', text: '간판', x: 0, y: 0, h: 300 }] }] }))).toEqual({ id: 'settings', label: '설정' });
    expect(faceBadge(obj({ sheetIds: ['sh-cut'] }))).toEqual({ id: 'original', label: '원본' }); // 시트만, 글자 없음
  });
  it('디자인 파일이 연결되면 → 디자인 (설정보다 우선)', () => {
    expect(faceBadge(obj({ productId: 'board-flex', design: { sourceId: 's', page: 0, crop: { x: 0, y: 0, w: 100, h: 50 } } }))).toEqual({ id: 'design', label: '디자인' });
  });
});
