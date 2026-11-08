import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { lightboxGeometry, warpToQuad } from '../../src/lib/sim/signs';

describe('박스 간판 형상 (둥근 모서리)', () => {
  it('모서리 비율 0 → 상자 (8 꼭짓점 영역), 0.5 → 모서리가 깎여 외곽은 같고 꼭짓점이 많다', () => {
    const box = lightboxGeometry(2000, 1000, 100, 0);
    box.computeBoundingBox();
    const bb = box.boundingBox!;
    expect(bb.max.x - bb.min.x).toBeCloseTo(2000, 3); expect(bb.max.y - bb.min.y).toBeCloseTo(1000, 3); expect(bb.max.z - bb.min.z).toBeCloseTo(100, 3);
    const round = lightboxGeometry(2000, 1000, 100, 0.5);
    round.computeBoundingBox();
    const rb = round.boundingBox!;
    expect(rb.max.x - rb.min.x).toBeCloseTo(2000, 3); expect(rb.max.y - rb.min.y).toBeCloseTo(1000, 3);
    expect(round.attributes.position.count).toBeGreaterThan(box.attributes.position.count);
    // 모서리 (±1000, ±500) 근처에는 꼭짓점이 없다 (반지름 500 으로 깎임)
    const pos = round.attributes.position;
    for (let i = 0; i < pos.count; i++) expect(Math.abs(pos.getX(i)) > 990 && Math.abs(pos.getY(i)) > 490).toBe(false);
    // 앞면은 z = depth, 뒷면은 z = 0 (벽)
    expect(rb.min.z).toBeCloseTo(0, 3); expect(rb.max.z).toBeCloseTo(100, 3);
    expect(bb.min.z).toBeCloseTo(0, 3);
  });
});

describe('사인물을 그린 사각형에 맞춤 (warpToQuad)', () => {
  it('직사각형 기준 박스의 네 모서리가 지정한 사각형 꼭짓점으로 가고, z(두께)는 그대로', () => {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(lightboxGeometry(2000, 1000, 100, 0), new THREE.MeshBasicMaterial()));
    const corners: [number, number][] = [[100, 1200], [2300, 1100], [2200, 150], [0, 50]]; // TL, TR, BR, BL (사다리꼴)
    warpToQuad(g, 2000, 1000, corners, 1);
    const pos = (g.children[0] as THREE.Mesh).geometry.attributes.position as THREE.BufferAttribute;
    const near = (x: number, y: number) => { for (let i = 0; i < pos.count; i++) if (Math.abs(pos.getX(i) - x) < 1e-3 && Math.abs(pos.getY(i) - y) < 1e-3) return true; return false; };
    for (const c of corners) expect(near(c[0], c[1])).toBe(true);
    let zmin = Infinity, zmax = -Infinity;
    for (let i = 0; i < pos.count; i++) { zmin = Math.min(zmin, pos.getZ(i)); zmax = Math.max(zmax, pos.getZ(i)); }
    expect(zmin).toBeCloseTo(0, 3); expect(zmax).toBeCloseTo(100, 3);
    expect(g.position.length()).toBe(0);
  });
  it('zScale 을 주면 두께도 그 배율로 (2026-11-08 앞면을 맞춘 배율만큼 두께도)', () => {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(lightboxGeometry(2000, 1000, 100, 0), new THREE.MeshBasicMaterial()));
    warpToQuad(g, 2000, 1000, [[0, 500], [1000, 500], [1000, 0], [0, 0]], 1, 0.5);
    const pos = (g.children[0] as THREE.Mesh).geometry.attributes.position as THREE.BufferAttribute;
    let zmax = -Infinity; for (let i = 0; i < pos.count; i++) zmax = Math.max(zmax, pos.getZ(i));
    expect(zmax).toBeCloseTo(50, 3);
  });
  // 2026-11-08 사용자: "핀볼의 측면간판에 체널위치와 까치발이 떨어져있다" — 두께 배율이 정점 z 만 바꾸고 부품의 띄움 자리(position.z: 까치발 띄움·상자 앞면 위 글자)는 그대로였다
  it('zScale 은 부품의 z 자리(까치발 띄움·상자 앞면 위 글자)도 같은 배율로 — 붙어 있던 것이 떨어지지 않는다', () => {
    const g = new THREE.Group();
    const rod = new THREE.Mesh(new THREE.BoxGeometry(10, 10, 40).translate(0, 0, 20), new THREE.MeshBasicMaterial()); // 벽(0)~글자 뒤(40)
    const letter = new THREE.Mesh(new THREE.BoxGeometry(100, 100, 60).translate(0, 0, 30), new THREE.MeshBasicMaterial());
    letter.position.z = 40; // 까치발 띄움
    const sub = new THREE.Group(); sub.position.z = 100; sub.add(new THREE.Mesh(new THREE.BoxGeometry(10, 10, 10), new THREE.MeshBasicMaterial()));
    g.add(rod, letter, sub);
    warpToQuad(g, 2000, 1000, [[-1000, 500], [1000, 500], [1000, -500], [-1000, -500]], 1, 0.5);
    rod.geometry.computeBoundingBox();
    letter.geometry.computeBoundingBox();
    expect(rod.geometry.boundingBox!.max.z).toBeCloseTo(20, 3); // 까치발 끝
    expect(letter.position.z + letter.geometry.boundingBox!.min.z).toBeCloseTo(20, 3); // 글자 뒤 = 까치발 끝
    expect(sub.position.z).toBeCloseTo(50, 3);
  });
  it('scale 을 주면 먼저 줄인 뒤 맞춘다 (글자 폭 맞춤)', () => {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(lightboxGeometry(4000, 1000, 10, 0), new THREE.MeshBasicMaterial()));
    const corners: [number, number][] = [[-1000, 500], [1000, 500], [1000, -500], [-1000, -500]];
    warpToQuad(g, 2000, 1000, corners, 0.5); // 4000 폭 박스를 0.5 배 → 2000 → 사각형에 딱
    const pos = (g.children[0] as THREE.Mesh).geometry.attributes.position as THREE.BufferAttribute;
    let xmax = -Infinity; for (let i = 0; i < pos.count; i++) xmax = Math.max(xmax, pos.getX(i));
    expect(xmax).toBeCloseTo(1000, 3);
  });
});
