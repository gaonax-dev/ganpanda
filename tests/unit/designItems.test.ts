// 제안 내용 ↔ 디자인 내용 (2026-11-08 사용자: "제안은 텍스트와 지정컬러가 디자인은 pdf에서 가져온 페스와 디자인으로 각각 보여야한다. 속성에서 이걸 구분하고 관리 가능한가?"
// → (추천대로) 1단계: 구성 요소의 내용(글자·패스·색)만 디자인 쪽에 따로(SignObject.designItems), 재료·치수·구조는 함께, 견적은 제안 기준. roadmap 11-0)
import { describe, expect, it } from 'vitest';
import type { SignObject } from '../../src/lib/core/model';
import { asDesigned, legacyDesignPatch, partsOf, withoutDesign } from '../../src/lib/core/parts';
import { quoteObject } from '../../src/lib/core/quote';
import { DEFAULT_PRICES } from '../../src/lib/core/pricing';

const text = { id: 't1', kind: 'text' as const, text: '카페', x: 0, y: 0, h: 400 };
const vec = { id: 'v1', kind: 'image' as const, image: { assetId: 'A', name: '정면 채널 (PDF 레이어)' }, vector: true, x: 0, y: 0, w: 3000, h: 600 };
const sign = (extra: Partial<SignObject> = {}): SignObject => ({
  id: 's', photoId: 'p', name: '정면', shape: 'rect', quad: [[0, 0], [1, 0], [1, 1], [0, 1]], sheetIds: [], productId: 'board-galva', widthMm: 3000, heightMm: 600, createdAt: 0,
  parts: [{ id: 'ch', kind: 'channel', type: 'ch-front', items: [text] }], ...extra,
} as SignObject);

describe('asDesigned — 디자인 쪽 내용으로 본 사인물', () => {
  it('디자인 내용이 없으면 그대로(같은 객체)', () => { const o = sign(); expect(asDesigned(o)).toBe(o); });
  it('디자인 내용이 있는 구성 요소만 내용을 바꾸고, 구조·옵션은 그대로', () => {
    const o = sign({ designItems: { ch: [vec] } });
    const d = partsOf(asDesigned(o));
    expect(d).toHaveLength(1);
    expect(d[0].type).toBe('ch-front');
    expect(d[0].items).toEqual([vec]);
    expect(partsOf(o)[0].items).toEqual([text]); // 제안 쪽은 그대로
  });
  it('없는 구성 요소 id 의 디자인 내용은 무시', () => {
    expect(partsOf(asDesigned(sign({ designItems: { nope: [vec] } })))[0].items).toEqual([text]);
  });
  it('제안(withoutDesign)은 디자인 내용을 쓰지 않는다', () => {
    expect(partsOf(withoutDesign(sign({ designItems: { ch: [vec] } })))[0].items).toEqual([text]);
  });
  it('견적은 제안 기준 (1단계) — 디자인 내용이 있어도 금액이 같다', () => {
    const sum = (o: SignObject) => quoteObject(o, DEFAULT_PRICES).reduce((s, l) => s + l.amount, 0);
    expect(sum(sign({ designItems: { ch: [vec] } }))).toBe(sum(sign()));
  });
});

describe('legacyDesignPatch — 예전에 제안 내용을 덮어쓴 PDF 레이어 패스를 디자인 쪽으로', () => {
  it('PDF 레이어 벡터만 든 구성 요소: 디자인 내용으로 옮기고 제안 내용은 비운다', () => {
    const p = legacyDesignPatch(sign({ parts: [{ id: 'ch', kind: 'channel', type: 'ch-front', items: [vec] }] }))!;
    expect(p.designItems).toEqual({ ch: [vec] });
    expect(p.parts![0].items).toEqual([]);
  });
  it('옮길 것이 없거나 이미 디자인 내용이 있으면 null', () => {
    expect(legacyDesignPatch(sign())).toBeNull();
    expect(legacyDesignPatch(sign({ parts: [{ id: 'ch', kind: 'channel', type: 'ch-front', items: [vec] }], designItems: { ch: [vec] } }))).toBeNull();
  });
});
