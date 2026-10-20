import { describe, expect, it } from 'vitest';
import { partsOf } from '../../src/lib/core/parts';
import type { SignObject } from '../../src/lib/core/model';
import { describeOptions, partOptionFields, normalizeOptions, optionGroupsFor, optionValue } from '../../src/lib/core/options';

const obj = (o: Partial<SignObject>): SignObject => ({ id: 'o', photoId: 'p', name: 'x', shape: 'rect', quad: [[0, 0], [1, 0], [1, 1], [0, 1]], sheetIds: [], createdAt: 0, ...o });
const keys = (o: SignObject) => optionGroupsFor(o).flatMap((g) => g.fields.map((f) => f.key));

describe('주문 사양 옵션 스키마', () => {
  it('프레임(후렉스) 간판: 단면/양면 + 내부 조명 + 프레임 구조 + 출력 방식', () => {
    expect(keys(obj({ productId: 'board-flex' }))).toEqual(['sides', 'light', 'frame', 'print', 'framePaintSystem', 'frameWidth', 'channel', 'scashi', 'faceSystem'] /* 상단 조명은 구성 요소로 (2026-10-19); 배경색(faceSystem)은 맨 뒤 미리보기 묶음 (2026-10-21) */); // 채널·스카시 부착은 간판 옵션, 출력면 색·프레임 색은 컬러 피커 (2026-10-17)
  });
  it('갈바·스텐 전면 간판: 소재 + 돌출/일체형 + 도색 컬러코드(체계+코드), 간접조명은 상단 조명 (2026-10-16)', () => {
    expect(keys(obj({ productId: 'board-galva' }))).toEqual(['frameMat', 'framePaintSystem', 'form', 'perforation', 'light', 'paintSystem', 'channel', 'scashi'] /* 상단 조명은 구성 요소로 (2026-10-19) */); // 레이저 타공·내부 조명 (2026-10-17)
  });
  it('채널: 채널 종류 + LED 색 + 몸체 도색. 갈바 에폭시 채널(비조명)은 LED 색이 없다', () => {
    expect(keys(obj({ productId: 'ch-front' }))).toEqual(['chType', 'ledColor', 'bodySystem', 'chHeight']); // 옛 데이터(채널 제품이 종류)
    expect(keys(obj({ productId: 'ch-galva' }))).not.toContain('ledColor');
  });
  it('복합판: 마감 선택 없이 도색 바로 (실사·시트 마감은 시트 구성 요소, 2026-10-16)', () => {
    expect(keys(obj({ productId: 'board-acp' }))).toEqual(['sides', 'paintSystem', 'channel', 'scashi'] /* 상단 조명은 구성 요소로 (2026-10-19) */);
  });
  it('스카시: 재질별 옵션은 스카시 구성 요소에(몸통과 겹치지 않게, 2026-10-16), 몸통엔 공통 시공 보조 부속품', () => {
    const rubber = optionGroupsFor(obj({ productId: 'ch-rubber' }));
    expect(rubber.map((g) => g.title)).toEqual(['시공 보조 부속품']);
    expect(rubber[0].fields.map((f) => f.key)).toEqual(['paperTemplate', 'acrylicGuide', 'frontSheetAttached']);
    const partKeys = (id: string) => partOptionFields(partsOf(obj({ productId: id }))[0]).map((f) => f.key);
    // 두께·면판은 재료 층(core/stack.ts, 2026-10-21) — 옵션엔 도색(맨 위 층 앞면)·티타늄 마감·아크릴 종류만
    expect(partKeys('ch-rubber')).toEqual(['paintSystem']);
    expect(partKeys('sc-titan')).toContain('finish');
    expect(partKeys('ch-scashi')).toEqual(expect.arrayContaining(['material', 'script', 'paintSystem']));
    expect(partKeys('ch-scashi')).not.toContain('thickness');
    expect(describeOptions(obj({ productId: 'ch-rubber', options: { thickness: '30T' } })).join(' ')).toContain('고무 30T'); // 옛 값은 구성 요소(재료 층)로 요약
  });
  it('시트: 코팅 + 종류별 + 컷팅(컷팅·컷 방식·완컷이면 보조시트) — 2026-10-16 컷팅은 옵션', () => {
    expect(keys(obj({ sheetIds: ['sh-print'] }))).toEqual(['coating', 'base', 'ink', 'cut', 'cutMode', 'transferTape']);
    expect(keys(obj({ sheetIds: ['sh-cut'] }))).toEqual(['coating', 'sheetMat', 'sheetSystem', 'cut', 'cutMode', 'transferTape']); // 시트 색 (2026-10-17)
    expect(keys(obj({}))).toEqual([]);
  });
  it('요약 문구: 고른 값·켜진 토글·코드만', () => {
    const o = obj({ productId: 'board-galva', sheetIds: ['sh-cut'], options: { form: '돌출형', indirect: '없음', paintSystem: 'RAL', paintCode: '9005', transferTape: true, coating: '무광', halfCut: false } });
    expect(describeOptions(o)).toEqual(['돌출형', 'RAL', '도색 컬러코드 9005', '무광', '보조시트 (어플리케이션 테이프)']); // 옛 간접조명 '없음'은 요약에 안 나옴
  });
  it('종류를 바꾸면 안 보이는 옵션은 버린다, 기본값은 첫 값/false', () => {
    const o = obj({ productId: 'board-flex', options: { sides: '양면', thickness: '30T' } });
    expect(normalizeOptions(o)).toEqual({ sides: '양면' });
    const [g] = optionGroupsFor(obj({ productId: 'board-flex' }));
    expect(optionValue(g.fields[0], {})).toBe('단면');
    expect(optionValue({ key: 'x', label: 'x', kind: 'toggle' }, {})).toBe(false);
  });
});

describe('돌출 간판 (2026-10-15 사용자: "간판에 돌출간판이 없다")', async () => {
  const { CATALOG, productById, groupOfProduct } = await import('../../src/lib/core/catalog');
  const { DEFAULT_PRICES } = await import('../../src/lib/core/pricing');
  const { quoteObject } = await import('../../src/lib/core/quote');
  it('카탈로그에 간판 분류로 있고(㎡ 단가), 기본 단가표에도 있다', () => {
    const p = productById('board-protrude')!;
    expect(p).toBeTruthy();
    expect(p.name).toBe('돌출 간판');
    expect(p.unit).toBe('m2');
    expect(groupOfProduct('board-protrude')).toBe('sign');
    expect(CATALOG.findIndex((x) => x.id === 'board-protrude')).toBeLessThan(CATALOG.findIndex((x) => x.id === 'ch-front')); // 보드 간판 묶음 안
    expect(DEFAULT_PRICES.products['board-protrude']).toBeGreaterThan(0);
  });
  it('옵션: 면(양면 기본) · 몸체(갈바 도색/후렉스/아크릴) · 내부 조명 · 갈바 도색일 때만 컬러코드 · 브라켓', () => {
    const o = obj({ productId: 'board-protrude' });
    expect(keys(o)).toEqual(['sides', 'shape', 'body', 'light', 'paintSystem', 'bracket', 'channel', 'scashi'] /* 상단 조명은 구성 요소로 (2026-10-19) */); // 모양(사각/원형)은 2026-10-15 한울 조합형
    const [g] = optionGroupsFor(o);
    expect(g.fields.find((f) => f.key === 'sides')!.values![0].id).toBe('양면');
    expect(keys(obj({ productId: 'board-protrude', options: { body: '후렉스' } }))).not.toContain('paintCode');
  });
  it('견적: 양면 기준 ㎡ 단가로 계산된다', () => {
    const o = obj({ productId: 'board-protrude', widthMm: 600, heightMm: 900 });
    const lines = quoteObject(o, DEFAULT_PRICES);
    expect(lines[0].amount).toBe(Math.round(0.54 * DEFAULT_PRICES.products['board-protrude'] / 1000) * 1000);
  });
});

describe('간판 천갈이 (2026-10-15 사용자: "간판 천갈이가 따로 있다")', async () => {
  const { CATALOG, productById, groupOfProduct, productsOf } = await import('../../src/lib/core/catalog');
  const { DEFAULT_PRICES } = await import('../../src/lib/core/pricing');
  const { quoteObject } = await import('../../src/lib/core/quote');
  const { renderSpecOf } = await import('../../src/lib/core/render');
  it('간판 분류에 있고(㎡ 단가), 기본 단가표에도 있다 (순서는 2026-10-15 분류 재정리)', () => {
    const p = productById('board-reface')!;
    expect(p).toBeTruthy();
    expect(p.name).toBe('간판 천갈이');
    expect(p.unit).toBe('m2');
    expect(groupOfProduct('board-reface')).toBe('sign');
    const ids = productsOf('sign').map((x) => x.id);
    expect(ids).toContain('board-reface');
    expect(CATALOG.findIndex((x) => x.id === 'board-reface')).toBeLessThan(CATALOG.findIndex((x) => x.id === 'ch-front'));
    expect(DEFAULT_PRICES.products['board-reface']).toBeGreaterThan(0);
  });
  it('옵션: 면 · 원단 · 기존 원단 철거 · 내부 LED 교체', () => {
    const o = obj({ productId: 'board-reface' });
    expect(keys(o)).toEqual(['sides', 'fabric', 'removeOld', 'ledReplace', 'framePaintSystem', 'frameWidth', 'faceSystem']); // 기존 프레임 색 (2026-10-17) + 배경색은 맨 뒤 미리보기 묶음 (2026-10-21)
    const [g] = optionGroupsFor(o);
    expect(g.fields.find((f) => f.key === 'fabric')!.values!.map((v) => v.id)).toEqual(['일반 후렉스', '고투과 후렉스(LED용)', '메쉬 후렉스']);
  });
  it('견적: ㎡ 단가로 계산된다', () => {
    const o = obj({ productId: 'board-reface', widthMm: 5000, heightMm: 900 });
    const lines = quoteObject(o, DEFAULT_PRICES);
    expect(lines[0].amount).toBe(Math.round(4.5 * DEFAULT_PRICES.products['board-reface'] / 1000) * 1000);
  });
  it('3D: 후렉스 간판처럼 전광 상자로 보인다', () => {
    const spec = renderSpecOf(obj({ productId: 'board-reface' }), { cx: 0, cy: 0, w: 5000, h: 900 } as never)!;
    expect(spec.kind).toBe('lightbox');
    expect(spec.lighting).toBe('front');
  });
});

describe('간판 천갈이는 채널 옵션이 없다 (원단만 교체)', async () => {
  const { signParts } = await import('../../src/lib/core/catalog');
  const { DEFAULT_PRICES } = await import('../../src/lib/core/pricing');
  const { quoteObject } = await import('../../src/lib/core/quote');
  it('채널 값이 남아 있어도(다른 몸통에서 바꿈) 채널로 읽지 않고 견적에도 안 넣는다', () => {
    const o = obj({ productId: 'board-reface', widthMm: 5000, heightMm: 900, options: { channel: '전광 채널' }, text: '바로바로' });
    expect(signParts(o).channelId).toBeNull();
    expect(quoteObject(o, DEFAULT_PRICES)).toHaveLength(1);
  });
});
