// 간판 상단 조명 자동 모델링 (2026-10-16 사용자: "간판에 상단에 돌출 조명, 트러스트바형식의 간접조명, 트러스트 타공조명 등을 자동 모델링 할 수 있나?" → "진행해줘")
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { SignObject } from '../../src/lib/core/model';
import { optionGroupsFor } from '../../src/lib/core/options';
import { topLightFrom, topLightOf } from '../../src/lib/core/topLight';
import { componentOf } from '../../src/lib/core/components';
import { commitParts, describeParts, lightOf, newPart, partsOf } from '../../src/lib/core/parts';
import { describeOptions, partOptionFields } from '../../src/lib/core/options';
import { DEFAULT_PRICES } from '../../src/lib/core/pricing';
import { quoteObject } from '../../src/lib/core/quote';
import { renderSpecOf } from '../../src/lib/core/render';
import { productsOf } from '../../src/lib/core/catalog';
import { topLightMeshes } from '../../src/lib/sim/signs';

const obj = (o: Partial<SignObject>): SignObject => ({ id: 'o', photoId: 'p', name: 'x', shape: 'rect', quad: [[0, 0], [1, 0], [1, 1], [0, 1]], sheetIds: [], createdAt: 0, ...o });
const keys = (o: SignObject) => optionGroupsFor(o).flatMap((g) => g.fields.map((f) => f.key));

describe('상단 조명 = 구성 요소 (2026-10-19 사용자: "상단 조명부터 컴포넌트로 옮겨줘")', () => {
  it('세부 종류 = 돌출 투광등/트러스 바 간접조명/트러스 타공 조명, 옵션 = 개수·팔 길이(투광등)·빛 색, 글자·그림은 없음', () => {
    const c = componentOf('light');
    expect(c.types.map((t) => t.label)).toEqual(['돌출 투광등', '트러스 바 간접조명', '트러스 타공 조명']);
    expect(c.takesItems).toBe(false);
    const arm = newPart('light', 'tl-arm');
    expect(partOptionFields(arm).map((f) => f.key)).toEqual(['topSide', 'topCount', 'topArm', 'topColor', 'fixtureMode']);
    expect(partOptionFields(arm).find((f) => f.key === 'topArm')!.values!.map((v) => v.id)).toEqual(['300mm', '450mm', '600mm']);
    expect(partOptionFields(newPart('light', 'tl-bar')).map((f) => f.key)).toEqual(['topSide', 'topColor', 'fixtureMode']);
    // 2026-10-19 "조명 수량 / 트러스트 타공 방향 정면·간판간접 / 하단·좌·우 / 도색 간판과 같은 색·컬러선택"
    const perf = newPart('light', 'tl-perf');
    expect(partOptionFields(perf).map((f) => f.key)).toEqual(['topSide', 'topCount', 'topAim', 'topColor', 'fixtureMode']);
    expect(partOptionFields(perf).find((f) => f.key === 'topSide')!.values!.map((v) => v.id)).toEqual(['상단', '하단', '좌', '우']);
    expect(partOptionFields(perf).find((f) => f.key === 'topAim')!.values!.map((v) => v.id)).toEqual(['정면', '간판 쪽 (간접)']);
    perf.options = { fixtureMode: '색 지정' };
    expect(partOptionFields(perf).some((f) => f.paint?.prefix === 'fixture' && f.paint.part === 'system')).toBe(true); // 색 지정이면 기구 도색 컬러 선택
    expect(keys(obj({ productId: 'board-flex' }))).not.toContain('topLight'); // 몸통 옵션에는 없다
  });
  it('옛 몸통 옵션(topLight)은 읽을 때 상단 조명 구성 요소로, 구성 요소를 저장하면 옛 옵션은 지워진다', () => {
    const o = obj({ productId: 'board-flex', widthMm: 4800, options: { topLight: '돌출 투광등', topCount: '3', topColor: '전구색 3000K', light: 'LED' } });
    const ps = partsOf(o);
    expect(ps.at(-1)).toMatchObject({ kind: 'light', type: 'tl-arm', options: { topCount: '3', topColor: '전구색 3000K' } });
    expect(describeParts(o).at(-1)).toBe('돌출 투광등 3개');
    expect(describeOptions(o)).toContain('돌출 투광등 3개');
    const saved = commitParts(o, ps);
    expect(saved.options).toEqual({ light: 'LED' });
    expect(lightOf({ ...o, ...saved })!.count).toBe(3);
    expect(quoteObject({ ...o, ...saved }, DEFAULT_PRICES).find((l) => l.key === 'o:top')!.amount).toBe(Math.round((3 * DEFAULT_PRICES.products['tl-arm']) / 1000) * 1000); // 줄 키는 그대로 (수동 금액 유지)
  });
  it('간판이 아닌 분류(액자 등)와 조명 종류 단가는 종류 목록에 없다', () => {
    expect(keys(obj({ productId: 'frame-wood' }))).not.toContain('topLight');
    expect(productsOf('sign').map((p) => p.id).some((id) => id.startsWith('tl-'))).toBe(false);
  });
});

describe('개수·견적', () => {
  it('돌출 투광등 개수: 비우면 가로 1.2m 마다 하나(최소 1), 넣으면 그 수', () => {
    expect(topLightOf(obj({ productId: 'board-flex', widthMm: 4800, options: { topLight: '돌출 투광등' } }))!.count).toBe(4);
    expect(topLightOf(obj({ productId: 'board-flex', widthMm: 500, options: { topLight: '돌출 투광등' } }))!.count).toBe(1);
    expect(topLightOf(obj({ productId: 'board-flex', widthMm: 4800, options: { topLight: '돌출 투광등', topCount: '3' } }))!.count).toBe(3);
    expect(topLightOf(obj({ productId: 'board-flex' }))).toBeNull();
  });
  it('견적: 투광등 = 개수 × 원/개, 트러스 = 간판 가로(m) × 원/m', () => {
    const arm = quoteObject(obj({ productId: 'board-flex', widthMm: 4800, heightMm: 900, options: { topLight: '돌출 투광등' } }), DEFAULT_PRICES).find((l) => l.label.includes('돌출 투광등'))!;
    expect(arm.amount).toBe(Math.round((4 * DEFAULT_PRICES.products['tl-arm']) / 1000) * 1000);
    const bar = quoteObject(obj({ productId: 'board-flex', widthMm: 4800, heightMm: 900, options: { topLight: '트러스 바 간접조명' } }), DEFAULT_PRICES).find((l) => l.label.includes('트러스 바'))!;
    expect(bar.amount).toBe(Math.round((4.8 * DEFAULT_PRICES.products['tl-bar']) / 1000) * 1000);
    expect(quoteObject(obj({ productId: 'board-flex', options: { topLight: '트러스 타공 조명' } }), DEFAULT_PRICES).find((l) => l.label.includes('타공'))!.detail).toBe('치수 필요');
  });
  it('3D 사양에 상단 조명이 실린다 (종류·개수·팔 길이·빛 색)', () => {
    const spec = renderSpecOf(obj({ productId: 'board-flex', widthMm: 4800, heightMm: 900, options: { topLight: '돌출 투광등', topArm: '600mm', topColor: '전구색 3000K' } }), { cx: 0, cy: 0, w: 4800, h: 900 } as never)!;
    expect(spec.topLight).toMatchObject({ kind: 'arm', count: 4, armMm: 600 });
    expect(spec.topLight!.color).toMatch(/^#/);
  });
});

describe('3D 모델 (사인물 좌표: 가로 중심 0, 위 = +h/2, 앞 = +z)', () => {
  const bb = (ms: THREE.Mesh[], tag: string) => { const b = new THREE.Box3(); for (const m of ms.filter((x) => x.userData.part === tag)) { m.geometry.computeBoundingBox(); b.union(m.geometry.boundingBox!); } return b; };
  it('돌출 투광등: 등기구 N개가 간판 위·앞에, 가로로 고르게', () => {
    const { meshes } = topLightMeshes({ kind: 'arm', count: 4, armMm: 450, color: '#fff4e0' }, 4800, 900, 150);
    const heads = meshes.filter((m) => m.userData.part === 'head');
    expect(heads).toHaveLength(4);
    const xs = heads.map((m) => { m.geometry.computeBoundingBox(); const c = new THREE.Vector3(); m.geometry.boundingBox!.getCenter(c); return c; });
    expect(xs.map((c) => Math.round(c.x))).toEqual([-1800, -600, 600, 1800]);
    for (const c of xs) { expect(c.y).toBeGreaterThan(450); expect(c.z).toBeGreaterThan(150 + 300); }
  });
  it('모든 부품은 위치·회전 없이 정점에 구워져 있다 (그린 사각형 맞춤이 정점에 적용되므로)', () => {
    for (const kind of ['arm', 'bar', 'perf'] as const) {
      for (const m of topLightMeshes({ kind, count: 3, armMm: 300, color: '#ffffff' }, 3000, 800, 100).meshes) {
        expect(m.position.length()).toBe(0); expect(m.rotation.x + m.rotation.y + m.rotation.z).toBe(0);
      }
    }
  });
  it('트러스 바: 간판 가로 전체, 위쪽 앞에. 타공은 점 조명이 120mm 마다', () => {
    const bar = topLightMeshes({ kind: 'bar', count: 0, armMm: 0, color: '#ffffff' }, 3000, 800, 100).meshes;
    const b = bb(bar, 'bar');
    expect(b.max.x - b.min.x).toBeGreaterThan(2900); expect(b.min.y).toBeGreaterThanOrEqual(400 - 1); expect(b.max.z).toBeGreaterThan(100);
    const perf = topLightMeshes({ kind: 'perf', count: 0, armMm: 0, color: '#ffffff' }, 3000, 800, 100).meshes;
    expect(perf.filter((m) => m.userData.part === 'dot').length).toBe(Math.floor(3000 / 120));
  });
  it('밤에만 빛(빛 줄기·면 번짐·점)이 보인다', () => {
    const t = topLightMeshes({ kind: 'arm', count: 2, armMm: 300, color: '#ffffff' }, 2000, 600, 100);
    const beam = t.meshes.find((m) => m.userData.part === 'beam')!;
    t.setNight(false); expect((beam.material as THREE.MeshBasicMaterial).opacity).toBe(0);
    t.setNight(true); expect((beam.material as THREE.MeshBasicMaterial).opacity).toBeGreaterThan(0);
  });
});

describe('내부 조명 "비조명"이면 3D 상자도 빛나지 않는다 (상단 조명은 주로 비조명 간판에)', () => {
  it('후렉스·돌출의 내부 조명 옵션을 따른다', () => {
    const at = { cx: 0, cy: 0, w: 4000, h: 800 } as never;
    expect(renderSpecOf(obj({ productId: 'board-flex' }), at)!.lighting).toBe('front');
    expect(renderSpecOf(obj({ productId: 'board-flex', options: { light: '비조명' } }), at)!.lighting).toBe('none');
    expect(renderSpecOf(obj({ productId: 'board-protrude', options: { light: '비조명' } }), at)!.lighting).toBe('none');
  });
});

describe('위치·수량·빛 방향·기구 색 (2026-10-19)', () => {
  it('좌·우는 간판 세로가 길이: 수량 자동·견적 m 가 세로 기준, 요약에 위치·간접', () => {
    const tl = topLightFrom('tl-perf', { topSide: '좌' }, 4800, 1200)!;
    expect(tl).toMatchObject({ side: 'left', spanMm: 1200, count: 10, aim: 'front', fixture: 'sign' });
    expect(topLightFrom('tl-perf', { topCount: '7', topAim: '간판 쪽 (간접)' }, 4800, 1200)).toMatchObject({ count: 7, aim: 'sign' });
    expect(topLightFrom('tl-arm', { fixtureMode: '색 지정', fixtureSystem: '직접', fixtureCode: '#112233' }, 4800, 900)!.fixture).toBe('#112233');
    const p = newPart('light', 'tl-bar'); p.options = { topSide: '우' };
    const line = quoteObject(obj({ productId: 'board-flex', widthMm: 4800, heightMm: 1200, parts: [p] }), DEFAULT_PRICES).find((l) => l.key === 'o:top')!;
    expect(line.detail).toContain('세로 1.20m');
    const perf = newPart('light', 'tl-perf'); perf.options = { topSide: '하단', topCount: '12', topAim: '간판 쪽 (간접)' };
    expect(componentOf('light').spec(perf)).toBe('트러스 타공 조명 12개 하단 간접');
  });
  it('3D: 하단은 간판 아래, 좌는 왼쪽(세로 길이), 간접 타공은 점이 아래를 향하고, 기구 색은 간판 프레임 색', () => {
    const center = (ms: THREE.Mesh[], tag: string) => { const b = new THREE.Box3(); for (const m of ms.filter((x) => x.userData.part === tag)) { m.geometry.computeBoundingBox(); b.union(m.geometry.boundingBox!); } return b; };
    const bottom = topLightMeshes({ kind: 'bar', count: 0, armMm: 0, color: '#fff', side: 'bottom' }, 3000, 800, 100).meshes;
    expect(center(bottom, 'bar').max.y).toBeLessThan(-400);
    const left = topLightMeshes({ kind: 'bar', count: 0, armMm: 0, color: '#fff', side: 'left' }, 3000, 800, 100).meshes;
    const lb = center(left, 'bar');
    expect(lb.max.x).toBeLessThan(-1500); expect(lb.max.y - lb.min.y).toBeGreaterThan(790); expect(lb.max.y - lb.min.y).toBeLessThan(810);
    const ind = topLightMeshes({ kind: 'perf', count: 5, armMm: 0, color: '#fff', aim: 'sign' }, 3000, 800, 100).meshes.filter((m) => m.userData.part === 'dot');
    expect(ind).toHaveLength(5);
    ind[0].geometry.computeBoundingBox(); const db = ind[0].geometry.boundingBox!;
    expect(db.max.y - db.min.y).toBeLessThan(db.max.z - db.min.z); // 아랫면에 납작하게 → 아래(간판 쪽)를 향함
    const t = topLightMeshes({ kind: 'bar', count: 0, armMm: 0, color: '#fff', fixture: 'sign' }, 3000, 800, 100, '#ff0000');
    expect(((t.meshes.find((m) => m.userData.part === 'bar')!.material) as THREE.MeshStandardMaterial).color.getHexString()).toBe('ff0000');
  });
});

