// 발행 견적 박제 · 계약 견적 대비 변경 · 고객 안전장치 (2026-10-26 사용자:
// "견적을 발행하고 다시 호출할땐 그간 원가 견적 금액이 변경되어도 이전에 발행 상태로 나와야한다 … 견적을 변경한다면 다시 발행하고 고객과 협의 … 고객이 거절하면 계약 견적으로 진행",
// "고객이 간판업체의 견적을 선택한 경우 해당 견적을 기준으로 이후 변경 견적의 차이를 쉽게 확인 … 고객에게 손해가 나거나 변경을 이해하지 못하게 복잡한 변경을 시스탬적으로 잡아내서 고객에게 안전장치")
import { describe, expect, it } from 'vitest';
import { diffIssued, customerRisks, customerView, issueOf, type IssuedQuote } from '../../src/lib/core/quoteChange';
import type { Approval } from '../../src/lib/core/proposal';
import type { Snapshot } from '../../src/lib/core/proposal';

const item = (id: string, w: number, h: number, amount: number, extra: Partial<Snapshot['items'][number]> = {}) =>
  ({ id, name: id, category: '간판', type: '갈바', sheets: [], options: [], size: { w, h, estimated: false }, amount, ...extra });
const issue = (items: Snapshot['items'], lines: IssuedQuote['lines'] = [], no = 1): IssuedQuote => {
  const subtotal = items.reduce((a, i) => a + i.amount, 0);
  return { id: `i${no}`, no, at: no, by: '사장', snapshot: { items, subtotal, vat: Math.round(subtotal * 0.1), total: Math.round(subtotal * 1.1), vatIncluded: false }, lines, hash: `h${no}` };
};

describe('issueOf — 발행 박제본', () => {
  it('견적 줄(수량·단위·단가·원가·금액)과 사인물 사양·합계를 그대로 담는다 — 나중에 단가표가 바뀌어도 이 값으로 보인다', () => {
    const snapshot: Snapshot = { items: [item('a', 3000, 600, 500_000)], subtotal: 500_000, vat: 50_000, total: 550_000, vatIncluded: false };
    const lines = [{ key: 'a:body', objectId: 'a', label: '갈바', detail: '3,000×600mm', amount: 500_000, qty: 1.8, unit: '㎡', unitPrice: 70_000, cost: 40_000, priceId: 'board-galva' }];
    const q = issueOf({ id: 'p1', no: 1, at: 100, by: '사장', snapshot, lines, hash: 'abc' });
    expect(q.lines[0]).toEqual({ key: 'a:body', objectId: 'a', label: '갈바', detail: '3,000×600mm', amount: 500_000, qty: 1.8, unit: '㎡', unitPrice: 70_000, cost: 40_000, priceId: 'board-galva' });
    expect(q.snapshot.total).toBe(550_000);
    // 깊은 복사 — 원본을 고쳐도 박제본은 그대로
    lines[0].amount = 1;
    snapshot.items[0].amount = 1;
    expect(q.lines[0].amount).toBe(500_000);
    expect(q.snapshot.items[0].amount).toBe(500_000);
  });
});

describe('diffIssued — 계약 견적(기준) 대비 변경 견적', () => {
  it('사인물별 추가·삭제·변경(크기·종류·시트·옵션·문구·디자인·금액)과 합계 차이', () => {
    const base = issue([item('a', 3000, 600, 500_000), item('b', 1000, 1000, 200_000), item('c', 500, 500, 50_000)]);
    const next = issue([item('a', 2800, 600, 520_000), item('b', 1000, 1000, 200_000), item('d', 900, 300, 80_000, { type: '스카시' })], [], 2);
    const d = diffIssued(base, next);
    expect(d.items.map((x) => [x.id, x.kind])).toEqual([['a', 'changed'], ['c', 'removed'], ['d', 'added']]); // b 는 그대로라 없음
    const a = d.items.find((x) => x.id === 'a')!;
    expect(a.fields).toEqual([{ field: 'size', before: '3000×600', after: '2800×600' }, { field: 'amount', before: 500_000, after: 520_000 }]);
    expect(a.amountDelta).toBe(20_000);
    expect(d.totalDelta).toBe(next.snapshot.total - base.snapshot.total);
    expect(d.unchanged).toBe(1);
  });
  it('같은 단가 항목의 단가가 오르면 단가 변경으로', () => {
    const l = (unitPrice: number) => [{ key: 'a:body', objectId: 'a', label: '갈바', detail: '', amount: unitPrice * 2, qty: 2, unit: '㎡', unitPrice, priceId: 'board-galva' }];
    const d = diffIssued(issue([item('a', 1000, 2000, 140_000)], l(70_000)), issue([item('a', 1000, 2000, 160_000)], l(80_000), 2));
    expect(d.unitChanges).toEqual([{ priceId: 'board-galva', label: '갈바', before: 70_000, after: 80_000 }]);
  });
});

describe('customerRisks — 고객 안전장치', () => {
  const risks = (base: IssuedQuote, next: IssuedQuote) => customerRisks(diffIssued(base, next)).map((r) => [r.code, r.level, r.itemId ?? null]);
  it('사양은 그대로인데 금액만 오르면 위험', () => {
    expect(risks(issue([item('a', 3000, 600, 500_000)]), issue([item('a', 3000, 600, 550_000)], [], 2))).toContainEqual(['price-up-same-spec', 'danger', 'a']);
  });
  it('작아지거나 빠졌는데 금액이 줄지 않으면 위험 (크기 축소·옵션 제외)', () => {
    expect(risks(issue([item('a', 3000, 600, 500_000)]), issue([item('a', 2500, 600, 500_000)], [], 2))).toContainEqual(['smaller-not-cheaper', 'danger', 'a']);
    expect(risks(issue([item('a', 3000, 600, 500_000, { options: ['LED', '타이머'] })]), issue([item('a', 3000, 600, 510_000, { options: ['LED'] })], [], 2))).toContainEqual(['less-not-cheaper', 'danger', 'a']);
  });
  it('항목이 빠지면 알림, 단가 인상은 경고, 합계 인상은 요약 경고', () => {
    const base = issue([item('a', 1000, 1000, 100_000), item('b', 1000, 1000, 100_000)]);
    const r = risks(base, issue([item('a', 1000, 1000, 250_000)], [], 2)); // b 를 빼고 a 를 올려 합계도 오름
    expect(r).toContainEqual(['removed', 'info', 'b']);
    expect(r).toContainEqual(['total-up', 'warn', null]);
  });
  it('한 번에 바뀐 것이 많으면(사인물 4개 이상 또는 한 사인물에 3가지 이상) 복잡한 변경 경고', () => {
    const base = issue([item('a', 1000, 1000, 100_000, { type: '갈바', sheets: ['백색'] })]);
    const next = issue([item('a', 1200, 1000, 120_000, { type: '스카시', sheets: ['흑색'] })], [], 2);
    expect(risks(base, next)).toContainEqual(['complex', 'warn', 'a']);
    const many = issue([1, 2, 3, 4].map((i) => item(`x${i}`, 1000, 1000, 100_000)));
    const many2 = issue([1, 2, 3, 4].map((i) => item(`x${i}`, 1100, 1000, 100_000)), [], 2);
    expect(risks(many, many2)).toContainEqual(['complex', 'warn', null]);
  });
  it('고객에게 이로운 변경(더 크고 같은 금액·금액 인하)은 위험 아님', () => {
    expect(risks(issue([item('a', 3000, 600, 500_000)]), issue([item('a', 3200, 600, 500_000)], [], 2))).toEqual([]);
    expect(risks(issue([item('a', 3000, 600, 500_000)]), issue([item('a', 3000, 600, 450_000)], [], 2))).toEqual([]);
  });
});

describe('customerView — 고객이 보는 견적: 발행본만, 계약 뒤 새 발행은 변경 견적으로', () => {
  const ap = (proposalId: string, at: number, decision?: 'rejected'): Approval => ({ id: `a${at}`, at, by: '고객', hash: `h-${proposalId}`, snapshot: { items: [], subtotal: 0, vat: 0, total: 0, vatIncluded: false }, proposalId, ...(decision ? { decision } : {}) });
  const i1 = { ...issue([item('a', 1000, 1000, 100_000)]), at: 10 }, i2 = { ...issue([item('a', 1000, 1200, 120_000)], [], 2), at: 30 };
  it('발행이 없으면 null (옛 프로젝트는 지금처럼)', () => {
    expect(customerView([], [])).toEqual({ shown: null, contract: null, pending: null, rejected: null });
  });
  it('계약 전에는 마지막 발행본', () => {
    expect(customerView([i1, i2], [])).toMatchObject({ shown: { id: 'i2' }, contract: null, pending: null });
  });
  it('계약(진행 동의) 뒤 새로 발행하면 변경 견적 대기 — 보이는 것은 새 발행본, 기준은 계약 견적', () => {
    expect(customerView([i1, i2], [ap('i1', 20)])).toMatchObject({ shown: { id: 'i2' }, contract: { id: 'i1' }, pending: { id: 'i2' } });
  });
  it('변경 견적을 거절하면 계약 견적대로 — 보이는 것은 계약 견적', () => {
    expect(customerView([i1, i2], [ap('i1', 20), ap('i2', 40, 'rejected')])).toMatchObject({ shown: { id: 'i1' }, contract: { id: 'i1' }, pending: null, rejected: { id: 'i2' } });
  });
  it('변경 견적에 동의하면 그것이 새 계약', () => {
    expect(customerView([i1, i2], [ap('i1', 20), ap('i2', 40)])).toMatchObject({ shown: { id: 'i2' }, contract: { id: 'i2' }, pending: null, rejected: null });
  });
});
