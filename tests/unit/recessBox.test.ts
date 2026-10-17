// 외곽선 = 앞면: 상자는 뒤로, 글자는 앞으로 (2026-10-17 사용자: "두께를 주는 사인물의 경우 3d에서 나오는 것을 반대로 … 바탕만 반대 방향으로 익스트루드하고 채널과 스카시는 현재와 같이")
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { lightboxGeometry, recessBox } from '../../src/lib/sim/signs';

const zRange = (g: THREE.BufferGeometry) => { g.computeBoundingBox(); return [g.boundingBox!.min.z, g.boundingBox!.max.z]; };

describe('recessBox', () => {
  it('상자 앞면이 z=0(외곽선)에 오고 몸체는 -두께까지, 글자(앞면 위 z=두께)는 0에서 앞으로', () => {
    const group = new THREE.Group();
    const box = new THREE.Mesh(lightboxGeometry(3000, 600, 150));
    const letters = new THREE.Mesh(new THREE.BoxGeometry(400, 300, 80)); letters.geometry.translate(0, 0, 150 + 40); // 상자 앞면 위
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(3200, 800)); glow.position.z = 0.5; glow.userData.part = 'glow';
    group.add(box, letters, glow);
    expect(zRange(box.geometry)).toEqual([0, 150]);
    recessBox(group, 150);
    expect(zRange(box.geometry)).toEqual([-150, 0]);
    expect(zRange(letters.geometry)).toEqual([0, 80]); // 글자는 외곽선 면에서 카메라 쪽으로
    expect(zRange(glow.geometry)).toEqual([0, 0]); // 벽 번짐은 그대로
  });
  it('두께 0 이면 아무것도 안 바꾼다', () => {
    const group = new THREE.Group(); const m = new THREE.Mesh(lightboxGeometry(100, 100, 20)); group.add(m);
    recessBox(group, 0);
    expect(zRange(m.geometry)).toEqual([0, 20]);
  });
});
