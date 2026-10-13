import { describe, expect, it } from 'vitest';
import { normalizeCrop, pushHistory, sourceKind, type DesignRef } from '../../src/lib/core/design';

describe('잘라낼 영역 정규화', () => {
  const page = { w: 1000, h: 500 };
  it('페이지 안으로 자르고, 뒤집힌 좌표도 바로잡는다', () => {
    expect(normalizeCrop({ x: -10, y: 20, w: 300, h: 200 }, page)).toEqual({ x: 0, y: 20, w: 290, h: 200 });
    expect(normalizeCrop({ x: 900, y: 400, w: 300, h: 300 }, page)).toEqual({ x: 900, y: 400, w: 100, h: 100 });
    expect(normalizeCrop({ x: 500, y: 300, w: -200, h: -100 }, page)).toEqual({ x: 300, y: 200, w: 200, h: 100 });
  });
  it('너무 작으면 null (최소 8px)', () => {
    expect(normalizeCrop({ x: 10, y: 10, w: 5, h: 100 }, page)).toBeNull();
  });
});

describe('소스 히스토리', () => {
  const ref = (n: number): DesignRef => ({ sourceId: 's', page: 0, crop: { x: n, y: 0, w: 10, h: 10 } });
  it('최신이 앞, 같은 내용은 중복 추가하지 않고, 최대 20개', () => {
    let h = pushHistory([], ref(1), { at: 1, author: 'a' });
    h = pushHistory(h, ref(1), { at: 2, author: 'a' });
    expect(h).toHaveLength(1);
    h = pushHistory(h, ref(2), { at: 3, author: 'b' });
    expect(h[0]).toMatchObject({ crop: { x: 2 }, at: 3, author: 'b' });
    for (let i = 3; i < 40; i++) h = pushHistory(h, ref(i), { at: i, author: 'a' });
    expect(h).toHaveLength(20);
    expect(h[0].crop.x).toBe(39);
  });
});

describe('파일 종류', () => {
  it('확장자·MIME 로 pdf 계열(ai·pdf)/svg/비트맵/불가 를 가른다', () => {
    expect(sourceKind('시안.ai', 'application/postscript')).toBe('pdf');
    expect(sourceKind('시안.AI', '')).toBe('pdf');
    expect(sourceKind('도면.pdf', 'application/pdf')).toBe('pdf');
    expect(sourceKind('로고.svg', 'image/svg+xml')).toBe('svg');
    expect(sourceKind('사진.jpg', 'image/jpeg')).toBe('bitmap');
    expect(sourceKind('문서.docx', '')).toBeNull();
  });
});
