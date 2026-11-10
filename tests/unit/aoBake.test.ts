// 사인물 AO 굽기 (2026-11-09 사용자: "디자인 파일이 들어오면 occ를 구워서 계속 사용 가능하지 않을까?" → "1번 ProgressiveLightMap으로 진행해")
import { describe, expect, it } from 'vitest';
import { aoGeomKey, aoToGray, skyDirs } from '../../src/lib/core/aoBake';

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

// 2026-11-10 사용자: "디자인과 구성(체널과 프레임의 위치만 재질은 상관없음)이 변하지 않으면 계속 사용하게" — 키 = 도형(꼭짓점 자리)만
describe('aoGeomKey — 채널·프레임 도형(꼭짓점 자리, 1mm)이 같으면 같은 키, 재질·색은 무관', () => {
  const I = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  const box = { pos: [-500, -150, 0, 500, -150, 0, 500, 150, 0, -500, 150, 0], m: I };
  const letter = { pos: [-100, -50, 80, 100, -50, 80, 0, 50, 80], m: I };
  const k = aoGeomKey([box, letter], 'lightbox|1000x300');
  it('같은 도형이면 같은 키 (1mm 아래 흔들림도)', () => {
    expect(aoGeomKey([box, { ...letter, pos: letter.pos.map((v) => v + 0.2) }], 'lightbox|1000x300')).toBe(k);
  });
  it('글자를 옮기면(물체 자리 행렬로도) 다른 키', () => {
    expect(aoGeomKey([box, { ...letter, pos: letter.pos.map((v, i) => (i % 3 === 0 ? v + 30 : v)) }], 'lightbox|1000x300')).not.toBe(k);
    const moved = [...I]; moved[12] = 30;
    expect(aoGeomKey([box, { ...letter, m: moved }], 'lightbox|1000x300')).not.toBe(k);
  });
  it('받는 면(치수 등 덧붙인 것)이 다르면 다른 키', () => expect(aoGeomKey([box, letter], 'lightbox|1200x300')).not.toBe(k));
});
