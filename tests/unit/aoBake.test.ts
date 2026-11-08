// 사인물 AO 굽기 (2026-11-09 사용자: "디자인 파일이 들어오면 occ를 구워서 계속 사용 가능하지 않을까?" → "1번 ProgressiveLightMap으로 진행해")
import { describe, expect, it } from 'vitest';
import { aoKey, aoToGray, skyDirs } from '../../src/lib/core/aoBake';

describe('skyDirs — 하늘 반구 방향 (코사인 가중, 정해진 순서)', () => {
  const d = skyDirs(256);
  it('개수·단위 길이·앞쪽(+z) 반구', () => {
    expect(d).toHaveLength(256);
    for (const [x, y, z] of d) { expect(Math.hypot(x, y, z)).toBeCloseTo(1, 6); expect(z).toBeGreaterThan(0); }
  });
  it('코사인 가중이면 z 평균 ≈ 2/3', () => expect(d.reduce((s, v) => s + v[2], 0) / d.length).toBeCloseTo(2 / 3, 1));
  it('늘 같은 방향 (구운 결과가 매번 같게)', () => expect(skyDirs(8)).toEqual(skyDirs(8)));
});

describe('aoToGray — 쌓인 빛(RGBA float) → AO 회색 (가려지지 않은 곳 = 흰색)', () => {
  it('기준 빛과 같으면 255, 절반이면 약 128, 넘쳐도 255', () => {
    const f = new Float32Array([0.6, 0.6, 0.6, 1, 0.3, 0.3, 0.3, 1, 0.9, 0.9, 0.9, 1]);
    const g = aoToGray(f, 0.6);
    expect([g[0], g[4], g[8]]).toEqual([255, 128, 255]);
    expect([g[3], g[7]]).toEqual([255, 255]);
  });
  it('기준이 0 이면 흰색', () => expect(aoToGray(new Float32Array([0, 0, 0, 1]), 0)[0]).toBe(255));
});

describe('aoKey — 사인물 3D 사양이 같으면 같은 키 (자리 x·y 는 무관)', () => {
  it('자리만 다르면 같고, 내용이 다르면 다르다', () => {
    const a = { kind: 'channel', text: '카페', widthMm: 1000, heightMm: 300, depthMm: 80, x: 0, y: 0 };
    expect(aoKey({ ...a, x: 500, y: 20 })).toBe(aoKey(a));
    expect(aoKey({ ...a, depthMm: 120 })).not.toBe(aoKey(a));
  });
});
