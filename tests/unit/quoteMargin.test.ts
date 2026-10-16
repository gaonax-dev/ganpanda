// 견적 수동 입력 + 자동 전환, 원가·판매가·이익율 (2026-10-16 사용자: "사인물 견적서는 수동으로 입력되어야한다. 수동입력후 자동전환버튼 /
// 해당 목록을 선택하면 구성품들과 단가연결 해당 품목 / 단가 연결이 공급사 금액" → "원가와 판매가로 이익율이 확인되어야한다. 오너와 맴버(허가시)에게만보이게 맴버의 경우 손해인 상태를 표시")
import { describe, expect, it } from 'vitest';
import { quoteProject } from '../../src/lib/core/quote';
import { DEFAULT_PRICES } from '../../src/lib/core/pricing';
import { CALC_METHODS } from '../../src/lib/core/calcMethods';
import type { SignObject } from '../../src/lib/core/model';

const sign = (patch: Partial<SignObject> = {}): SignObject => ({ id: 'o', photoId: 'p', name: 'A', shape: 'rect', quad: [], sheetIds: [], createdAt: 0, productId: 'board-acp', widthMm: 2000, heightMm: 1000, ...patch });
const P = { ...DEFAULT_PRICES, rounding: 1 as const, minimum: 0 };

describe('수동 입력 + 자동 전환', () => {
  it('줄마다 고정 키', () => {
    const o = sign({ productId: 'body-none', parts: [{ id: 'c1', kind: 'channel', type: 'ch-front', items: [{ id: 't', kind: 'text', text: 'AB', x: 0, y: 0, h: 300 }] }] });
    expect(quoteProject([o], P).lines.map((l) => l.key)).toEqual(['o:part:c1']);
    expect(quoteProject([sign()], P).lines[0].key).toBe('o:body');
  });
  it('수동 모드: 입력 전에는 0원(입력 필요), 자동 금액은 auto 에 남는다', () => {
    const q = quoteProject([sign()], P, { mode: 'manual' });
    expect(q.lines[0]).toMatchObject({ amount: 0, auto: 2 * 85000, manual: true, needsInput: true });
    expect(q.total).toBe(Math.round(P.install * 1.1));
  });
  it('수동 금액, 자동 전환', () => {
    expect(quoteProject([sign()], P, { mode: 'manual', lineAmounts: { 'o:body': 150000 } }).lines[0]).toMatchObject({ amount: 150000, manual: true });
    expect(quoteProject([sign()], P, { mode: 'manual', lineAmounts: { 'o:body': 'auto' } }).lines[0]).toMatchObject({ amount: 170000, manual: false });
  });
  it('자동 모드(기존 프로젝트): 지금처럼 계산, 수동 금액을 넣은 줄만 수동', () => {
    expect(quoteProject([sign()], P).lines[0]).toMatchObject({ amount: 170000, manual: false });
    expect(quoteProject([sign()], P, { lineAmounts: { 'o:body': 99000 } }).lines[0]).toMatchObject({ amount: 99000, manual: true });
  });
});

describe('원가 (공급사 금액) · 이익율', () => {
  it('공급 품목 연결: 원가 = 수량 × 공급 단가', () => {
    const prices = { ...P, markup: { all: 2 }, sheets: { ...P.sheets, 'sh-cut': 15000 }, links: { 'sh-cut': 'hanwool:hanwool.solvent.백색시트' } };
    const [l] = quoteProject([sign({ productId: undefined, sheetIds: ['sh-cut'] })], prices).lines;
    expect(l.amount).toBe(30000);
    expect(l.cost).toBe(15000);
  });
  it('계산법: 원가 = 배수 전 금액', () => {
    const frame = CALC_METHODS.find((m) => m.group === '조명용 프레임 간판' && m.name === 'UV 주야모드 양면출력')!;
    const prices = { ...P, markup: { all: 1.5 }, methods: { 'board-flex': frame.id } };
    const [l] = quoteProject([sign({ productId: 'board-flex', widthMm: 1000, heightMm: 1000 })], prices).lines;
    expect(l.amount).toBe(105000);
    expect(l.cost).toBe(70000);
  });
  it('직접 입력 단가는 원가 없음', () => {
    expect(quoteProject([sign()], P).lines[0].cost).toBeUndefined();
  });
  it('합계 이익율은 원가가 있는 줄로, 판매가 < 원가면 손해', () => {
    const frame = CALC_METHODS.find((m) => m.group === '조명용 프레임 간판' && m.name === 'UV 주야모드 양면출력')!;
    const prices = { ...P, methods: { 'board-flex': frame.id } };
    const objs = [sign({ id: 'a', productId: 'board-flex', widthMm: 1000, heightMm: 1000 }), sign({ id: 'b' })];
    const q = quoteProject(objs, prices, { mode: 'manual', lineAmounts: { 'a:body': 100000, 'b:body': 50000 } });
    expect(q.margin).toEqual({ cost: 70000, sales: 100000, profit: 30000, rate: 0.3, uncosted: 1 });
    const loss = quoteProject(objs, prices, { mode: 'manual', lineAmounts: { 'a:body': 60000 } });
    expect(loss.lines[0].loss).toBe(true);
    expect(loss.margin.profit).toBe(-10000);
  });
});
