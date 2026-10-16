// 조합형 사인물: 간판 프레임 + 구성 요소(채널·스카시·시트) + 내용 객체(글자·그림) (2026-10-16 사용자: "조합형으로 구성할 수 있을까 사인물 간판프레임+체널,스카시,시트…",
// 답 "1 뭐든 붙일 수 있다 2. 둘다 3. 공유 4. 비율유지 5.1~2 단계 진행")
import { describe, expect, it } from 'vitest';
import type { SignObject } from '../../src/lib/core/model';
import { describeParts, newItem, newPart, partsOf } from '../../src/lib/core/parts';
import { optionGroupsFor, partOptionFields } from '../../src/lib/core/options';
import { DEFAULT_PRICES } from '../../src/lib/core/pricing';
import { quoteObject } from '../../src/lib/core/quote';
import { renderSpecOf } from '../../src/lib/core/render';
import { signParts } from '../../src/lib/core/catalog';

const obj = (o: Partial<SignObject>): SignObject => ({ id: 'o', photoId: 'p', name: 'A', shape: 'rect', quad: [[0, 0], [1, 0], [1, 1], [0, 1]], sheetIds: [], createdAt: 0, ...o });
const strip = (ps: ReturnType<typeof partsOf>) => ps.map(({ id: _i, items, ...p }) => ({ ...p, items: items.map(({ id: _j, ...it }) => it) }));
const P = DEFAULT_PRICES;

describe('기존 데이터 → 구성 요소 (읽을 때 변환)', () => {
  it('채널 옵션 + 문구 → 채널 구성 요소 + 글자 1개 (채널 세부 옵션·글자 높이·글자수 지정 포함)', () => {
    const o = obj({ productId: 'board-galva', text: '간판다', charCount: 5, options: { channel: '전광 채널', chType: '오싸이', chHeight: '400', paintSystem: 'RAL' } });
    expect(strip(partsOf(o))).toEqual([{ kind: 'channel', type: 'ch-front', options: { chType: '오싸이' }, items: [{ kind: 'text', text: '간판다', count: 5, x: 0, y: 0, h: 400 }] }]);
  });
  it('스카시 부착 → 스카시 구성 요소 (옵션 이름은 스카시 것으로), 시트 → 시트 구성 요소', () => {
    const o = obj({ productId: 'board-flex', heightMm: 900, text: '카페', sheetIds: ['sh-print'], options: { scashi: '고무 스카시', scThick: '20T', scMaterial: '수입 금색', base: '회색' } });
    expect(strip(partsOf(o))).toEqual([
      { kind: 'scashi', type: 'ch-rubber', options: { thickness: '20T', material: '수입 금색' }, items: [{ kind: 'text', text: '카페', x: 0, y: 0, h: 900 }] },
      { kind: 'sheet', type: 'sh-print', on: 'frame', options: { base: '회색' }, items: [] },
    ]);
  });
  it('옛 채널 제품(몸통 없음 + 채널) 도 채널 구성 요소', () => {
    expect(partsOf(obj({ productId: 'ch-halo', text: 'AB', heightMm: 300 }))[0]).toMatchObject({ kind: 'channel', type: 'ch-halo' });
  });
  it('구성 요소가 없는 종류(나무틀 패브릭 액자)는 없음, 시트 분류는 시트 구성 요소 (2026-10-16 모든 분류 조합형)', () => {
    expect(partsOf(obj({ productId: 'frame-wood', sheetIds: ['sh-print'] }))).toEqual([]);
    expect(partsOf(obj({ sheetIds: ['sh-cut'] })).map((p) => p.type)).toEqual(['sh-cut']);
  });
  it('저장된 구성 요소가 있으면 그것 (옛 옵션은 무시)', () => {
    const parts = [newPart('scashi', 'sc-titan')];
    expect(partsOf(obj({ productId: 'board-flex', parts, options: { channel: '전광 채널' }, text: 'x' }))).toBe(parts);
    expect(signParts(obj({ productId: 'board-flex', parts, options: { channel: '전광 채널' } }))).toMatchObject({ channelId: null, scashiId: 'sc-titan' });
  });
});

describe('견적: 구성 요소마다', () => {
  it('옛 데이터는 예전과 같은 금액·문구', () => {
    const o = obj({ productId: 'board-galva', widthMm: 3000, heightMm: 600, text: '간판다', options: { channel: '전광 채널', chHeight: '400' } });
    const ch = quoteObject(o, P).find((l) => l.label.includes('전광 채널'))!;
    expect(ch.detail).toBe(`3자 × 높이 400mm × ${P.products['ch-front'].toLocaleString('ko-KR')}원/자·cm`);
  });
  it('채널 글자 객체가 여럿이면 글자마다 (글자수 × 높이) 를 더한다', () => {
    const ch = newPart('channel', 'ch-front');
    ch.items = [{ ...newItem('text'), text: '바로바로', h: 600 }, { ...newItem('text'), text: '정육점', h: 300 }];
    const l = quoteObject(obj({ productId: 'board-galva', widthMm: 6000, heightMm: 900, parts: [ch] }), P).find((x) => x.label.includes('전광'))!;
    expect(l.amount).toBe(Math.round(((4 * 60 + 3 * 30) * P.products['ch-front']) / 1000) * 1000);
    expect(l.detail).toContain('바로바로');
  });
  it('시트: 객체가 크기를 가지면 그 면적 합, 없으면 간판 면적', () => {
    const sh = newPart('sheet', 'sh-cut');
    sh.items = [{ ...newItem('text'), text: 'OPEN', h: 200, w: 1000 }, { ...newItem('image'), h: 500, w: 500 }];
    const l = quoteObject(obj({ productId: 'board-flex', widthMm: 3000, heightMm: 900, parts: [sh] }), P).find((x) => x.label.includes('단색'))!;
    expect(l.amount).toBe(Math.round((0.45 * P.sheets['sh-cut']) / 1000) * 1000);
    const whole = quoteObject(obj({ productId: 'board-flex', widthMm: 3000, heightMm: 900, parts: [newPart('sheet', 'sh-print')] }), P).find((x) => x.label.includes('UV'))!;
    expect(whole.amount).toBe(Math.round((2.7 * P.sheets['sh-print']) / 1000) * 1000);
  });
  it('글자 객체가 없는 채널은 "문구 또는 글자수 필요"', () => {
    expect(quoteObject(obj({ productId: 'board-galva', widthMm: 3000, heightMm: 600, parts: [newPart('channel', 'ch-halo')] }), P).find((x) => x.label.includes('후광'))!.detail).toBe('문구 또는 글자수 필요');
  });
});

describe('옵션·요약·3D', () => {
  it('구성 요소가 있으면 몸통 옵션에서 채널·스카시 선택은 빠진다 (구성 요소 카드에서)', () => {
    const k = optionGroupsFor(obj({ productId: 'board-galva', parts: [] })).flatMap((g) => g.fields.map((f) => f.key));
    expect(k).not.toContain('channel'); expect(k).not.toContain('scashi'); expect(k).toContain('topLight');
  });
  it('구성 요소의 옵션: 채널은 채널 세부(방식·제작 방식…), 스카시는 두께·재질·도색, 시트는 시트 옵션', () => {
    expect(partOptionFields(newPart('channel', 'ch-front')).map((f) => f.key)).toEqual(expect.arrayContaining(['chType', 'chBuild', 'chDepth', 'ledColor']));
    expect(partOptionFields(newPart('channel', 'ch-galva')).map((f) => f.key)).not.toContain('ledColor');
    expect(partOptionFields(newPart('scashi', 'ch-scashi')).map((f) => f.key)).toEqual(expect.arrayContaining(['thickness', 'material', 'paintSystem', 'script']));
    expect(partOptionFields(newPart('sheet', 'sh-print')).map((f) => f.key)).toEqual(expect.arrayContaining(['base', 'ink', 'coating']));
  });
  it('요약: 구성 요소마다 종류 + 글자', () => {
    const ch = newPart('channel', 'ch-front'); ch.items = [{ ...newItem('text'), text: '바로바로', h: 600 }];
    const sh = newPart('sheet', 'sh-cut'); sh.items = [{ ...newItem('image'), h: 300 }];
    expect(describeParts(obj({ productId: 'board-galva', parts: [ch, sh] }))).toEqual(['전광 채널 "바로바로" 600mm', '재질 시트 단색 커팅 완컷 그림 1']); // 시트는 구성내역 (2026-10-16)
  });
  it('3D: 구성 요소의 채널 글자로 입체 글자', () => {
    const ch = newPart('channel', 'ch-halo'); ch.items = [{ ...newItem('text'), text: '카페', h: 450 }];
    const spec = renderSpecOf(obj({ productId: 'board-galva', widthMm: 3000, heightMm: 900, parts: [ch] }), { cx: 0, cy: 0, w: 3000, h: 900 } as never)!;
    // 4단계(2026-10-16)부터 객체마다 자기 자리의 letterItems (하나로 이어 붙인 letters 대신)
    expect(spec.letters).toBeUndefined();
    expect(spec.letterItems).toEqual([expect.objectContaining({ text: '카페', lighting: 'halo', x: 0, y: 0 })]);
    expect(spec.letterItems![0].heightMm).toBeCloseTo(450, 0);
  });
});

describe('요약 문구에 구성 요소', async () => {
  const { describeOptions } = await import('../../src/lib/core/options');
  it('구성 요소가 저장된 사인물은 옵션 요약 뒤에 구성 요소 요약', () => {
    const ch = newPart('channel', 'ch-front'); ch.items = [{ ...newItem('text'), text: '바로바로', h: 600 }];
    expect(describeOptions(obj({ productId: 'board-galva', parts: [ch] }))).toContain('전광 채널 "바로바로" 600mm');
  });
});

describe('주문서·JSON·입체 보기에도 구성 요소 (옵션 포함)', async () => {
  const { describeOptions } = await import('../../src/lib/core/options');
  const { orderJson } = await import('../../src/lib/core/order');
  const { specFromObject } = await import('../../src/lib/core/letter3d');
  it('요약에 구성 요소의 옵션 값(고른 것만, 주문서는 기본값까지)', () => {
    const sh = newPart('sheet', 'sh-cut'); sh.options = { halfCut: true };
    const o = obj({ productId: 'board-galva', parts: [sh] });
    expect(describeOptions(o)).toEqual(expect.arrayContaining(['재질 시트 단색 커팅 반컷'])); // 옛 반컷팅 → 반컷, 구성내역 한 줄 (2026-10-16)
    expect(describeOptions(o, { defaults: true })).toEqual(expect.arrayContaining(['재질 시트 단색 커팅 반컷', '코팅 없음']));
  });
  it('주문 JSON 품목에 구성 요소 (종류·이름·옵션·글자·그림)', () => {
    const ch = newPart('channel', 'ch-front'); ch.items = [{ ...newItem('text'), text: '간판', h: 500 }];
    const signs = [obj({ productId: 'board-galva', widthMm: 3000, heightMm: 600, parts: [ch] })];
    const j = orderJson({ projectName: 'p', signs, sizeOf: () => null, sources: [], quote: { lines: [], itemsTotal: 0, install: 0, extras: [], subtotal: 0, vat: 0, total: 0 } as never, order: {} });
    expect(j.items[0].parts![0]).toMatchObject({ kind: 'channel', type: 'ch-front', label: '전광 채널', items: [{ kind: 'text', text: '간판', h: 500 }] });
    expect(j.items[0].parts![0].options.chType).toBe('캡'); // 기본값 채움
  });
  it('입체 보기(3D 글자): 구성 요소 채널의 글자', () => {
    const ch = newPart('channel', 'ch-halo'); ch.items = [{ ...newItem('text'), text: '카페', h: 450 }];
    expect(specFromObject(obj({ productId: 'body-none', parts: [ch] }))).toMatchObject({ text: '카페', heightMm: 450, lighting: 'halo' });
  });
});
