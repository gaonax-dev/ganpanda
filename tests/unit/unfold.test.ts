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
  const items = Object.entries(K).map(([id, v]) => ({ id, px: [0, 0] as [number, number], face: { key: 'p:y', a: (v.rect[0] + v.rect[1]) / 2, b: (v.rect[2] + v.rect[3]) / 2, depth: 0, rect: v.rect, card: v.card, real: true } }));
  // 사진 px 방향: 오른쪽이 +a, 아래가 -b (자리만 방향용)
  items.forEach((it) => (it.px = [it.face.a, -it.face.b]));
  const G = 100, L = 300;
  const r = unfoldCenters(items, { mmPerPx: () => 1, camera: () => [-13, 511, 1137], gap: G, labelMm: L });
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
  it('세로는 펼친 그대로 — 맞닿아 쌓인 서랍도 간격 없이, 그래서 아래끝이 문들과 같은 바닥선 (2026-11-05 "재정렬에 세로 위치가 다른데 섞여있다": 세로 간격을 넣어 서랍 열·5·문의 아래끝이 세 높이로 갈렸다)', () => {
    expect(Math.abs(box('s10').b - box('s1').b)).toBeLessThan(15);
    expect(Math.abs(box('s5').b - box('s1').b)).toBeLessThan(15);
    expect(box('s9').t).toBeGreaterThanOrEqual(box('s11').b - 1); // 겹치지는 않는다
    expect(box('s10').t).toBeGreaterThanOrEqual(box('s9').b - 1);
  });
  it('가로로 맞닿은 곳에만 간격 — 겹침 없음', () => {
    expect(box('s5').l - box('s10').r).toBeGreaterThanOrEqual(G - 1);
    const ids = Object.keys(K);
    for (const i of ids) for (const j of ids) if (i < j) {
      const A = box(i), B = box(j);
      expect(A.r <= B.l + 1 || B.r <= A.l + 1 || A.b <= B.t + 1 || B.b <= A.t + 1, `${i}·${j}`).toBe(true);
    }
  });
});

describe('unfoldCenters — 옆벽은 같은 벽끼리 한 면에 (2026-11-05 "사진의 세로 배열 순서가 바뀌었어": 씽크대 오른쪽 벽 서랍장)', () => {
  // 벽 좌표 [가로, 위, 벽 밖]. 카메라 C. 오른쪽 옆벽은 가로 = XS 인 면. 옆면은 사인물마다 따로 잡힌 면(가로 = Xi)에 펼쳐져 있다 —
  // 카메라에서 같은 방향이면 Xi 면 위 좌표 = C + (P − C) · (Xi − Cx)/(XS − Cx)
  const C = [0, 1500, 3000], XS = 2000, G = 100;
  const drawer = (id: string, out0: number, up0: number, Xi: number, real = true) => {
    const t = (Xi - C[0]) / (XS - C[0]);
    const o = (v: number) => C[2] + (v - C[2]) * t, u = (v: number) => C[1] + (v - C[1]) * t;
    const rect: [number, number, number, number] = [o(out0), o(out0 + 300), u(up0), u(up0 + 150)];
    return { id, px: [(rect[0] + rect[1]) / 2, -(rect[2] + rect[3]) / 2] as [number, number], face: { key: 'p:x:right', a: (rect[0] + rect[1]) / 2, b: (rect[2] + rect[3]) / 2, depth: Xi, rect, card: (real ? [300, 150] : [1000, 500]) as [number, number], real } };
  };
  // 3열(벽 밖 0·300·600) × 2줄(위 600·750). 열마다 다른 깊이의 면에 그려짐 (실제처럼 열마다 비율이 0.9·0.65·0.37)
  const cols = [{ o: 0, Xi: 2200 }, { o: 300, Xi: 3100 }, { o: 600, Xi: 5400 }];
  const items = cols.flatMap((c, j) => [drawer(`c${j}r0`, c.o, 750, c.Xi), drawer(`c${j}r1`, c.o, 600, c.Xi)]);
  const cam = () => [C[2], C[1], C[0]] as [number, number, number]; // 옆면: (벽 밖, 위) + 깊이 = 가로
  const box = (r: Map<string, [number, number]>, id: string, w = 300, h = 150) => { const c = r.get(id)!; return { l: c[0] - w / 2, t: c[1] - h / 2, r: c[0] + w / 2, b: c[1] + h / 2 }; };
  it('열마다 다른 면에 펼쳐졌어도 같은 벽으로 모아 펴면 줄·열이 정확히 맞는다', () => {
    const r = unfoldCenters(items, { mmPerPx: () => 1, camera: cam, gap: G });
    for (const j of [0, 1, 2]) expect(box(r, `c${j}r0`).t).toBeCloseTo(box(r, 'c0r0').t, 3); // 위 줄
    for (const j of [0, 1, 2]) expect(box(r, `c${j}r1`).t).toBeCloseTo(box(r, 'c0r1').t, 3); // 아래 줄
    for (const j of [0, 1, 2]) expect(box(r, `c${j}r1`).l).toBeCloseTo(box(r, `c${j}r0`).l, 3); // 같은 열
    expect(box(r, 'c0r1').t - box(r, 'c0r0').t).toBeCloseTo(150, 3); // 위 줄이 위, 맞붙음 (세로 간격 없음)
    expect(box(r, 'c1r0').l - box(r, 'c0r0').l).toBeCloseTo(300 + G, 3); // 가로로 맞닿음 → 간격
  });
  it('깊이 추정이 조금씩 퍼져 있어도(맨 가까운 것과 15% 차이) 이어져 있으면 한 벽 — 넷째 줄 서랍 하나만 따로 묶여 100mm 처지던 것 (씽크대)', () => {
    // 같은 벽인데 입력·외곽선 오차로 깊이 추정이 0.93·1.0·1.08 배로 퍼짐 (사이 틈은 각 7~8%)
    const spread = [{ id: 'n', k: 0.93 }, { id: 'm', k: 1.0 }, { id: 'f', k: 1.08 }];
    const its = spread.map(({ id, k }, j) => { const it = drawer(id, j * 300, 600, 2600); return { ...it, face: { ...it.face, card: [300 * k, 150 * k] as [number, number] } }; });
    const r = unfoldCenters(its, { mmPerPx: () => 1, camera: cam, gap: 0 });
    // 한 벽이면 같은 배율로 펴져 위끝이 같은 높이 (카드는 왼쪽 위 꼭짓점 기준)
    expect(r.get('n')![1] - 150 * 0.93 / 2).toBeCloseTo(r.get('m')![1] - 150 / 2, 0);
    expect(r.get('f')![1] - 150 * 1.08 / 2).toBeCloseTo(r.get('m')![1] - 150 / 2, 0);
  });
  it('치수 없는 카드(임시 크기)도 같은 벽에 — 제 열·제 줄 자리 (가장 큰 묶음)', () => {
    const r = unfoldCenters([...items, drawer('u', 0, 450, 2200, false)], { mmPerPx: () => 1, camera: cam, gap: G });
    expect(box(r, 'u', 1000, 500).l).toBeCloseTo(box(r, 'c0r0').l, 3);
    expect(box(r, 'u', 1000, 500).t).toBeCloseTo(box(r, 'c0r1').t + 150, 3);
  });
  it('앞벽이 있으면 오른쪽 옆벽 묶음은 앞벽 묶음의 오른쪽(간격 두 배), 높이는 앞벽과 같은 기준(실제 높이)', () => {
    // 앞벽 문: 가로 0~300, 위 0~650 (면 = 벽, 깊이 0, 크기 그대로) · 옆벽 서랍 맨 아래 줄 위끝 = 750 → 문 위끝(650)보다 100 위
    const front = (id: string, x0: number) => ({ id, px: [x0 + 150, -325] as [number, number], face: { key: 'p:y', a: x0 + 150, b: 325, depth: 0, rect: [x0, x0 + 300, 0, 650] as [number, number, number, number], card: [300, 650] as [number, number], real: true } });
    const r = unfoldCenters([front('f0', 0), front('f1', 400), ...items], { mmPerPx: () => 1, camera: (k) => (k.endsWith(':y') ? [C[0], C[1], C[2]] : cam()), gap: G });
    const f1 = box(r, 'f1', 300, 650);
    for (const j of [0, 1, 2]) expect(box(r, `c${j}r0`).l).toBeGreaterThanOrEqual(f1.r + 2 * G - 1);
    expect(box(r, 'c0r1').t - box(r, 'f0', 300, 650).t).toBeCloseTo(650 - 750, 3); // 옆벽 서랍 아래 줄 위끝(750) 은 문 위끝(650) 보다 100mm 위 → 화면에선 −100
  });
});

