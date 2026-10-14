import { describe, expect, it } from 'vitest';
import type { SignObject } from '../../src/lib/core/model';
import { describeOptions, normalizeOptions, optionGroupsFor, optionValue } from '../../src/lib/core/options';

const obj = (o: Partial<SignObject>): SignObject => ({ id: 'o', photoId: 'p', name: 'x', shape: 'rect', quad: [[0, 0], [1, 0], [1, 1], [0, 1]], sheetIds: [], createdAt: 0, ...o });
const keys = (o: SignObject) => optionGroupsFor(o).flatMap((g) => g.fields.map((f) => f.key));

describe('주문 사양 옵션 스키마', () => {
  it('후렉스 간판: 단면/양면 + 내부 조명', () => {
    expect(keys(obj({ productId: 'board-flex' }))).toEqual(['sides', 'light']);
  });
  it('갈바 간판: 돌출/일체형 + 간접조명 + 도색 컬러코드(체계+코드)', () => {
    expect(keys(obj({ productId: 'board-galva' }))).toEqual(['form', 'indirect', 'paintSystem', 'paintCode']);
  });
  it('채널: 채널 종류 + LED 색 + 몸체 도색. 갈바 에폭시 채널(비조명)은 LED 색이 없다', () => {
    expect(keys(obj({ productId: 'ch-front' }))).toEqual(['chType', 'ledColor', 'bodySystem', 'bodyCode']);
    expect(keys(obj({ productId: 'ch-galva' }))).not.toContain('ledColor');
  });
  it('조건부: 복합판 마감이 도색일 때만 컬러코드', () => {
    expect(keys(obj({ productId: 'board-acp' }))).toEqual(['sides', 'finish']);
    expect(keys(obj({ productId: 'board-acp', options: { finish: '도색' } }))).toEqual(['sides', 'finish', 'paintSystem', 'paintCode']);
  });
  it('스카시: 재질별 옵션 + 공통 시공 보조 부속품', () => {
    const rubber = optionGroupsFor(obj({ productId: 'ch-rubber' }));
    expect(rubber.map((g) => g.title)).toEqual(['고무 스카시 사양', '시공 보조 부속품']);
    expect(rubber[0].fields.map((f) => f.key)).toEqual(['thickness', 'front', 'frontColor']);
    expect(rubber[1].fields.map((f) => f.key)).toEqual(['paperTemplate', 'acrylicGuide', 'frontSheetAttached']);
    expect(keys(obj({ productId: 'sc-titan' }))).toContain('finish');
    expect(keys(obj({ productId: 'ch-scashi' }))).toContain('thickness');
    expect(keys(obj({ productId: 'ch-rubber', options: { front: '없음' } }))).not.toContain('frontColor');
  });
  it('시트: 공통(보조시트·코팅) + 시트 컷팅이면 반컷팅', () => {
    expect(keys(obj({ sheetIds: ['sh-print'] }))).toEqual(['transferTape', 'coating']);
    expect(keys(obj({ sheetIds: ['sh-cut'] }))).toEqual(['transferTape', 'coating', 'halfCut']);
    expect(keys(obj({}))).toEqual([]);
  });
  it('요약 문구: 고른 값·켜진 토글·코드만', () => {
    const o = obj({ productId: 'board-galva', sheetIds: ['sh-cut'], options: { form: '돌출형', indirect: '없음', paintSystem: 'RAL', paintCode: '9005', transferTape: true, coating: '무광', halfCut: false } });
    expect(describeOptions(o)).toEqual(['돌출형', '없음', 'RAL', '도색 컬러코드 9005', '보조시트(어플리케이션 테이프) 포함', '무광']);
  });
  it('종류를 바꾸면 안 보이는 옵션은 버린다, 기본값은 첫 값/false', () => {
    const o = obj({ productId: 'board-flex', options: { sides: '양면', thickness: '30T' } });
    expect(normalizeOptions(o)).toEqual({ sides: '양면' });
    const [g] = optionGroupsFor(obj({ productId: 'board-flex' }));
    expect(optionValue(g.fields[0], {})).toBe('단면');
    expect(optionValue({ key: 'x', label: 'x', kind: 'toggle' }, {})).toBe(false);
  });
});
