// UV 후렉스 출력의 배경색·글자·그림 (2026-10-21 사용자: "uv후렉스출력에 배경색 글자 그림 옵션 넣어줘")
import { describe, expect, it } from 'vitest';
import { addPrintItem, partsOf, partSpecOf } from '../../src/lib/core/parts';
import { partOptionFields, optionGroupsFor } from '../../src/lib/core/options';
import { componentOf } from '../../src/lib/core/components';
import { quoteObject } from '../../src/lib/core/quote';
import { DEFAULT_PRICES } from '../../src/lib/core/pricing';
import type { SignObject } from '../../src/lib/core/model';

const obj = (o: Partial<SignObject>): SignObject => ({ id: 'o', photoId: 'p', name: '후렉스', shape: 'rect', quad: [[0, 0], [1, 0], [1, 1], [0, 1]], sheetIds: [], createdAt: 0, ...o });

describe('후렉스 출력', () => {
  it('후렉스·천갈이 몸통의 출력면 색은 "배경색"', () => {
    for (const id of ['board-flex', 'board-reface']) expect(optionGroupsFor(obj({ productId: id })).flatMap((g) => g.fields).find((f) => f.key === 'faceSystem')!.label).toBe('배경색 색상 체계');
  });
  it('+ 출력 글자: 출력 구성 요소(UV 출력, 몸통 출력에 포함)를 하나 만들어 글자를 넣고, 다시 더하면 같은 구성 요소에', () => {
    const o = obj({ productId: 'board-flex', widthMm: 3000, heightMm: 600 });
    const a = addPrintItem(o, 'text');
    const o2 = { ...o, ...a.patch };
    const ps = partsOf(o2);
    expect(ps).toHaveLength(1);
    expect(ps[0]).toMatchObject({ kind: 'sheet', type: 'sh-print', on: 'frame', options: { included: true } });
    expect(ps[0].items.map((i) => i.kind)).toEqual(['text']);
    const b = addPrintItem(o2, 'image');
    const ps2 = partsOf({ ...o2, ...b.patch });
    expect(ps2).toHaveLength(1);
    expect(ps2[0].items.map((i) => i.kind)).toEqual(['text', 'image']);
    expect(b.partId).toBe(a.partId);
  });
  it('출력 구성 요소: 구성내역 "출력 (몸통 출력에 포함)", 컷팅 같은 시트 옵션 없음, 견적 줄 없음(후렉스 단가에 포함)', () => {
    const o = obj({ productId: 'board-flex', widthMm: 3000, heightMm: 600 });
    const withText = { ...o, ...addPrintItem(o, 'text').patch };
    const p = partsOf(withText)[0];
    expect(partSpecOf(p)).toBe('출력 (몸통 출력에 포함)');
    expect(partOptionFields(p)).toEqual([]);
    expect(componentOf('sheet').chip(p).text).toBe('출력');
    const lines = quoteObject(withText, DEFAULT_PRICES).filter((l) => l.amount > 0);
    expect(lines).toHaveLength(1); // 후렉스 몸통만
    expect(lines[0].label).toContain('후렉스');
  });
});
