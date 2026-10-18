// 색 라이브러리 (2026-10-17 사용자: "색상관리가 중요하다 … 컬러 카드 … 라이브러리에 저장해서 꺼내쓴다")
import { describe, expect, it } from 'vitest';
import type { SignObject } from '../../src/lib/core/model';
import { allTags, cardRef, findCardByName, newColorCard, normalizeTags, paintPatch, searchCards, tagSuggestions, validColorLibrary, type ColorCard } from '../../src/lib/core/colorLibrary';
import { paintHex, paintLabel, paintRef } from '../../src/lib/core/materials';
import { applySpecItems, parseSpecText } from '../../src/lib/core/specText';
import { bodyLook } from '../../src/lib/core/render';

const obj = (o: Partial<SignObject>): SignObject => ({ id: 'o', photoId: 'p', name: 'A', shape: 'rect', quad: [[0, 0], [1, 0], [1, 1], [0, 1]], sheetIds: [], createdAt: 0, ...o });
const card: ColorCard = { id: 'c1', kind: '시트', name: '딥레드', hex: '#8b1a1a', supplier: '3M', code: '1080-G13', createdAt: 1 };

describe('컬러 카드 → 도색 객체 스냅샷', () => {
  it('newColorCard: 이름·공급사 다듬기, hex 소문자, id 생성', () => {
    const c = newColorCard({ kind: '페인트', name: ' 버건디 ', hex: '#7A1F2E', supplier: ' ', code: 'KCC 7520' });
    expect(c).toMatchObject({ kind: '페인트', name: '버건디', hex: '#7a1f2e', supplier: undefined, code: 'KCC 7520' });
    expect(c.id).toHaveLength(8);
  });
  it('paintPatch: 체계 라이브러리 + 이름 + Hex + Ref + CardId → paintHex/paintLabel/paintRef 가 라이브러리 없이 읽는다', () => {
    const p = paintPatch('face', card);
    expect(p).toEqual({ faceSystem: '라이브러리', faceCode: '딥레드', faceHex: '#8b1a1a', faceRef: '시트 · 3M · 1080-G13', faceCardId: 'c1' });
    expect(paintHex(p, 'face')).toBe('#8b1a1a');
    expect(paintLabel(p, 'face')).toBe('딥레드');
    expect(paintRef(p, 'face')).toBe('시트 · 3M · 1080-G13');
    expect(cardRef({ kind: '천', supplier: undefined, code: undefined })).toBe('천');
    expect(bodyLook(obj({ productId: 'board-flex', options: p }))).toEqual({ color: '#8b1a1a', opacity: 1 });
  });
  it('validColorLibrary: 형식 검사 (종류·hex·이름), 통과하면 hex 소문자', () => {
    expect(validColorLibrary({ version: 1, colors: [{ ...card, hex: '#8B1A1A' }] })!.colors[0].hex).toBe('#8b1a1a');
    expect(validColorLibrary({ version: 1, colors: [{ ...card, kind: '유리' }] })).toBeNull();
    expect(validColorLibrary({ version: 1, colors: [{ ...card, hex: 'red' }] })).toBeNull();
    expect(validColorLibrary({ version: 1, colors: [{ ...card, name: '' }] })).toBeNull();
    expect(validColorLibrary(null)).toBeNull();
    expect(findCardByName([card], ' 딥레드 ')).toBe(card);
  });
});

describe('사양 글이 내 컬러 카드 이름을 알아본다', () => {
  it('"갈바 딥레드 채널 버건디 후광": 몸통 색 = 카드 스냅샷, 채널 색 = 내 버건디 카드(기본색보다 우선)', () => {
    const mine: ColorCard = { id: 'c2', kind: '페인트', name: '버건디', hex: '#661122', supplier: '삼화', code: 'S-77', createdAt: 2 };
    const o = obj({ productId: 'board-galva', widthMm: 3000, heightMm: 600 });
    const items = parseSpecText('갈바 딥레드 채널 버건디 후광', o, [card, mine]);
    expect(items.find((i) => i.kind === 'bodyColor')).toMatchObject({ label: '몸통 색: 딥레드', card: { id: 'c1' } });
    expect(items.find((i) => i.kind === 'channelColor')).toMatchObject({ label: '채널 색: 버건디', value: '#661122', card: { id: 'c2' } });
    const patch = applySpecItems(o, items);
    expect(patch.options).toMatchObject({ paintSystem: '라이브러리', paintCode: '딥레드', paintHex: '#8b1a1a', paintRef: '시트 · 3M · 1080-G13' });
    const ch = patch.parts!.find((p) => p.kind === 'channel')!;
    expect(ch.options).toMatchObject({ bodySystem: '라이브러리', bodyCode: '버건디', bodyHex: '#661122', bodyRef: '페인트 · 삼화 · S-77' });
    expect(patch.letter3d?.sideColor).toBe('#661122');
  });
  it('라이브러리가 없으면 기본색 어휘 그대로', () => {
    const items = parseSpecText('갈바 버건디', obj({ productId: 'board-galva' }));
    expect(items.find((i) => i.kind === 'bodyColor')).toMatchObject({ value: '버건디' });
    expect(items.find((i) => i.kind === 'bodyColor')).not.toHaveProperty('card.id');
  });
});

// 2026-10-18 사용자: "색이름 위에 tag — 입력창이자 검색창, 기존 태그를 하단에 셀렉터로, 글자가 입력되는 대로 리스트"
describe('태그·검색', () => {
  const a: ColorCard = { ...card, id: 'a', name: '딥레드', tags: ['카페', '메탈'] };
  const b: ColorCard = { ...card, id: 'b', name: '아이보리', supplier: '오라칼', tags: ['카페'] };
  const c: ColorCard = { ...card, id: 'c', name: '네이비', kind: '페인트' };
  it('normalizeTags: 공백·중복·빈 것 정리, 20자·10개 제한, 없으면 undefined', () => {
    expect(normalizeTags([' 카페 ', '카페', '', '메탈'])).toEqual(['카페', '메탈']);
    expect(normalizeTags([])).toBeUndefined();
    expect(normalizeTags(Array.from({ length: 12 }, (_, i) => `t${i}`))!.length).toBe(10);
    expect(newColorCard({ kind: '시트', name: 'x', hex: '#000000', tags: ['a', 'a'] }).tags).toEqual(['a']);
  });
  it('allTags: 많이 쓴 순, tagSuggestions: 글자 포함·이미 고른 것 제외', () => {
    expect(allTags([a, b, c])).toEqual(['카페', '메탈']);
    expect(tagSuggestions([a, b, c], '')).toEqual(['카페', '메탈']);
    expect(tagSuggestions([a, b, c], '메')).toEqual(['메탈']);
    expect(tagSuggestions([a, b, c], '', ['카페'])).toEqual(['메탈']);
  });
  it('searchCards: 이름·태그·공급사·코드·종류', () => {
    expect(searchCards([a, b, c], '카페').map((x) => x.id)).toEqual(['a', 'b']);
    expect(searchCards([a, b, c], '오라').map((x) => x.id)).toEqual(['b']);
    expect(searchCards([a, b, c], '페인트').map((x) => x.id)).toEqual(['c']);
    expect(searchCards([a, b, c], '1080').map((x) => x.id)).toEqual(['a', 'b', 'c']);
    expect(searchCards([a, b, c], '').length).toBe(3);
  });
  it('validColorLibrary: 태그 형식', () => {
    expect(validColorLibrary({ version: 1, colors: [{ ...card, tags: ['x'] }] })!.colors[0].tags).toEqual(['x']);
    expect(validColorLibrary({ version: 1, colors: [{ ...card, tags: 'x' }] })).toBeNull();
    expect(validColorLibrary({ version: 1, colors: [{ ...card, tags: ['가'.repeat(21)] }] })).toBeNull();
  });
});
