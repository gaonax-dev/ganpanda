// 재정렬 = 원근이 있는 카드는 면으로 펴서 (2026-11-04 사용자: "퍼스팩티브에 맞게 설정된카드는 랩핑으로 펼치기 (여기에서 퍼스팩이 없는 사인물카드는 여기 사이사이에)")
import { describe, expect, it } from 'vitest';
import { unfoldCenters } from '../../src/lib/core/arrange';

describe('unfoldCenters', () => {
  it('같은 면(벽)의 카드는 면 좌표를 사진 틀로 한 배율·한 이동으로 옮긴다 — 3D 에서 같은 높이면 같은 줄, 원근으로 기울어진 것이 펴진다', () => {
    // 벽 위 세 사인물: 높이 2000 에 가로 0·3000·6000 (mm). 사진에서는 원근으로 오른쪽이 점점 위로(기울어짐)·간격이 좁아짐
    const r = unfoldCenters([
      { id: 'a', px: [100, 500], face: { key: 'p0:y', a: 0, b: 2000 } },
      { id: 'b', px: [500, 450], face: { key: 'p0:y', a: 3000, b: 2000 } },
      { id: 'c', px: [800, 410], face: { key: 'p0:y', a: 6000, b: 2000 } },
    ]);
    const [a, b, c] = ['a', 'b', 'c'].map((k) => r.get(k)!);
    expect(a[1]).toBeCloseTo(b[1], 6); expect(b[1]).toBeCloseTo(c[1], 6); // 같은 줄
    expect(b[0] - a[0]).toBeCloseTo(c[0] - b[0], 6); // 같은 간격 (멀어도 같은 축척)
    expect(a[0]).toBeLessThan(b[0]); // 순서는 그대로 (왼쪽 → 오른쪽)
    // 무게중심은 사진 속 자리 근처 (사진 틀에 맞춘다)
    expect((a[0] + b[0] + c[0]) / 3).toBeCloseTo((100 + 500 + 800) / 3, 0);
  });
  it('높이(b)는 위가 + — 사진은 아래가 + 라 뒤집혀 맞는다', () => {
    const r = unfoldCenters([
      { id: 'lo', px: [100, 600], face: { key: 'k', a: 0, b: 0 } },
      { id: 'hi', px: [110, 200], face: { key: 'k', a: 0, b: 3000 } },
      { id: 'r', px: [600, 610], face: { key: 'k', a: 4000, b: 0 } },
    ]);
    expect(r.get('hi')![1]).toBeLessThan(r.get('lo')![1]);
    expect(r.get('lo')![1]).toBeCloseTo(r.get('r')![1], 6);
  });
  it('원근이 없는 카드(face 없음)·한 장뿐인 면은 사진 속 자리 그대로 — 펼친 카드 사이사이에', () => {
    const r = unfoldCenters([
      { id: 'n', px: [300, 300] },
      { id: 'solo', px: [700, 200], face: { key: 'p0:x:left', a: 10, b: 20 } },
      { id: 'a', px: [100, 500], face: { key: 'p0:y', a: 0, b: 0 } },
      { id: 'b', px: [500, 480], face: { key: 'p0:y', a: 3000, b: 0 } },
    ]);
    expect(r.get('n')).toEqual([300, 300]);
    expect(r.get('solo')).toEqual([700, 200]);
  });
  it('카드 크기(mm)를 알면 면을 카드와 같은 축척으로 편다 — 사진 px 간격이 아니라 실제 거리, 가로·세로 축척은 면마다 카드 크기 ÷ 펼친 크기로 따로 (2026-11-04 씽크대: 카드끼리 겹쳐 밀려났다)', () => {
    // 면 좌표가 가로는 2배, 세로는 0.5배로 잘못 잰 원근 (바닥 축 원근): 펼친 크기 800×250 = 실제 400×500
    const mmPerPx = 2; // 사진 px 하나 = 카드 2mm
    const r = unfoldCenters([
      { id: 'a', px: [100, 500], face: { key: 'k', a: 0, b: 0, ext: [800, 250], size: [400, 500] } },
      { id: 'b', px: [300, 480], face: { key: 'k', a: 2000, b: 0, ext: [800, 250], size: [400, 500] } }, // 실제 1000mm 오른쪽
      { id: 'c', px: [110, 200], face: { key: 'k', a: 0, b: 1000, ext: [800, 250], size: [400, 500] } }, // 실제 2000mm 위
    ], () => mmPerPx);
    const [a, b, c] = ['a', 'b', 'c'].map((k) => r.get(k)!);
    expect((b[0] - a[0]) * mmPerPx).toBeCloseTo(1000, 6);
    expect((a[1] - c[1]) * mmPerPx).toBeCloseTo(2000, 6);
    expect(a[1]).toBeCloseTo(b[1], 6);
    expect(a[0]).toBeCloseTo(c[0], 6);
  });
});
