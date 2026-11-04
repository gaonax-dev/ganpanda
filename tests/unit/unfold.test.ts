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
  it('카드 크기(mm)를 알면 면을 카드와 같은 축척으로 편다 — 사진 px 간격이 아니라 실제 거리, 가로·세로 축척은 카드 크기 ÷ 펼친 크기로 따로 (2026-11-04 씽크대: 카드끼리 겹쳐 밀려났다)', () => {
    // 면 좌표가 가로는 2배, 세로는 0.5배로 잘못 잰 원근 (바닥 축 원근): 펼친 크기 800×250 = 실제 400×500
    const mmPerPx = 2; // 사진 px 하나 = 카드 2mm
    const f = (a: number, b: number) => ({ key: 'k', a, b, rect: [a - 400, a + 400, b - 125, b + 125] as [number, number, number, number], card: [400, 500] as [number, number], real: true });
    const r = unfoldCenters([
      { id: 'a', px: [100, 500], face: f(0, 0) },
      { id: 'b', px: [300, 480], face: f(2000, 0) }, // 실제 1000mm 오른쪽
      { id: 'c', px: [110, 200], face: f(0, 1000) }, // 실제 2000mm 위
    ], { mmPerPx: () => mmPerPx });
    const [a, b, c] = ['a', 'b', 'c'].map((k) => r.get(k)!);
    expect((b[0] - a[0]) * mmPerPx).toBeCloseTo(1000, 6);
    expect((a[1] - c[1]) * mmPerPx).toBeCloseTo(2000, 6);
    expect(a[1]).toBeCloseTo(b[1], 6);
    expect(a[0]).toBeCloseTo(c[0], 6);
  });
});

describe('unfoldCenters — 포토샵 원근 펴기처럼 (2026-11-05 "상하 좌우의 배치가 어긋난다 … 축면에 사인물 맵핑해 포토샵에서 변형으로 펼치듯 펼치면 되는데 이걸 좌표에서 사용")', () => {
  // 씽크대 실제 값: 벽면에 펼친 외곽선(면 mm, b 위 +), 입력 치수, 카메라 발(벽 위 카메라 바로 앞 점)
  const K: Record<string, { rect: [number, number, number, number]; card: [number, number] }> = {
    s12: { rect: [125, 431, 589, 1197], card: [400, 790] }, // 위 찬장 (벽 쪽 깊이 — 펼친 크기의 1.3배)
    s6: { rect: [890, 1193, 590, 1197], card: [395, 790] },
    s11: { rect: [195, 594, -295, -148], card: [400, 140] }, // 서랍 (위→아래 맞닿음)
    s9: { rect: [194, 595, -501, -296], card: [400, 200] },
    s10: { rect: [195, 593, -805, -507], card: [400, 300] },
    s5: { rect: [600, 901, -803, -337], card: [300, 460] },
    s1: { rect: [1215, 1509, -796, -140], card: [300, 650] }, // 문
  };
  const items = Object.entries(K).map(([id, v]) => ({ id, px: [0, 0] as [number, number], face: { key: 'p:y', a: (v.rect[0] + v.rect[1]) / 2, b: (v.rect[2] + v.rect[3]) / 2, rect: v.rect, card: v.card, real: true } }));
  // 사진 px 방향: 오른쪽이 +a, 아래가 -b (자리만 방향용)
  items.forEach((it) => (it.px = [it.face.a, -it.face.b]));
  const G = 100, L = 300;
  const r = unfoldCenters(items, { mmPerPx: () => 1, foot: () => [-13, 511], gap: G, labelMm: L });
  const box = (id: string) => { const c = r.get(id)!, [w, h] = K[id].card; return { l: c[0] - w / 2, t: c[1] - h / 2, r: c[0] + w / 2, b: c[1] + h / 2 }; };
  it('깊이가 다른 층(위 찬장)은 카메라 발을 중심으로 그 층의 배율로 펴서 아래 서랍 열과 같은 열 (왼끝이 40mm 안)', () => {
    expect(Math.abs(box('s12').l - box('s11').l)).toBeLessThan(40);
    expect(box('s6').r - box('s6').l).toBeCloseTo(395, 6);
  });
  it('위끝·왼끝이 같은 선이면 그대로 같은 선 — 위 찬장 줄, 아래 줄(서랍 맨 위·문)', () => {
    expect(box('s12').t).toBeCloseTo(box('s6').t, 6);
    expect(Math.abs(box('s11').t - box('s1').t)).toBeLessThan(15);
    expect(box('s11').l).toBeCloseTo(box('s9').l, 6); expect(box('s9').l).toBeCloseTo(box('s10').l, 6);
  });
  it('맞닿은 곳에만 간격 — 세로로 맞닿으면 이름 줄 + 간격, 가로로 맞닿으면 간격. 겹침 없음', () => {
    expect(box('s9').t - box('s11').b).toBeGreaterThanOrEqual(L + G - 1);
    expect(box('s10').t - box('s9').b).toBeGreaterThanOrEqual(L + G - 1);
    expect(box('s5').l - box('s10').r).toBeGreaterThanOrEqual(G - 1);
    const ids = Object.keys(K);
    for (const i of ids) for (const j of ids) if (i < j) {
      const A = box(i), B = box(j);
      expect(A.r <= B.l + 1 || B.r <= A.l + 1 || A.b <= B.t + 1 || B.b <= A.t + 1, `${i}·${j}`).toBe(true);
    }
  });
});
