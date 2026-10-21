// 사진 보드 카드 정렬 — 그리드 (2026-10-20 사용자: "엑셀의 그리드로 설명하면 구조의 최대 블록을 생성하고 해당 그림의 위치를 다시 그리는데 차지하는 면적에 따라 병합한 위치에 사진을 둘수 있다.
// 축들이 완성되면 축 덩어리를 나열하고 다시 사진 단위로 배치한다. 사진이 2열이면 정면도 카드 사진그룹도 2열로 배열한다." → "그리드 방식으로 진행해줘")
import { describe, expect, it } from 'vitest';
import { arrangeLikePhotos, axisLines, gridOf, homeOf, photoGrid } from '../../src/lib/core/arrange';

describe('axisLines — 가까운 값을 하나의 축선으로', () => {
  it('허용 오차 안의 값은 평균 하나로, 순서대로', () => {
    expect(axisLines([100, 103, 500, 98, 497, 900], 10)).toEqual([(100 + 103 + 98) / 3, (500 + 497) / 2, 900]);
  });
});

describe('gridOf — 사진 한 장의 사인물을 행·열 셀(병합)로', () => {
  // 위 수납장 셋(한 행 세 칸) + 아래 긴 사인물(세 칸 병합) — 사진 1000×1000
  const upper = (id: string, x0: number) => ({ id, box: { x0, y0: 100, x1: x0 + 200, y1: 400 } });
  const items = [upper('u1', 100), upper('u2', 302), upper('u3', 498), { id: 'long', box: { x0: 101, y0: 500, x1: 699, y1: 600 } }];
  it('같은 세로선·가로선은 같은 축 — 위 셋은 1행 각 칸, 아래 긴 것은 2행 세 칸 병합', () => {
    const g = gridOf(items, 1000, 1000, 0.03);
    expect(g.get('u1')).toEqual({ r0: 0, r1: 1, c0: 0, c1: 1 });
    expect(g.get('u2')).toEqual({ r0: 0, r1: 1, c0: 1, c1: 2 });
    expect(g.get('u3')).toEqual({ r0: 0, r1: 1, c0: 2, c1: 3 });
    expect(g.get('long')).toEqual({ r0: 1, r1: 2, c0: 0, c1: 3 });
  });
  it('같은 셀에 겹친 작은 사인물(판 위 글자)은 바로 아래 새 행으로', () => {
    const g = gridOf([{ id: 'board', box: { x0: 100, y0: 100, x1: 900, y1: 300 } }, { id: 'letters', box: { x0: 105, y0: 105, x1: 895, y1: 295 } }, { id: 'door', box: { x0: 100, y0: 400, x1: 300, y1: 900 } }], 1000, 1000, 0.03);
    expect(g.get('board')).toEqual({ r0: 0, r1: 1, c0: 0, c1: 2 });
    expect(g.get('letters')).toEqual({ r0: 1, r1: 2, c0: 0, c1: 2 });
    expect(g.get('door')!.r0).toBe(2);
  });
});

describe('gridOf — 작은 사인물이 나란히 있어도 각자 칸 (2026-10-21 핀볼: 폭 5712px 사진에서 폭 140px 폴딩시트 넷이 3%(171px) 축선 하나로 뭉쳐 세로로 쌓였다)', () => {
  it('축선 허용 오차 = 사진 크기의 3% 와 사인물 크기 중앙값의 25% 중 작은 값 — 네 장이 한 행 네 칸', () => {
    const sheets = [1819, 1954, 2104, 2260].map((x, i) => ({ id: `s${i + 1}`, box: { x0: x, y0: 2240, x1: x + 140, y1: 2980 } }));
    const g = gridOf(sheets, 5712, 4284, 0.03);
    expect([...g.values()].map((v) => v.r0)).toEqual([0, 0, 0, 0]);
    expect(sheets.map((s) => g.get(s.id)!.c0)).toEqual([0, 1, 2, 3]);
  });
});

describe('homeOf — 연결된 사인물(⇄)의 카드 기준 사진 = 가장 정면인 것 (2026-10-21 핀볼: 사선 사진에서 먼저 그려 카드가 사선 사진 아래로 갔다)', () => {
  it('네 모서리가 직각에 가까운 쪽, 같으면 크게 보이는 쪽', () => {
    const skewed = { id: 'm', photo: 1, quad: [[100, 120], [300, 100], [300, 400], [100, 360]] as [number, number][] };
    const frontal = { id: 'c', photo: 0, quad: [[100, 100], [250, 100], [250, 400], [100, 400]] as [number, number][] };
    expect(homeOf([skewed, frontal]).id).toBe('c');
    const big = { id: 'b', photo: 2, quad: [[0, 0], [600, 0], [600, 900], [0, 900]] as [number, number][] };
    expect(homeOf([frontal, big]).id).toBe('b');
  });
});

describe('photoGrid — 보드의 사진 배치를 행·열로', () => {
  it('가로 네 장 = 1행 4열, 2×2 = 2행 2열', () => {
    const row = [0, 1300, 2600, 3900].map((x) => ({ x, y: 0, w: 1200, h: 900 }));
    expect(photoGrid(row)).toEqual([{ r: 0, c: 0 }, { r: 0, c: 1 }, { r: 0, c: 2 }, { r: 0, c: 3 }]);
    const sq = [{ x: 0, y: 0 }, { x: 1300, y: 20 }, { x: 10, y: 1000 }, { x: 1290, y: 990 }].map((p) => ({ ...p, w: 1200, h: 900 }));
    expect(photoGrid(sq)).toEqual([{ r: 0, c: 0 }, { r: 0, c: 1 }, { r: 1, c: 0 }, { r: 1, c: 1 }]);
  });
});

describe('arrangeLikePhotos — 사진과 같은 비율 (2026-10-22 "자동정렬은 피봇 기본 위치에 놓는다. 그리고 사진과 같은 비율로 사진과 비슷하게")', () => {
  const c = (id: string, w: number, h: number, photo: number | null, x0: number, y0: number, x1: number, y1: number) => ({ id, w, h, photo, box: { x0, y0, x1, y1 } });
  const ph = { x: 0, y: 0, w: 10000, h: 10000, imgW: 1000, imgH: 1000 }; // 1px = 10mm
  it('카드 가운데 = 사진 속 사인물 가운데, 맨 위는 0, x 는 사진 기준', () => {
    const out = arrangeLikePhotos([c('a', 2000, 1000, 0, 100, 100, 300, 200), c('b', 1000, 1000, 0, 650, 450, 750, 550)], [ph], 100, 0);
    expect(out.get('a')).toEqual({ x: 1000, y: 0 }); // 가운데 (2000,1500) − 크기/2 → (1000,1000) → 맨 위 0
    expect(out.get('b')).toEqual({ x: 6500, y: 3500 });
  });
  it('실제 크기가 사진보다 커서 겹치면 큰 카드가 자리, 작은 카드는 덜 움직이는 쪽으로 간격 두고 비킨다 (이름 줄 포함)', () => {
    const out = arrangeLikePhotos([c('big', 4000, 2000, 0, 100, 100, 300, 200), c('small', 1000, 1000, 0, 320, 120, 380, 180)], [ph], 100, 200);
    expect(out.get('big')).toEqual({ x: 0, y: 0 });
    expect(out.get('small')).toEqual({ x: 4100, y: 500 }); // 오른쪽으로 밀림: big 오른쪽 4000 + 간격 100. y 는 원래 자리(1000 − 맨 위 500)
  });
  it('사진 묶음은 사진 자리 그대로 — 옆 사진은 그 사진 아래, 아랫줄 사진은 윗줄 아래로, 사진 없는 카드는 맨 아래 한 줄', () => {
    const photos = [ph, { ...ph, x: 11000 }, { ...ph, y: 11000 }];
    const out = arrangeLikePhotos([c('a', 1000, 1000, 0, 450, 450, 550, 550), c('b', 1000, 1000, 1, 450, 450, 550, 550), c('d', 1000, 1000, 2, 450, 450, 550, 550), c('free', 500, 500, null, 0, 0, 0, 0)], photos, 100, 0);
    expect(out.get('a')).toEqual({ x: 4500, y: 0 });
    expect(out.get('b')).toEqual({ x: 15500, y: 0 });
    expect(out.get('d')).toEqual({ x: 4500, y: 11000 });
    expect(out.get('free')).toEqual({ x: 0, y: 12000 + 200 });
  });
  it('묶음끼리 겹치면 오른쪽으로 간격 두 배', () => {
    const photos = [ph, { ...ph, x: 9000 }]; // 사진이 붙어 있고 카드가 넓다 — b 는 원래 9100 에서 a 오른쪽 9500 + 간격 두 배로
    const out = arrangeLikePhotos([c('a', 9000, 1000, 0, 50, 100, 950, 200), c('b', 2000, 1000, 1, 10, 100, 210, 200)], photos, 100, 0);
    expect(out.get('a')).toEqual({ x: 500, y: 0 });
    expect(out.get('b')!.x).toBe(9500 + 200);
  });
});
