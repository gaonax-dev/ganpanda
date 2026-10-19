// 부속 구성 요소 (2026-10-19 "컴포넌트 추가"): 몰딩·지주·LED 모듈 — 옵션·견적·요약·3D
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { SignObject } from '../../src/lib/core/model';
import { componentOf } from '../../src/lib/core/components';
import { describeParts, newPart, partKindsFor } from '../../src/lib/core/parts';
import { partOptionFields } from '../../src/lib/core/options';
import { quoteObject } from '../../src/lib/core/quote';
import { DEFAULT_PRICES } from '../../src/lib/core/pricing';
import { renderSpecOf } from '../../src/lib/core/render';
import { productsOf } from '../../src/lib/core/catalog';
import { accessoryMeshes } from '../../src/lib/sim/signs';

const obj = (o: Partial<SignObject>): SignObject => ({ id: 'o', photoId: 'p', name: 'A', shape: 'rect', quad: [[0, 0], [1, 0], [1, 1], [0, 1]], sheetIds: [], createdAt: 0, ...o });
const P = DEFAULT_PRICES;
const r = (n: number) => Math.round(n / 1000) * 1000;

describe('부속 구성 요소', () => {
  it('간판 분류에 몰딩·지주·LED 모듈을 붙일 수 있고, 종류 목록에는 안 나온다, 객체는 없다', () => {
    expect(partKindsFor(obj({ productId: 'board-galva' }))).toEqual(expect.arrayContaining(['molding', 'pole', 'led']));
    expect(partKindsFor(obj({ productId: 'frame-wood' }))).not.toContain('molding');
    expect(productsOf('sign').some((p) => /^(md|pl|led)-/.test(p.id))).toBe(false);
    for (const k of ['molding', 'pole', 'led']) expect(componentOf(k).takesItems).toBe(false);
  });
  it('옵션: 몰딩 = 두르는 곳·폭·색(색 지정이면 도색), 지주 = 수·높이·굵기·색, LED = 수량·색', () => {
    const m = newPart('molding'); expect(partOptionFields(m).map((f) => f.key)).toEqual(['moldEdges', 'moldWidth', 'moldColorMode']);
    m.options = { moldColorMode: '색 지정' }; expect(partOptionFields(m).some((f) => f.paint?.prefix === 'mold')).toBe(true);
    expect(partOptionFields(newPart('pole')).map((f) => f.key)).toEqual(['poleCount', 'poleHeight', 'poleSize', 'poleColorMode']);
    expect(partOptionFields(newPart('led')).map((f) => f.key)).toEqual(['moduleCount', 'moduleColor']);
  });
  it('견적: 몰딩 = 두르는 길이 m, 지주 = 수 × (높이 + 간판 세로) m, LED = 개수(비우면 ㎡ × 70)', () => {
    const m = newPart('molding', 'md-stain'); m.options = { moldEdges: '상하' };
    const p = newPart('pole', 'pl-galva'); p.options = { poleCount: '2', poleHeight: '2500' };
    const l = newPart('led');
    const lines = quoteObject(obj({ productId: 'board-galva', widthMm: 3000, heightMm: 1000, parts: [m, p, l] }), P);
    expect(lines.find((x) => x.label.includes('스텐 몰딩'))).toMatchObject({ detail: `상하 6.00m × ${P.products['md-stain'].toLocaleString('ko-KR')}원/m`, amount: r(6 * P.products['md-stain']) });
    expect(lines.find((x) => x.label.includes('갈바 통 지주'))!.amount).toBe(r(2 * 3.5 * P.products['pl-galva']));
    expect(lines.find((x) => x.label.includes('LED 모듈'))!.amount).toBe(r(210 * P.products['led-3']));
    expect(quoteObject(obj({ productId: 'board-galva', parts: [newPart('led')] }), P).find((x) => x.label.includes('LED'))!.detail).toBe('치수 또는 모듈 수량 필요');
    expect(describeParts(obj({ productId: 'board-galva', parts: [m, p] }))).toEqual(['스텐 몰딩 상하', '갈바 통 지주 2개']);
  });
  it('3D: LED 모듈이 있으면 상자가 빛나고, 몰딩·지주는 부속으로 실린다 (그린 자리 축척)', () => {
    const at = { cx: 0, cy: 0, w: 1500, h: 500 } as never; // 절반 축척
    const unlit = obj({ productId: 'board-galva', widthMm: 3000, heightMm: 1000, parts: [] });
    expect(renderSpecOf(unlit, at)!.lighting).toBe('none');
    const p = newPart('pole'); p.options = { poleHeight: '2000' };
    const spec = renderSpecOf({ ...unlit, parts: [newPart('led'), newPart('molding'), p] }, at)!;
    expect(spec.lighting).toBe('front');
    expect(spec.accessories).toEqual([expect.objectContaining({ kind: 'molding', widthMm: 15 }), expect.objectContaining({ kind: 'pole', count: 2, heightMm: 1000, sizeMm: 50 })]);
  });
  it('3D 모델: 지주는 간판 아래로 높이만큼, 몰딩 상하는 위·아래 띠 둘', () => {
    const { meshes } = accessoryMeshes([{ kind: 'pole', count: 2, heightMm: 2000, sizeMm: 100, color: '#888' }, { kind: 'molding', edges: 'tb', widthMm: 30, color: '#ccc' }], 3000, 1000, 100);
    const poles = meshes.filter((m) => m.userData.part === 'pole');
    expect(poles).toHaveLength(2);
    const b = new THREE.Box3(); for (const m of poles) { m.geometry.computeBoundingBox(); b.union(m.geometry.boundingBox!); }
    expect(b.min.y).toBeCloseTo(-500 - 2000, 0); expect(b.max.y).toBeCloseTo(500, 0);
    expect(meshes.filter((m) => m.userData.part === 'molding')).toHaveLength(2);
  });
});
