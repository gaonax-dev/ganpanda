import { describe, expect, it } from 'vitest';
import { DEFAULT_LETTER3D, lightingOf, measureTextWidthMm, specFromObject } from '../../src/lib/core/letter3d';
import { font } from './fixtures';
import type { SignObject } from '../../src/lib/core/model';

const obj = (o: Partial<SignObject>): SignObject => ({
  id: 'o', photoId: 'p', name: '간판', shape: 'rect', quad: [[0, 0], [1, 0], [1, 1], [0, 1]], sheetIds: [], createdAt: 0, ...o,
});

describe('입체 간판 사양', () => {
  it('제품 → 조명: 전광/후광/그 외 비조명', () => {
    expect(lightingOf('ch-front')).toBe('front');
    expect(lightingOf('ch-halo')).toBe('halo');
    expect(lightingOf('ch-scashi')).toBe('none');
    expect(lightingOf(undefined)).toBe('none');
  });

  it('사인물 → 3D 사양: 문구·높이·저장된 설정(없으면 기본값)', () => {
    const s = specFromObject(obj({ text: '간판다', heightMm: 600, productId: 'ch-halo' }));
    expect(s).toMatchObject({ text: '간판다', heightMm: 600, lighting: 'halo', depthMm: DEFAULT_LETTER3D.depthMm, faceColor: DEFAULT_LETTER3D.faceColor });
    const t = specFromObject(obj({ text: '간판다', heightMm: 600, productId: 'board-galva', options: { channel: '전광 채널' }, letter3d: { depthMm: 120, faceColor: '#00ff00', sideColor: '#222222', letterSpacing: 0.1 } }));
    expect(t).toMatchObject({ depthMm: 120, faceColor: '#00ff00', letterSpacing: 0.1 });
  });

  it('문구가 없거나 높이가 없거나 채널(입체 글자)이 없으면 null', () => {
    expect(specFromObject(obj({ heightMm: 600, productId: 'ch-front' }))).toBeNull();
    expect(specFromObject(obj({ text: '간판다', productId: 'ch-front' }))).toBeNull();
    expect(specFromObject(obj({ text: '간판다', heightMm: 600, productId: 'board-galva' }))).toBeNull(); // 채널 옵션 없음 = 상자만
  });

  it('폰트 기준 전체 폭(mm): 높이에 비례, 자간이 크면 넓어진다', () => {
    const w1 = measureTextWidthMm(font, '간판다 카페', 600, 0);
    const w2 = measureTextWidthMm(font, '간판다 카페', 1200, 0);
    expect(w2).toBeCloseTo(w1 * 2, 0);
    expect(measureTextWidthMm(font, '간판다 카페', 600, 0.2)).toBeGreaterThan(w1);
    expect(w1).toBeGreaterThan(2000); // 5자 × 600mm → 2m 이상
    expect(measureTextWidthMm(font, '', 600, 0)).toBe(0);
  });
});
