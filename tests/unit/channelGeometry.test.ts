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

import { channelGeometry as cg2 } from '../../src/lib/sim/signs';
describe('글자 윤곽이 없는 문구 (이모지·공백만)', () => {
  it('폰트에 없는 글자만 있으면 예외 대신 "글자 없음" 오류를 던진다 (렌더러가 상자로 대신)', async () => {
    const { readFileSync } = await import('node:fs');
    const { fontFromBuffer } = await import('../../src/lib/core/textShapes');
    const buf = readFileSync('node_modules/pretendard/dist/public/static/Pretendard-Bold.otf');
    const font = fontFromBuffer(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer);
    const spec = { id: 'x', kind: 'channel' as const, text: '🙂', heightMm: 600, widthMm: 0, depthMm: 80, letterSpacing: 0, lighting: 'none' as const, faceColor: '#fff', sideColor: '#ccc', textColor: '#000', x: 0, y: 0 };
    expect(() => cg2(spec, font)).toThrow(/글자/);
    expect(() => cg2({ ...spec, text: '   ' }, font)).toThrow(/글자/);
    expect(cg2({ ...spec, text: '간판다' }, font).measured.widthMm).toBeGreaterThan(0);
  });
});
