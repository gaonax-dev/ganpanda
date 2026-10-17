// 재질 객체 + 도색 객체 (2026-10-16 사용자: "재질객체에 스텐, 철, 알루미늄 여기에 도색 객체를 추가해 사용한다. 체널, 스카시, 도색이 필요한 곳에 도색 객체를 넣는다.
// 체널 전광의 경우 pc판도 선택할 수 있다. 조합 가능한 건 객체를 구성하고 추후 제공되는 자제를 공급업체별로 구성하려한다.")
import { describe, expect, it } from 'vitest';
import type { SignObject } from '../../src/lib/core/model';
import { optionGroupsFor, partOptionFields } from '../../src/lib/core/options';
import { FACE_MATERIALS, MATERIALS, PAINT_SYSTEMS, GLOSSES, materialById } from '../../src/lib/core/materials';
import { newPart } from '../../src/lib/core/parts';

const obj = (o: Partial<SignObject>): SignObject => ({ id: 'o', photoId: 'p', name: 'x', shape: 'rect', quad: [[0, 0], [1, 0], [1, 1], [0, 1]], sheetIds: [], createdAt: 0, ...o });
const keys = (o: SignObject) => optionGroupsFor(o).flatMap((g) => g.fields.map((f) => f.key));
const values = (o: SignObject, k: string) => optionGroupsFor(o).flatMap((g) => g.fields).find((f) => f.key === k)?.values?.map((v) => v.id);
const pkeys = (p: ReturnType<typeof newPart>) => partOptionFields(p).map((f) => f.key);

describe('재질·도색 목록 (공급업체 자재를 나중에 붙일 수 있게 id 로)', () => {
  it('재질: 스텐·철·알루미늄·갈바는 도색 가능, 텐션 천은 아님', () => {
    expect(MATERIALS.map((m) => m.label)).toEqual(['스텐', '철', '알루미늄', '갈바', '텐션 천']);
    expect(MATERIALS.filter((m) => m.paintable).map((m) => m.id)).toEqual(['stain', 'iron', 'alu', 'galva']);
    expect(materialById('alu')!.label).toBe('알루미늄');
    expect(FACE_MATERIALS.map((m) => m.label)).toEqual(['아크릴', 'PC판']);
    expect(PAINT_SYSTEMS).toEqual(['도색 없음', '기본색', '직접', 'PANTONE', 'RAL', 'KCC', '라이브러리']); // 기본색 = 색 이름, 직접 = 컬러 피커 hex (2026-10-17)
    expect(GLOSSES).toEqual(['유광', '반광', '무광']);
  });
});

describe('도색 객체: 색상 체계를 고르면 컬러코드·광택', () => {
  it('도색 없음이면 코드·광택이 없다', () => {
    expect(keys(obj({ productId: 'board-galva' }))).not.toContain('paintCode');
    const k = keys(obj({ productId: 'board-galva', options: { paintSystem: 'RAL' } }));
    expect(k).toEqual(expect.arrayContaining(['paintSystem', 'paintCode', 'paintGloss']));
  });
});

describe('재질 객체 (간판 프레임): 스텐·철·알루미늄이면 도색 객체가 붙는다', () => {
  it('갈바·트러스·파이프 간접의 프레임 재질', () => {
    for (const id of ['board-galva', 'board-truss', 'board-pipe']) expect(values(obj({ productId: id }), 'frameMat')).toEqual(['스텐', '철', '알루미늄', '텐션 천']);
    expect(keys(obj({ productId: 'board-truss', options: { frameMat: '철' } }))).toContain('framePaintSystem');
    expect(keys(obj({ productId: 'board-truss', options: { frameMat: '텐션 천' } }))).not.toContain('framePaintSystem');
  });
});

describe('채널: 측면 재질 객체(+ 도색), 전광·전후광은 앞면 아크릴/PC판', () => {
  it('측면 재질 + 도색', () => {
    const p = newPart('channel', 'ch-front');
    expect(partOptionFields(p).find((f) => f.key === 'chSideMat')!.values!.map((v) => v.id)).toEqual(['알루미늄', '스텐', '철', '갈바']);
    expect(pkeys(p)).toContain('bodySystem');
    p.options = { bodySystem: 'RAL' };
    expect(pkeys(p)).toEqual(expect.arrayContaining(['bodyCode', 'bodyGloss']));
  });
  it('앞면 판: 전광·전후광만 (아크릴/PC판)', () => {
    expect(partOptionFields(newPart('channel', 'ch-front')).find((f) => f.key === 'chFace')!.values!.map((v) => v.id)).toEqual(['아크릴', 'PC판']);
    expect(pkeys(newPart('channel', 'ch-both'))).toContain('chFace');
    expect(pkeys(newPart('channel', 'ch-halo'))).not.toContain('chFace');
    expect(pkeys(newPart('channel', 'ch-galva'))).not.toContain('chFace');
  });
});

describe('스카시: 도색 객체', () => {
  it('도색 체계를 고르면 코드·광택', () => {
    const p = newPart('scashi', 'ch-scashi'); p.options = { paintSystem: 'KCC' };
    expect(pkeys(p)).toEqual(expect.arrayContaining(['paintSystem', 'paintCode', 'paintGloss']));
    expect(pkeys(newPart('scashi', 'ch-scashi'))).not.toContain('paintCode');
  });
});
