// 모든 분류를 조합형으로 + 중복 정리 (2026-10-16 사용자: "사인물 상세설정들을 모두 조합형으로 변경해주고 중복도 확인해줘
// 포맥스의 경우 실측에 두께가 있어 포멕스 두께가 따로표시 중복된다.")
import { describe, expect, it } from 'vitest';
import { partKindsFor, partsOf } from '../../src/lib/core/parts';
import { PRODUCT_OPTIONS, describeOptions, optionGroupsFor } from '../../src/lib/core/options';
import { thickPresetsFor } from '../../src/lib/core/catalog';
import { quoteObject } from '../../src/lib/core/quote';
import { DEFAULT_PRICES } from '../../src/lib/core/pricing';
import type { SignObject } from '../../src/lib/core/model';

const obj = (p: Partial<SignObject>): SignObject => ({ id: 'o', photoId: 'p', name: 'A', shape: 'rect', quad: [], sheetIds: [], createdAt: 0, ...p });
const keys = (o: SignObject) => optionGroupsFor(o).flatMap((g) => g.fields.map((f) => f.key));

describe('분류마다 붙일 수 있는 구성 요소', () => {
  it.each([
    ['board-flex', ['channel', 'scashi', 'sheet', 'light', 'molding', 'pole', 'led']],
    ['ch-rubber', ['scashi']],
    ['board-foamex', ['sheet', 'scashi']],
    ['banner', []],
    ['board-lightpanel', ['sheet']],
    ['board-fabric', ['sheet']],
    ['board-acrylic', ['sheet', 'scashi']],
    ['frame-plain', ['sheet']],
    ['frame-wood', []],
    ['board-awning', ['sheet']],
    ['board-mirror', ['sheet']],
    ['board-reface', []],
    ['board-ledsign', []],
  ])('%s → %j', (id, kinds) => expect(partKindsFor(obj({ productId: id }))).toEqual(kinds));
  it('시트 분류(제품 없음)는 시트', () => expect(partKindsFor(obj({ sheetIds: ['sh-cut'] }))).toEqual(['sheet']));
});

describe('옛 데이터 → 구성 요소', () => {
  it('스카시 분류는 채널이 아니라 스카시 구성 요소 (옵션·글자 그대로)', () => {
    const [p] = partsOf(obj({ productId: 'ch-rubber', text: '간판다', heightMm: 300, options: { thickness: '20T', material: '수입 금색' } }));
    expect(p).toMatchObject({ kind: 'scashi', type: 'ch-rubber', options: { thickness: '20T', material: '수입 금색' } });
    expect(p.items[0]).toMatchObject({ kind: 'text', text: '간판다', h: 300 });
  });
  it('시트 분류의 시트 → 시트 구성 요소', () => {
    expect(partsOf(obj({ sheetIds: ['sh-cut', 'sh-print'] })).map((p) => [p.kind, p.type])).toEqual([['sheet', 'sh-cut'], ['sheet', 'sh-print']]);
  });
  it('포맥스 UV 시트 부착 → UV 출력 시트, 복합판 마감·프레임 액자 출력 → 시트', () => {
    expect(partsOf(obj({ productId: 'board-foamex', options: { uvSheet: true } })).map((p) => p.type)).toEqual(['sh-print']);
    expect(partsOf(obj({ productId: 'board-acp', options: { finish: '시트 컷팅' } })).map((p) => p.type)).toEqual(['sh-cut']);
    expect(partsOf(obj({ productId: 'board-acp', options: { finish: '도색' } }))).toEqual([]);
    expect(partsOf(obj({ productId: 'frame-plain', options: { print: '실사 출력' } })).map((p) => p.type)).toEqual(['sh-print']);
  });
  it('시트 분류 견적은 한 번만 (구성 요소로)', () => {
    const lines = quoteObject(obj({ sheetIds: ['sh-cut'], widthMm: 1000, heightMm: 1000 }), DEFAULT_PRICES);
    expect(lines).toHaveLength(1);
  });
});

describe('중복 정리', () => {
  it('두께: 치수의 두께와 겹치는 판 두께 선택은 없다 (포맥스·아크릴), 대신 치수 두께 빠른 선택', () => {
    expect(PRODUCT_OPTIONS['board-foamex'].map((f) => f.key)).not.toContain('thick');
    expect(PRODUCT_OPTIONS['board-acrylic'].map((f) => f.key)).not.toContain('thick');
    expect(thickPresetsFor('board-foamex')).toEqual([3, 5, 8, 10, 15, 20, 30]);
    expect(thickPresetsFor('board-flex')).toEqual([]);
  });
  it('구성 요소와 겹치는 옵션은 없다: 포맥스 UV 시트 부착, 복합판 마감, 프레임 액자 출력', () => {
    expect(PRODUCT_OPTIONS['board-foamex'].map((f) => f.key)).not.toContain('uvSheet');
    expect(PRODUCT_OPTIONS['board-acp'].map((f) => f.key)).not.toContain('finish');
    expect(keys(obj({ productId: 'board-acp', parts: [] }))).toContain('paintSystem'); // 도색은 마감 선택 없이 바로
    expect(PRODUCT_OPTIONS['frame-plain'].map((f) => f.key)).not.toContain('print');
  });
  it('상단 조명과 겹치는 간접조명 선택은 없다 (갈바·파이프 간접·트러스)', () => {
    for (const id of ['board-galva', 'board-pipe']) expect(PRODUCT_OPTIONS[id].map((f) => f.key)).not.toContain('indirect');
    expect(PRODUCT_OPTIONS['board-truss'].map((f) => f.key)).not.toContain('light');
    expect(keys(obj({ productId: 'board-pipe', parts: [] }))).not.toContain('topLight'); // 상단 조명은 몸통 옵션이 아니라 구성 요소 (2026-10-19)
    expect(partKindsFor(obj({ productId: 'board-pipe' }))).toContain('light');
  });
  it('옛 값은 요약에 남는다 (두께는 치수 두께가 없을 때만)', () => {
    expect(describeOptions(obj({ productId: 'board-foamex', options: { thick: '5T' } }))).toContain('두께 5T');
    expect(describeOptions(obj({ productId: 'board-foamex', depthMm: 5, options: { thick: '5T' } }))).not.toContain('두께 5T');
    expect(describeOptions(obj({ productId: 'board-galva', options: { indirect: 'T5 LED 주백색' } }))).toContain('간접조명 T5 LED 주백색');
  });
});

describe('분류 유지·변경', () => {
  it('시트 분류: 시트가 구성 요소로 옮겨져도 시트 분류', async () => {
    const { categoryOf } = await import('../../src/lib/core/catalog');
    const parts = [{ id: 's', kind: 'sheet' as const, type: 'sh-cut', on: 'frame', items: [] }];
    expect(categoryOf(obj({ parts }))).toBe('sheet');
    expect(partKindsFor(obj({ parts }))).toEqual(['sheet']);
  });
  it('종류를 바꾸면 새 종류에 못 붙는 구성 요소는 뺀다', async () => {
    const { partsForProduct } = await import('../../src/lib/core/parts');
    const o = obj({ productId: 'board-flex', parts: [{ id: 'c', kind: 'channel', type: 'ch-front', items: [] }, { id: 's', kind: 'sheet', type: 'sh-cut', on: 'c', items: [] }] });
    expect(partsForProduct(o, 'frame-plain')!.map((p) => [p.kind, p.on])).toEqual([['sheet', 'frame']]); // 지운 채널 위 시트는 프레임 면으로
    expect(partsForProduct(o, 'banner')).toEqual([]);
    expect(partsForProduct(obj({ productId: 'board-flex' }), 'banner')).toBeUndefined(); // 저장된 구성 요소가 없으면 그대로
  });
  it('조합형이면 옛 시트 옵션 묶음은 몸통 옵션에 없다', () => {
    expect(optionGroupsFor(obj({ sheetIds: ['sh-cut'], parts: [] })).map((g) => g.title)).not.toContain('시트 옵션');
  });
});

describe('두께는 소재에 (2026-10-16 사용자: "사인물 가로세로만 표시하고 두께는 소재에 붙이는게 맞을 거 같은데")', () => {
  it('두께를 받는 종류와 이름: 판재는 "판 두께"(T), 그 밖은 "두께"(mm), 현수막·어닝·에어간판·몸통 없음·스카시는 없음', async () => {
    const { thicknessFieldOf: thicknessOf } = await import('../../src/lib/core/catalog');
    expect(thicknessOf('board-foamex')).toEqual({ label: '판 두께', unit: 'T' });
    expect(thicknessOf('board-flex')).toEqual({ label: '두께', unit: 'mm' });
    for (const id of ['banner', 'board-awning', 'board-air', 'body-none', 'ch-rubber', undefined]) expect(thicknessOf(id)).toBeNull();
  });
  it('요약: 두께는 소재 옆에', () => {
    expect(describeOptions(obj({ productId: 'board-foamex', depthMm: 5 }))[0]).toBe('5T');
    expect(describeOptions(obj({ productId: 'board-flex', depthMm: 150 }))[0]).toBe('두께 150mm');
    expect(describeOptions(obj({ productId: 'banner', depthMm: 3 }))).not.toContain('두께 3mm');
  });
});
