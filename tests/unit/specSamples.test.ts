import { describe, expect, it } from 'vitest';
import { sampleOf } from '../../src/lib/core/specSamples';
import { parseSpecText } from '../../src/lib/core/specText';
import type { SignObject } from '../../src/lib/core/model';

const obj = (o: Partial<SignObject>): SignObject => ({ id: 'o', photoId: 'p', name: 'A', shape: 'rect', quad: [[0, 0], [1, 0], [1, 1], [0, 1]], sheetIds: [], createdAt: 0, ...o });

describe('사양 글 표본 (2026-10-18 "메모로 전환하는 글만 모아서")', () => {
  it('요청사항으로 넘어간 부분이 있을 때만 — 전체 글·못 알아본 부분·알아본 항목', () => {
    const text = '갈바 3000x600 전광채널 카페 배선은 뒤로'; // '로고 왼쪽 아래'는 이제 배치 어휘로 알아본다 (2026-10-19)
    const items = parseSpecText(text, obj({ productId: 'board-galva' }));
    const s = sampleOf(text, items, 'board-galva')!;
    expect(s.text).toBe(text);
    expect(s.leftover).toContain('배선은');
    expect(s.recognized.some((r) => r.includes('갈바'))).toBe(true);
    expect(s.productId).toBe('board-galva');
  });
  it('전부 알아보면 표본 없음', () => {
    expect(sampleOf('갈바 흰색', parseSpecText('갈바 흰색', obj({})))).toBeNull();
  });
});
