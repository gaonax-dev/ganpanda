import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { channelGeometry } from '../../src/lib/sim/signs';
import { channel, font } from './fixtures';

const bbox = (g: THREE.BufferGeometry) => { g.computeBoundingBox(); return g.boundingBox!; };

describe('channelGeometry (채널 간판 입체 글자)', () => {
  it('글자 높이가 입력한 mm 와 일치한다', () => {
    const { geometry } = channelGeometry(channel({ heightMm: 650 }), font);
    const b = bbox(geometry);
    expect(b.max.y - b.min.y).toBeCloseTo(650, 3);
  });

  it('측정 폭이 실제 메쉬 폭과 같다 (bbox 별칭 버그 회귀 방지)', () => {
    const { geometry, measured } = channelGeometry(channel({ text: '간판다 카페', heightMm: 650 }), font);
    const b = bbox(geometry);
    expect(measured.widthMm).toBeCloseTo(b.max.x - b.min.x, 3);
    expect(measured.widthMm).toBeGreaterThan(3000); // 5자 × 650mm 높이 → 3m 이상
  });

  it('중심이 원점에 오도록 정렬된다', () => {
    const b = bbox(channelGeometry(channel(), font).geometry);
    expect((b.min.x + b.max.x) / 2).toBeCloseTo(0, 3);
    expect((b.min.y + b.max.y) / 2).toBeCloseTo(0, 3);
  });

  it('두께(z)는 스케일과 무관하게 입력한 mm', () => {
    const b = bbox(channelGeometry(channel({ depthMm: 120, heightMm: 2000 }), font).geometry);
    expect(b.max.z - b.min.z).toBeCloseTo(120, 3);
  });

  it('글자수는 공백을 제외하고 센다', () => {
    expect(channelGeometry(channel({ text: '간판 다 ' }), font).measured.charCount).toBe(3);
  });

  it('높이를 두 배로 하면 폭도 두 배', () => {
    const w1 = channelGeometry(channel({ heightMm: 300 }), font).measured.widthMm;
    const w2 = channelGeometry(channel({ heightMm: 600 }), font).measured.widthMm;
    expect(w2).toBeCloseTo(w1 * 2, 3);
  });
});
