// 사양 글 개인 사전 (2026-10-18 V1)
import { describe, expect, it } from 'vitest';
import { matchRules, meaningChoices, meaningKey, validRule, type SpecRule } from '../../src/lib/core/specRules';
import { parseSpecText } from '../../src/lib/core/specText';
import type { SignObject } from '../../src/lib/core/model';

const obj = (o: Partial<SignObject>): SignObject => ({ id: 'o', photoId: 'p', name: 'A', shape: 'rect', quad: [[0, 0], [1, 0], [1, 1], [0, 1]], sheetIds: [], createdAt: 0, ...o });
const halo: SpecRule = { phrase: '뒷광', meaning: [{ kind: 'channel', id: 'ch-halo', label: '채널: 후광 채널' }] };
const sideBoth: SpecRule = { phrase: '뒷광 양면', meaning: [{ kind: 'channel', id: 'ch-both', label: '채널: 전후광 채널' }, { kind: 'channelOption', key: 'chDouble', value: 'true', label: '채널 양면' }] };

describe('내 규칙 맞추기', () => {
  it('긴 말부터, 뜻 항목에 출처 표시, 남은 글 돌려줌', () => {
    const r = matchRules('갈바 뒷광 양면 흰색', [halo, sideBoth]);
    expect(r.items.map((i) => i.kind)).toEqual(['channel', 'channelOption']);
    expect(r.items[0].label).toBe("채널: 전후광 채널 (내 사전: 뒷광 양면)");
    expect(r.rest).toBe('갈바 흰색');
  });
  it('파서에서 기본 사전보다 먼저 — 메모로 넘어가지 않는다', () => {
    const items = parseSpecText('갈바 뒷광 흰색', obj({}), [], [halo]);
    expect(items.some((i) => i.kind === 'note')).toBe(false);
    expect(items.find((i) => i.kind === 'channel')).toMatchObject({ id: 'ch-halo' });
    expect(parseSpecText('갈바 뒷광 흰색', obj({})).find((i) => i.kind === 'note')?.text).toBe('뒷광'); // 규칙 없으면 메모
  });
  it('규칙 검증: 빈 말·메모 뜻·너무 긴 말은 안 됨', () => {
    expect(validRule(halo)).toBe(true);
    expect(validRule({ phrase: ' ', meaning: halo.meaning })).toBe(false);
    expect(validRule({ phrase: 'a', meaning: [{ kind: 'note', text: 'x', label: 'x' }] })).toBe(false);
    expect(validRule({ phrase: 'a'.repeat(61), meaning: halo.meaning })).toBe(false);
  });
  it('뜻 비교 키는 라벨을 뺀다', () => {
    expect(meaningKey([{ kind: 'channel', id: 'ch-halo', label: 'A' }])).toBe(meaningKey([{ kind: 'channel', id: 'ch-halo', label: 'B' }]));
  });
  it('고를 수 있는 뜻: 종류·채널·LED·색·몸통 옵션·채널 옵션 (레지스트리에서)', () => {
    const cs = meaningChoices(obj({ productId: 'board-galva' }));
    const groups = new Set(cs.map((c) => c.group));
    expect([...groups]).toEqual(expect.arrayContaining(['종류', '채널', 'LED', '몸통 색', '채널 색', '채널 옵션']));
    expect([...groups].some((g) => g.endsWith(' 옵션') && g !== '채널 옵션')).toBe(true); // 그 종류(갈바)의 몸통 옵션
    expect(cs.find((c) => c.id === 'channel:ch-halo')!.item).toMatchObject({ kind: 'channel', id: 'ch-halo' });
    expect(cs.some((c) => c.id.startsWith('option:light:'))).toBe(true);
    expect(cs.some((c) => c.id.startsWith('channelOption:chType:'))).toBe(true);
  });
});

// V2 (2026-10-19): 전국 기본값은 내 사전 다음, 기본 사전 앞; 출처 표시
describe('전국 기본값과 출처', () => {
  const nationalBoth: SpecRule = { phrase: '뒷광', meaning: [{ kind: 'channel', id: 'ch-both', label: '채널: 전후광 채널' }] };
  it('내 사전 > 전국 > 기본 사전', () => {
    const mineFirst = parseSpecText('갈바 뒷광', obj({}), [], [halo], [nationalBoth]);
    expect(mineFirst.find((i) => i.kind === 'channel')).toMatchObject({ id: 'ch-halo', src: { tag: '내 사전', phrase: '뒷광' } });
    const national = parseSpecText('갈바 뒷광', obj({}), [], [], [nationalBoth]);
    expect(national.find((i) => i.kind === 'channel')).toMatchObject({ id: 'ch-both', src: { tag: '전국', phrase: '뒷광' } });
    expect(national.find((i) => i.kind === 'channel')!.label).toContain('(전국: 뒷광)');
    expect(national.some((i) => i.kind === 'note')).toBe(false);
  });
});
