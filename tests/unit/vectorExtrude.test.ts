// 일러스트 입체 레이어(SVG 벡터) → 채널·스카시 입체 (2026-11-05 "후렉스(인쇄) 위에 체널(입체), 스카시(입체+ 시트 또는 도색)의 구성이라면 일러스트 레이어를 생성하고 이걸 내보내서 자동으로 간판다에서 보여질 수 있게")
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { SignObject, SignPart } from '../../src/lib/core/model';
import { renderSpecOf } from '../../src/lib/core/render';
import { channelGeometry } from '../../src/lib/sim/signs';
import { channel, font } from './fixtures';

const vec = { id: 'v', kind: 'image' as const, image: { assetId: 'svg1' }, vector: true, x: 0, y: 0, w: 3000, h: 600 };
const obj = (p: SignPart): SignObject => ({ id: 'o', photoId: 'p', name: 'x', shape: 'rect', quad: [[0, 0], [1, 0], [1, 1], [0, 1]], sheetIds: [], createdAt: 0, productId: 'board-galva', widthMm: 3000, heightMm: 600, parts: [p] });
const place = { cx: 1500, cy: 300, w: 3000, h: 600 };

describe('벡터 그림 객체', () => {
  it('밀어내는 구성 요소(채널·스카시)의 벡터 그림 = 입체(letterItems, vectorId) — 깊이는 재료 층, 시트의 벡터 그림은 평면(faceItems)', () => {
    const chSpec = renderSpecOf(obj({ id: 'c', kind: 'channel', type: 'ch-front', items: [vec] }), place)!;
    expect(chSpec.letterItems).toEqual([expect.objectContaining({ partId: 'c', vectorId: 'v', depthMm: expect.any(Number) })]);
    expect(chSpec.faceItems ?? []).toEqual([]);
    const scSpec = renderSpecOf(obj({ id: 's', kind: 'scashi', type: 'sc-acrylic', items: [vec] }), place)!;
    expect(scSpec.letterItems?.[0]).toMatchObject({ vectorId: 'v' });
    const shSpec = renderSpecOf(obj({ id: 'h', kind: 'sheet', type: 'sh-print', on: 'frame', items: [vec] }), place)!;
    expect(shSpec.letterItems ?? []).toEqual([]);
    expect(shSpec.faceItems).toEqual([expect.objectContaining({ id: 'v', kind: 'image' })]);
  });
  it('channelGeometry: 벡터 윤곽(mm, 가운데 원점)을 깊이만큼 밀어내고, 배율(vectorScale)만 곱한다 — 글꼴 맞춤 없음', () => {
    const sq = new THREE.Shape([new THREE.Vector2(-500, -100), new THREE.Vector2(500, -100), new THREE.Vector2(500, 100), new THREE.Vector2(-500, 100)]);
    const { geometry, measured } = channelGeometry({ ...channel({ heightMm: 600, depthMm: 40 }), vectorShapes: [sq], vectorScale: [2, 1] }, font);
    geometry.computeBoundingBox();
    const b = geometry.boundingBox!;
    expect(b.max.x - b.min.x).toBeCloseTo(2000, 3);
    expect(b.max.y - b.min.y).toBeCloseTo(200, 3);
    expect(b.max.z - b.min.z).toBeCloseTo(40, 3);
    expect((b.max.x + b.min.x) / 2).toBeCloseTo(0, 3); // 자리는 그대로 (가운데 맞추지 않음)
    expect(measured.widthMm).toBeCloseTo(2000, 3);
  });
});
