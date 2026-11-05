// 고객 컨펌 기준선 · 변경안 — 구성(재료 층·구성 요소)까지 (2026-11-05 사용자: "견적은 현장인원이나 사장이 내지만 디자이너가 고객과 소통하면서 변경을 할 때도 있어
// 고객이 컨펌한 내역으로 진행하는게 깔끔한데 변경사항을 같이 공유하면 좋겠다. 결국 내부의 결정보다 고객의 결정이 우선해")
import { describe, expect, it } from 'vitest';
import type { SignObject, SignPart } from '../../src/lib/core/model';
import { partsHash, partsSummary, snapshotOf } from '../../src/lib/core/proposal';
import { diffIssued, issueOf, type IssuedQuote } from '../../src/lib/core/quoteChange';

const ch = (stack?: SignPart['stack']): SignPart => ({ id: 'c1', kind: 'channel', type: 'ch-front', items: [{ id: 't', kind: 'text', text: '카페', x: 0, y: 0, h: 400 }], ...(stack ? { stack } : {}) });
const sign = (parts: SignPart[]): SignObject => ({ id: 's1', photoId: 'p', name: '정면', shape: 'rect', quad: [], sheetIds: [], createdAt: 0, productId: 'board-galva', widthMm: 3000, heightMm: 600, parts });
const size = () => ({ w: 3000, h: 600, estimated: false });
const quote = { lines: [], subtotal: 0, vat: 0, total: 0, vatIncluded: false } as never;

describe('구성 요약·지문', () => {
  it('구성 요소·재료 층·두께·글자가 요약에 들어가고, 재료 층을 바꾸면 요약·지문이 바뀐다 (자리만 옮긴 건 그대로)', () => {
    const a = sign([ch([{ id: 'l1', material: 'galva', thickness: 1.2 }, { id: 'l2', material: 'acrylic', thickness: 3 }])]);
    const b = sign([ch([{ id: 'l1', material: 'galva', thickness: 1.2 }, { id: 'l2', material: 'acrylic', thickness: 5 }])]);
    expect(partsSummary(a)).toContain('카페');
    expect(partsSummary(a)).not.toBe(partsSummary(b));
    expect(partsHash([a])).not.toBe(partsHash([b]));
    const moved = { ...a, listX: 999, quad: [[1, 1], [2, 1], [2, 2], [1, 2]] as [number, number][] };
    expect(partsHash([moved])).toBe(partsHash([a]));
  });
});

describe('바뀐 내용에 "구성"', () => {
  const issueFrom = (o: SignObject, no: number): IssuedQuote => issueOf({ id: `i${no}`, no, at: no, by: '사장', snapshot: snapshotOf([o], size, quote, []), lines: [], hash: 'same' });
  const a = sign([ch([{ id: 'l1', material: 'galva', thickness: 1.2 }])]);
  const b = sign([ch([{ id: 'l1', material: 'galva', thickness: 2 }])]);
  it('기준과 구성이 다르면 그 사인물이 바뀜(구성)', () => {
    const d = diffIssued(issueFrom(a, 1), issueFrom(b, 2));
    expect(d.items).toEqual([expect.objectContaining({ id: 's1', kind: 'changed', fields: [expect.objectContaining({ field: 'parts' })] })]);
  });
  it('예전 발행본(구성 요약 없음)과는 구성으로 비교하지 않는다 — 갑자기 "바뀜"이 뜨지 않게', () => {
    const old = issueFrom(a, 1);
    delete (old.snapshot.items[0] as { parts?: string }).parts;
    expect(diffIssued(old, issueFrom(b, 2)).items).toEqual([]);
  });
});
