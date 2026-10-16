// 시트 = UV 출력 / 재질 시트, 컷팅은 옵션 (2026-10-16 사용자: "시트는 uv출력, 재질로 분류하고 여기에서 커팅(uv실사에 맞게 컷팅하는 것을 돔보컷팅이라한다)을 옵션으로 넣는다.
// 컷팅에는 반컷, 완컷(보조시트 체크) 그리고 문구가 없으면 구성내역을 문자에 넣는다. uv출력 돔보컷팅 완컷")
import { describe, expect, it } from 'vitest';
import { PART_TYPES, newPart, partSpecOf, partsOf, signTextOf } from '../../src/lib/core/parts';
import { partOptionFields } from '../../src/lib/core/options';
import { sheetById, sheetsForPicker } from '../../src/lib/core/catalog';
import { quoteObject } from '../../src/lib/core/quote';
import { DEFAULT_PRICES } from '../../src/lib/core/pricing';
import type { SignObject, SignPart } from '../../src/lib/core/model';

const obj = (p: Partial<SignObject>): SignObject => ({ id: 'o', photoId: 'p', name: 'A', shape: 'rect', quad: [], sheetIds: [], createdAt: 0, ...p });
const sheet = (type: string, options: Record<string, string | boolean> = {}): SignPart => ({ ...newPart('sheet', type), options });
const keys = (p: SignPart) => partOptionFields(p).map((f) => f.key);

describe('시트 분류: UV 출력 · 재질 시트', () => {
  it('고르는 종류와 이름 (커팅은 이름이 아니라 옵션)', () => {
    expect(PART_TYPES.sheet.map((t) => [t.id, t.label])).toEqual([['sh-print', 'UV 출력'], ['sh-cut', '재질 시트']]);
    expect(sheetById('sh-print')!.name).toBe('UV 출력');
    expect(sheetById('sh-cut')!.name).toBe('재질 시트');
    expect(sheetsForPicker().map((s) => s.id)).toEqual(['sh-print', 'sh-cut']);
  });
  it('재질 시트 재질에 안개 포함', () => {
    const f = partOptionFields(sheet('sh-cut')).find((x) => x.key === 'sheetMat')!;
    expect(f.values!.map((v) => v.id)).toEqual(['단색', '반사', '투명', '메탈', '홀로그램', '안개']);
  });
});

describe('컷팅 옵션', () => {
  it('UV 출력 = 돔보컷팅 / 컷팅 없음, 재질 시트 = 커팅 / 컷팅 없음', () => {
    expect(partOptionFields(sheet('sh-print')).find((f) => f.key === 'cut')!.values!.map((v) => v.id)).toEqual(['돔보컷팅', '컷팅 없음']);
    expect(partOptionFields(sheet('sh-cut')).find((f) => f.key === 'cut')!.values!.map((v) => v.id)).toEqual(['커팅', '컷팅 없음']);
  });
  it('컷팅하면 완컷/반컷, 완컷이면 보조시트 체크. 컷팅 없음이면 둘 다 없음', () => {
    expect(keys(sheet('sh-print'))).toEqual(expect.arrayContaining(['cut', 'cutMode', 'transferTape']));
    expect(keys(sheet('sh-print', { cutMode: '반컷' }))).not.toContain('transferTape');
    expect(keys(sheet('sh-print', { cut: '컷팅 없음' }))).not.toContain('cutMode');
    expect(keys(sheet('sh-print', { cut: '컷팅 없음' }))).not.toContain('transferTape');
    expect(keys(sheet('sh-cut'))).not.toContain('halfCut');
  });
  it('옛 반컷팅(halfCut) → 반컷', () => {
    const [p] = partsOf(obj({ sheetIds: ['sh-cut'], options: { halfCut: true } }));
    expect(p.options?.cutMode).toBe('반컷');
    const saved = partsOf(obj({ parts: [sheet('sh-cut', { halfCut: true })] }));
    expect(saved[0].options?.cutMode).toBe('반컷');
  });
});

describe('구성내역 문구', () => {
  it('UV 출력 돔보컷팅 완컷 (+ 보조시트), 재질 시트는 재질·커팅', () => {
    expect(partSpecOf(sheet('sh-print'))).toBe('UV 출력 돔보컷팅 완컷');
    expect(partSpecOf(sheet('sh-print', { transferTape: true }))).toBe('UV 출력 돔보컷팅 완컷 보조시트');
    expect(partSpecOf(sheet('sh-cut', { sheetMat: '반사', cutMode: '반컷' }))).toBe('재질 시트 반사 커팅 반컷');
    expect(partSpecOf(sheet('sh-print', { cut: '컷팅 없음' }))).toBe('UV 출력');
  });
  it('문구 = 사인물 문구 > 글자 객체 > 구성내역', () => {
    expect(signTextOf(obj({ text: '간판다' }))).toBe('간판다');
    const withText = sheet('sh-cut'); withText.items = [{ id: 't', kind: 'text', text: 'OPEN', x: 0, y: 0, h: 100 }];
    expect(signTextOf(obj({ parts: [withText] }))).toBe('OPEN');
    expect(signTextOf(obj({ parts: [sheet('sh-print')] }))).toBe('UV 출력 돔보컷팅 완컷');
    expect(signTextOf(obj({}))).toBe('');
  });
  it('견적 줄 이름에 구성내역', () => {
    const [l] = quoteObject(obj({ parts: [sheet('sh-print')], widthMm: 1000, heightMm: 1000 }), DEFAULT_PRICES);
    expect(l.label).toBe('A · UV 출력 돔보컷팅 완컷');
  });
});
