// 용어 통일 (2026-10-19 V5): 공급사 용어 > 기본 이름, 연결 공급사 기준, 주문 JSON·힌트·용어집
import { describe, expect, it } from 'vitest';
import { glossary, glossaryCsv, partSupplierLabel, supplierOf, supplierTerm, termFor, termHint } from '../../src/lib/core/terms';
import { DEFAULT_PRICES } from '../../src/lib/core/pricing';
import { newItem, newPart } from '../../src/lib/core/parts';
import type { SignObject } from '../../src/lib/core/model';
import { ALIDA, linkOf } from '../../src/lib/core/supplierPrices';

const obj = (o: Partial<SignObject>): SignObject => ({ id: 'o', photoId: 'p', name: 'A', shape: 'rect', quad: [[0, 0], [1, 0], [1, 1], [0, 1]], sheetIds: [], createdAt: 0, ...o });
const alidaItem = ALIDA.items.find((i) => i.name.includes('후광'))!;
const linked = { ...DEFAULT_PRICES, links: { 'ch-halo': linkOf(ALIDA, alidaItem), 'sh-print': linkOf(ALIDA, ALIDA.items[0]) } };

describe('공급사 용어', () => {
  it('연결된 공급사가 있으면 그 용어, 없으면 기본 이름', () => {
    expect(supplierOf(linked, 'ch-halo')).toBe('alida');
    expect(supplierOf(DEFAULT_PRICES, 'ch-halo')).toBeUndefined();
    expect(termFor('product:ch-halo', 'alida', '후광 채널')).toBe('후광 채널');
    expect(termFor('opt:chType=오싸이', 'alida', '오싸이')).toBe('오사이');
    expect(termFor('opt:chType=오싸이', undefined, '오싸이')).toBe('오싸이');
    expect(supplierTerm('opt:chType=오싸이', 'alida', '오싸이')).toBe('오사이');
    expect(supplierTerm('product:ch-halo', 'alida', '후광 채널')).toBeNull(); // 같으면 힌트 없음
  });
  it('구성 요소의 주문서 이름: 시트는 공급사 분류명으로', () => {
    const sh = newPart('sheet', 'sh-print');
    expect(partSupplierLabel(sh, linked, 'UV 출력')).toEqual({ supplier: 'alida', label: 'UV시트 출력' });
    expect(partSupplierLabel(sh, DEFAULT_PRICES, 'UV 출력')).toEqual({ label: 'UV 출력' });
  });
  it('확인 창 힌트: 채널 옵션 값은 그 사인물의 채널 종류에 연결된 공급사 기준', () => {
    const ch = newPart('channel', 'ch-halo'); ch.items = [{ ...newItem('text'), text: 'A', h: 300 }];
    const o = obj({ productId: 'board-galva', parts: [ch] });
    expect(termHint({ kind: 'channelOption', key: 'chType', value: '오싸이', label: 'x' }, o, linked)).toBe("알리다 용어 '오사이'");
    expect(termHint({ kind: 'channelOption', key: 'chType', value: '오싸이', label: 'x' }, o, DEFAULT_PRICES)).toBeNull();
    expect(termHint({ kind: 'channel', id: 'ch-halo', label: 'x' }, o, linked)).toBeNull(); // 이름이 같다
  });
  it('용어집: 종류·시트·옵션 값 행에 표준·공급사 용어·내 동의어, CSV 로', () => {
    const rows = glossary(linked, [{ phrase: '뒷광', meaning: [{ kind: 'channel', id: 'ch-halo', label: 'x' }] }, { phrase: '오싸', meaning: [{ kind: 'channelOption', key: 'chType', value: '오싸이', label: 'x' }] }]);
    expect(rows.find((r) => r.key === 'product:ch-halo')).toMatchObject({ standard: '후광 채널', supplier: '알리다', synonyms: ['뒷광'] });
    expect(rows.find((r) => r.key === 'sheet:sh-print')).toMatchObject({ supplierTerm: 'UV시트 출력' });
    expect(rows.find((r) => r.key === 'opt:chType=오싸이')).toMatchObject({ standard: '오싸이', synonyms: ['오싸'] });
    const csv = glossaryCsv(linked, []);
    expect(csv.split('\n')[0]).toBe('﻿구분,표준 용어,연결 공급사,공급사 용어,내 동의어');
    expect(csv).toContain('시트,UV 출력,알리다,UV시트 출력,');
  });
});
