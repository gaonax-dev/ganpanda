import { describe, expect, it } from 'vitest';
import type { SignObject } from '../../src/lib/core/model';
import { fitScale, renderSpecOf } from '../../src/lib/core/render';

const obj = (o: Partial<SignObject>): SignObject => ({ id: 'o', photoId: 'p', name: 'x', shape: 'rect', quad: [[0, 0], [1, 0], [1, 1], [0, 1]], sheetIds: [], createdAt: 0, ...o });
const place = { cx: 4500, cy: 4200, w: 9000, h: 1000 };

describe('실사 합성 사양 (사인물 → 3D 간판)', () => {
  it('채널 제품 + 문구 → 입체 글자. 글자 높이는 영역 세로, 벽 위치는 영역 중심', () => {
    const s = renderSpecOf(obj({ productId: 'ch-front', text: '간판다', widthMm: 9000, heightMm: 1000 }), place)!;
    expect(s.kind).toBe('channel');
    expect(s.lighting).toBe('front');
    expect(s.heightMm).toBe(1000);
    expect(s.x).toBe(4500); expect(s.y).toBe(4200);
  });
  it('채널인데 문구가 없으면 박스로 대신 보여 준다 (자리만)', () => {
    const s = renderSpecOf(obj({ productId: 'ch-halo' }), place)!;
    expect(s.kind).toBe('lightbox');
    expect(s.widthMm).toBe(9000); expect(s.heightMm).toBe(1000);
  });
  it('보드 제품 → 박스: 플렉스는 발광, 나머지는 비조명. 두께는 제품 기본값', () => {
    expect(renderSpecOf(obj({ productId: 'board-flex' }), place)!.lighting).toBe('front');
    const acp = renderSpecOf(obj({ productId: 'board-acp', text: '간판다' }), place)!;
    expect(acp.lighting).toBe('none');
    expect(acp.kind).toBe('lightbox');
    expect(acp.depthMm).toBeGreaterThan(10);
    expect(acp.text).toBe('간판다');
  });
  it('시트만 있으면 얇은 면 (두께 ≤ 5mm)', () => {
    const s = renderSpecOf(obj({ sheetIds: ['sh-print'] }), place)!;
    expect(s.kind).toBe('lightbox');
    expect(s.depthMm).toBeLessThanOrEqual(5);
  });
  it('분류가 없어도 회색 판으로 자리를 보여 준다', () => {
    const s = renderSpecOf(obj({}), place)!;
    expect(s.kind).toBe('lightbox'); expect(s.lighting).toBe('none'); expect(s.faceColor).toBe('#9aa0a6');
    expect(s.widthMm).toBe(9000); expect(s.heightMm).toBe(1000);
  });
  it('입체 설정의 색을 쓴다', () => {
    const s = renderSpecOf(obj({ productId: 'board-acp', letter3d: { depthMm: 60, faceColor: '#123456', sideColor: '#abcdef', letterSpacing: 0 } }), place)!;
    expect(s.faceColor).toBe('#123456'); expect(s.depthMm).toBe(60);
  });
});

describe('입체 글자를 그린 영역 폭에 맞춤', () => {
  it('글자 폭이 영역보다 넓으면 줄이고, 좁으면 그대로', () => {
    expect(fitScale(12000, 9000)).toBeCloseTo(0.75, 6);
    expect(fitScale(6000, 9000)).toBe(1);
    expect(fitScale(0, 9000)).toBe(1);
  });
});
