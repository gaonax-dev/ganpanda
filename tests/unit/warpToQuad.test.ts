import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { warpToQuad } from '../../src/lib/sim/signs';

/** 앞면(+z 면, z=depth)의 삼각형 감김 방향으로 구한 법선의 z 부호 */
function frontWinding(g: THREE.BufferGeometry, depth: number): number[] {
  const pos = g.attributes.position, idx = g.index;
  const n = idx ? idx.count : pos.count, at = (i: number) => (idx ? idx.getX(i) : i);
  const out: number[] = [];
  for (let t = 0; t < n; t += 3) {
    const [a, b, c] = [at(t), at(t + 1), at(t + 2)].map((k) => new THREE.Vector3().fromBufferAttribute(pos, k));
    if (![a, b, c].every((p) => Math.abs(p.z - depth) < 1e-6)) continue;
    out.push(Math.sign(new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).z));
  }
  return out;
}

describe('warpToQuad', () => {
  const box = () => { const g = new THREE.Group(); const geo = new THREE.BoxGeometry(200, 100, 40); geo.translate(0, 0, 20); g.add(new THREE.Mesh(geo)); return g; };
  it('바로 놓인 사각형: 앞면 감김은 +z 그대로', () => {
    const g = box();
    warpToQuad(g, 200, 100, [[0, 100], [200, 100], [200, 0], [0, 0]]);
    const w = frontWinding((g.children[0] as THREE.Mesh).geometry, 40);
    expect(w.length).toBeGreaterThan(0);
    expect(w.every((s) => s > 0)).toBe(true);
  });
  // 2026-10-15 사용자: "원근에서 x축 방향으로 리버스하면 3d가 뒤집어진다" — 벽 좌표가 거울상이면 꼭짓점이 뒤집혀 놓여
  // 삼각형 감김이 반대가 되고, 앞면 대신 안쪽 면이 그려졌다
  for (const [name, corners] of [
    ['가로 거울상(X 리버스)', [[200, 100], [0, 100], [0, 0], [200, 0]]],
    ['세로 거울상(Z 리버스)', [[0, 0], [200, 0], [200, 100], [0, 100]]],
  ] as const) {
    it(`${name}: 감김을 바로잡아 앞면이 여전히 +z 로 향한다`, () => {
      const g = box();
      warpToQuad(g, 200, 100, corners.map((p) => [...p]) as [number, number][]);
      const w = frontWinding((g.children[0] as THREE.Mesh).geometry, 40);
      expect(w.length).toBeGreaterThan(0);
      expect(w.every((s) => s > 0)).toBe(true);
    });
  }
});
