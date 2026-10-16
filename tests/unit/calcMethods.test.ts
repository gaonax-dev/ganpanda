// 공급사별 계산법 (2026-10-16 사용자: "공급사별 계산법을 사용할 수 있게해줘")
// 공급 단가표의 구간·기본가·폭 표기를 읽어 계산법을 만든다: 글자 크기 구간 자당 / 폭 구간 ㎡ / 헤베 + 기본가 + 광폭 / 면적 구간
import { describe, expect, it } from 'vitest';
import { CALC_METHODS, evalArea, evalLetter, findMethod, methodsFor } from '../../src/lib/core/calcMethods';
import { DEFAULT_PRICES, mergePrices } from '../../src/lib/core/pricing';
import { applyMarkup } from '../../src/lib/core/markup';
import { quoteObject } from '../../src/lib/core/quote';
import type { SignObject } from '../../src/lib/core/model';

const m = (pred: (x: (typeof CALC_METHODS)[number]) => boolean) => { const x = CALC_METHODS.find(pred); if (!x) throw new Error('no method'); return x; };
const capLed = m((x) => x.supplier.id === 'alida' && x.group === '알미늄 캡 채널' && x.variant === 'LED조립');
const galva = m((x) => x.group === '갈바 채널');
const rubber = m((x) => x.group === '고무 스카시' && x.name.startsWith('고무 스카시 (수지') && x.variant === '고무 5T~30T');
const frame = m((x) => x.group === '조명용 프레임 간판' && x.name === 'UV 주야모드 양면출력');
const hwFlex = m((x) => x.supplier.id === 'hanwool' && x.group === '플렉스' && x.name === 'UV 단면');
const hwBanner = m((x) => x.supplier.id === 'hanwool' && x.name === '현수막');

describe('계산법 만들기', () => {
  it('종류와 단위', () => {
    expect(capLed).toMatchObject({ kind: 'letters', unit: 'charCm' });
    expect(frame).toMatchObject({ kind: 'area', unit: 'm2' });
    expect(hwFlex).toMatchObject({ kind: 'width', unit: 'm2' });
    expect(hwBanner).toMatchObject({ kind: 'areaTier', unit: 'm2' });
    expect(findMethod(capLed.id)).toBe(capLed);
    expect(capLed.label).toContain('알미늄 캡 채널');
  });
  it('폭 구간은 폭을 말하는 세부만 (레이어·용도 변형은 아님)', () => {
    const widths = CALC_METHODS.filter((x) => x.kind === 'width').map((x) => `${x.group}|${x.name}`);
    expect(widths).toContain('솔벤|솔벤현수막');
    expect(widths).not.toContain('솔벤|원웨이');
    expect(widths).not.toContain('UV투명시트 출력|투명 시트(PVC점착)');
  });
  it('직접 출력 분류의 계산법은 고를 수 없다', () => {
    const ids = methodsFor('m2', DEFAULT_PRICES).map((x) => x.group);
    expect(ids).not.toContain('UV 후렉스 출력');
    expect(ids).not.toContain('플렉스');
    expect(methodsFor('m2', { ...DEFAULT_PRICES, markup: { all: 1 } }).map((x) => x.group)).toContain('플렉스');
    expect(methodsFor('charCm', DEFAULT_PRICES)).toContain(capLed);
  });
});

describe('글자 크기 구간 자당', () => {
  it('글자 높이 이상인 가장 작은 구간', () => {
    expect(evalLetter(capLed, 800, 'A')!.item.price).toBe(61200);
    expect(evalLetter(capLed, 820, 'A')!.item.price).toBe(65600); // 85cm
    const over = evalLetter(capLed, 2500, 'A')!;
    expect(over.over).toBe(true);
    expect(over.item.option).toContain('200cm');
  });
  it('한글이 있으면 한글 단가', () => {
    expect(evalLetter(galva, 300, '간판')!.item.price).toBe(33000);
    expect(evalLetter(galva, 300, 'ABC')!.item.price).toBe(30000);
  });
  it('구간 표기(11~20cm, 10cm 이하)', () => {
    expect(evalLetter(rubber, 150, 'A')!.item.price).toBe(3500);
    expect(evalLetter(rubber, 100, 'A')!.item.price).toBe(2800);
  });
});

describe('면적 계산법', () => {
  it('헤베 + 기본가(1.8헤베) + 광폭(2,010폭 이상)', () => {
    expect(evalArea(frame, 3000, 900).raw).toBeCloseTo(2.7 * 35500);
    expect(evalArea(frame, 1000, 1000).raw).toBe(70000);
    expect(evalArea(frame, 3000, 2100).raw).toBeCloseTo(6.3 * 44000);
  });
  it('폭 구간: 짧은 변이 들어가는 가장 좁은 폭', () => {
    expect(evalArea(hwFlex, 3000, 2000).raw).toBeCloseTo(6 * 8000);
    expect(evalArea(hwFlex, 5000, 2500).raw).toBeCloseTo(12.5 * 10000);
  });
  it('면적 구간 (현수막 1회배 이하 장당 / 3회배 미만 장당 / 3회배 이상 회배당)', () => {
    expect(evalArea(hwBanner, 900, 1000).raw).toBe(3000);
    expect(evalArea(hwBanner, 2000, 1000).raw).toBe(6000);
    expect(evalArea(hwBanner, 4000, 1000).raw).toBe(8000);
  });
});

describe('저장과 견적', () => {
  it('저장값: 없는 계산법은 버림', () => {
    expect(mergePrices({ methods: { 'ch-front': capLed.id, 'board-flex': 'nope', x: capLed.id } }).methods).toEqual({ 'ch-front': capLed.id });
  });
  it('채널 구성 요소: 계산법 × 배수, 공급업체 꼬리표', () => {
    const prices = { ...DEFAULT_PRICES, rounding: 1 as const, markup: { all: 2 }, methods: { 'ch-front': capLed.id } };
    const o: SignObject = { id: 'o', photoId: 'p', name: 'A', shape: 'rect', quad: [], sheetIds: [], createdAt: 0, productId: 'body-none', widthMm: 3000, heightMm: 600,
      parts: [{ id: 'c', kind: 'channel', type: 'ch-front', items: [{ id: 't', kind: 'text', text: '바로바로', x: 0, y: 0, h: 600 }] }] };
    const [l] = quoteObject(o, prices);
    expect(l.amount).toBe(4 * 37400 * 2);
    expect(l.supplier).toBe('알리다');
    expect(l.detail).toContain('60cm');
  });
  it('몸통 ㎡: 계산법(기본가)', () => {
    const prices = { ...DEFAULT_PRICES, methods: { 'board-flex': frame.id } };
    const o: SignObject = { id: 'o', photoId: 'p', name: 'A', shape: 'rect', quad: [], sheetIds: [], createdAt: 0, productId: 'board-flex', widthMm: 1000, heightMm: 1000 };
    const [l] = quoteObject(o, prices);
    expect(l.amount).toBe(70000);
    expect(l.detail).toContain('기본');
    expect(l.supplier).toBe('알리다');
  });
  it('배수를 곱한 단가로 설명한다 (공급가를 드러내지 않음)', () => {
    const prices = { ...DEFAULT_PRICES, markup: { all: 2 }, methods: { 'board-flex': frame.id } };
    const o: SignObject = { id: 'o', photoId: 'p', name: 'A', shape: 'rect', quad: [], sheetIds: [], createdAt: 0, productId: 'board-flex', widthMm: 1000, heightMm: 1000 };
    const [l] = quoteObject(o, prices);
    expect(l.amount).toBe(140000);
    expect(l.detail).toContain('140,000원');
    expect(l.detail).not.toContain('70,000');
  });
  it('분류를 직접 출력으로 바꾸면 그 계산법은 풀린다', () => {
    const p = { ...DEFAULT_PRICES, markup: { all: 1 }, methods: { 'board-flex': frame.id, 'ch-front': capLed.id } };
    expect(applyMarkup(p, { all: 1, direct: ['조명용 프레임 간판'] }).methods).toEqual({ 'ch-front': capLed.id });
  });
});
