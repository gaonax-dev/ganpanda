import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { releaseTextures } from '../../src/lib/render/release';
import { liveBuildDelay, LIVE_SETTLE_MS } from '../../src/lib/core/liveView';

// 2026-10-29 아이폰 3D 화면 이동 반복 다운: 버린 장면의 그림 캔버스(사인물마다 최대 1536px)가 가비지 수거까지 남았다
describe('장면을 버릴 때 그림 캔버스를 바로 비운다', () => {
  it('재질의 텍스처 그림이 캔버스면 크기를 0 으로', () => {
    const canvas = { width: 1536, height: 1536, getContext: () => null };
    const tex = new THREE.Texture(canvas as never);
    const mat = new THREE.MeshBasicMaterial({ map: tex });
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.PlaneGeometry(1, 1), [mat, new THREE.MeshBasicMaterial()]));
    releaseTextures(g);
    expect(canvas.width).toBe(0);
    expect(canvas.height).toBe(0);
  });
  it('캔버스가 아닌 그림(사진)은 건드리지 않는다', () => {
    const img = { width: 100, height: 50 };
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: new THREE.Texture(img as never) })));
    releaseTextures(g);
    expect(img.width).toBe(100);
  });
});

describe('휴대폰 3D 는 화면이 멈춘 뒤에 장면을 짓는다', () => {
  it('휴대폰이면 기다린다(지어 둔 장면이어도 — 2026-10-30), 데스크톱은 바로', () => {
    expect(LIVE_SETTLE_MS).toBeGreaterThanOrEqual(250);
    expect(liveBuildDelay(true, false)).toBe(LIVE_SETTLE_MS);
    expect(liveBuildDelay(true, true)).toBe(LIVE_SETTLE_MS);
    expect(liveBuildDelay(false, false)).toBe(0);
  });
});
