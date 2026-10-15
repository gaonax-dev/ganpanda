import { describe, expect, it } from 'vitest';
import { CATEGORY_GROUPS, categoryOf, defaultProductFor, productsOf } from '../../src/lib/core/catalog';
import type { SignObject } from '../../src/lib/core/model';

const obj = (o: Partial<SignObject>): SignObject => ({ id: 'o', photoId: 'p', name: 'x', shape: 'rect', quad: [[0, 0], [1, 0], [1, 1], [0, 1]], sheetIds: [], createdAt: 0, ...o });

describe('사인물 분류 (간판 / 시트 / 스카시 / 포맥스 / 현수막 / 라이트패널 / 액자 / 어닝 / 사인미러, // 2026-10-15 분류 재정리)', () => {
  it('제품 → 분류: 보드·전광·후광·갈바 = 간판, 스카시·고무 스카시 = 스카시, 제품 없이 시트만 = 시트', () => {
    expect(categoryOf(obj({ productId: 'board-acp' }))).toBe('sign');
    expect(categoryOf(obj({ productId: 'ch-front' }))).toBe('sign');
    expect(categoryOf(obj({ productId: 'ch-scashi' }))).toBe('scashi');
    expect(categoryOf(obj({ productId: 'ch-rubber' }))).toBe('scashi');
    expect(categoryOf(obj({ sheetIds: ['sh-cut'] }))).toBe('sheet');
    expect(categoryOf(obj({}))).toBeNull();
  });
  it('분류별 제품 목록과 기본 제품', () => {
    expect(productsOf('sign').map((p) => p.id)).toContain('board-acp');
    expect(productsOf('sign').map((p) => p.id)).not.toContain('ch-scashi');
    expect(productsOf('scashi').map((p) => p.id)).toEqual(['ch-rubber', 'sc-titan', 'ch-scashi']);
    expect(defaultProductFor('sign')).toBe('board-flex');
    expect(defaultProductFor('scashi')).toBe('ch-rubber');
    expect(CATEGORY_GROUPS.map((g) => g.id)).toEqual(['sign', 'sheet', 'scashi', 'foamex', 'banner', 'lightpanel', 'frame', 'awning', 'mirror']);
  });
});
