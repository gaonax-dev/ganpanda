// 갈바 레이저 타공 + 내부 조명 (2026-10-17 사용자: "갈바에 레이저 타공과 내부 조명 옵션추가해줘")
import { describe, expect, it } from 'vitest';
import type { SignObject } from '../../src/lib/core/model';
import { describeOptions, optionGroupsFor } from '../../src/lib/core/options';
import { renderSpecOf } from '../../src/lib/core/render';
import { parseSpecText, applySpecItems } from '../../src/lib/core/specText';

const obj = (o: Partial<SignObject>): SignObject => ({ id: 'o', photoId: 'p', name: 'A', shape: 'rect', quad: [[0, 0], [1, 0], [1, 1], [0, 1]], sheetIds: [], createdAt: 0, ...o });
const values = (o: SignObject, k: string) => optionGroupsFor(o).flatMap((g) => g.fields).find((f) => f.key === k)?.values?.map((v) => v.id);
const place = { cx: 0, cy: 0, w: 3000, h: 600 };

describe('갈바: 레이저 타공 · 내부 조명', () => {
  it('선택지: 타공 없음/글자/패턴/글자+패턴, 내부 조명 비조명/LED', () => {
    const o = obj({ productId: 'board-galva' });
    expect(values(o, 'perforation')).toEqual(['없음', '글자 타공', '패턴 타공', '글자+패턴 타공']);
    expect(values(o, 'light')).toEqual(['비조명', 'LED']);
    expect(describeOptions(obj({ productId: 'board-galva', options: { perforation: '글자 타공', light: 'LED' } }))).toEqual(expect.arrayContaining(['글자 타공', 'LED']));
  });
  it('3D·실사: 내부 조명 LED 면 상자가 빛난다(front), 비조명이면 none', () => {
    expect(renderSpecOf(obj({ productId: 'board-galva', widthMm: 3000, heightMm: 600, options: { light: 'LED' } }), place)!.lighting).toBe('front');
    expect(renderSpecOf(obj({ productId: 'board-galva', widthMm: 3000, heightMm: 600 }), place)!.lighting).toBe('none');
  });
  it('사양 글: "갈바 타공 LED" / "갈바 글자타공 내부조명" 이 옵션으로 잡힌다', () => {
    const o = obj({ productId: 'board-flex' });
    const items = parseSpecText('갈바 타공 LED', o);
    expect(items.map((i) => (i.kind === 'option' ? `${i.key}=${i.value}` : i.kind))).toEqual(['product', 'perforation=글자 타공', 'light=LED']);
    const p = applySpecItems(o, parseSpecText('갈바 글자타공 내부조명', o));
    expect(p.productId).toBe('board-galva');
    expect(p.options).toMatchObject({ perforation: '글자 타공', light: 'LED' });
  });
});
