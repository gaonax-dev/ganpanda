// 멤버 컨펌 (2026-10-22 사용자: "컨펌에 맴버컴펌도 필요하다") — 고객에게 보내기 전 팀 안 확인
import { describe, expect, it } from 'vitest';
import { addMemberCheck, memberCheckState } from '../../src/lib/core/proposal';

describe('멤버 확인', () => {
  it('같은 사람은 마지막 것만, 지금 내용 해시와 같으면 유효·다르면 다시 확인', () => {
    let checks = addMemberCheck(undefined, { by: '김실측', at: 1, hash: 'h1' });
    checks = addMemberCheck(checks, { by: '이디자인', at: 2, hash: 'h1' });
    checks = addMemberCheck(checks, { by: '김실측', at: 3, hash: 'h2' });
    expect(checks.map((c) => `${c.by}:${c.hash}`)).toEqual(['이디자인:h1', '김실측:h2']);
    const st = memberCheckState(checks, 'h2');
    expect(st.valid.map((c) => c.by)).toEqual(['김실측']);
    expect(st.stale.map((c) => c.by)).toEqual(['이디자인']);
    expect(memberCheckState(undefined, 'h2')).toEqual({ valid: [], stale: [] });
  });
});

describe('사인물마다 컨펌 (2026-10-22 "정면도 사인물 카드에 컨펌이 있어야한다 … 사인물마다. 고객과 맴버 컨펌")', async () => {
  const { signHash, customerSignState } = await import('../../src/lib/core/proposal');
  const base = { id: 'a', name: '간판', photoId: 'p', shape: 'rect' as const, quad: [], sheetIds: [], createdAt: 1, widthMm: 3000, heightMm: 600 };
  it('사인물 지문은 그 사인물 내용만 — 다른 사인물이나 자리(listX)가 바뀌어도 그대로, 크기·구성이 바뀌면 바뀐다', () => {
    const h = signHash(base, { w: 3000, h: 600 }, 500000);
    expect(signHash({ ...base, listX: 900 }, { w: 3000, h: 600 }, 500000)).toBe(h);
    expect(signHash(base, { w: 3200, h: 600 }, 500000)).not.toBe(h);
    expect(signHash({ ...base, parts: [{ id: 'x', kind: 'channel', type: 'ch-front', items: [] }] } as never, { w: 3000, h: 600 }, 500000)).not.toBe(h);
  });
  it('고객 상태: 동의 전 · 진행 · 제외 · 그 사인물만 바뀌면 다시 동의 필요 (옛 동의는 전체 기준)', () => {
    const ap = (o: Record<string, unknown> = {}) => ({ id: '1', at: 1, by: '홍', hash: 'H', snapshot: { items: [], subtotal: 0, vat: 0, total: 0, vatIncluded: true, signHashes: { a: 'ha', b: 'hb' } }, ...o });
    expect(customerSignState(undefined, 'a', 'ha', false)).toBe('none');
    expect(customerSignState(ap(), 'a', 'ha', false)).toBe('ok');
    expect(customerSignState(ap(), 'a', 'ha2', false)).toBe('changed');
    expect(customerSignState(ap({ excluded: ['a'] }), 'a', 'ha', false)).toBe('excluded');
    const old = { id: '1', at: 1, by: '홍', hash: 'H', snapshot: { items: [], subtotal: 0, vat: 0, total: 0, vatIncluded: true } };
    expect(customerSignState(old, 'a', 'x', true)).toBe('ok');
    expect(customerSignState(old, 'a', 'x', false)).toBe('changed');
  });
});
