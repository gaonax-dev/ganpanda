// 사진 보드 카드 정렬 — 그리드 (2026-10-20 사용자: "엑셀의 그리드로 설명하면 구조의 최대 블록을 생성하고 해당 그림의 위치를 다시 그리는데 차지하는 면적에 따라 병합한 위치에 사진을 둘수 있다.
// 축들이 완성되면 축 덩어리를 나열하고 다시 사진 단위로 배치한다. 사진이 2열이면 정면도 카드 사진그룹도 2열로 배열한다." → "그리드 방식으로 진행해줘")
import { describe, expect, it } from 'vitest';
import { arrangeGrid, axisLines, gridOf, photoGrid } from '../../src/lib/core/arrange';

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

describe('photoGrid — 보드의 사진 배치를 행·열로', () => {
  it('가로 네 장 = 1행 4열, 2×2 = 2행 2열', () => {
    const row = [0, 1300, 2600, 3900].map((x) => ({ x, y: 0, w: 1200, h: 900 }));
    expect(photoGrid(row)).toEqual([{ r: 0, c: 0 }, { r: 0, c: 1 }, { r: 0, c: 2 }, { r: 0, c: 3 }]);
    const sq = [{ x: 0, y: 0 }, { x: 1300, y: 20 }, { x: 10, y: 1000 }, { x: 1290, y: 990 }].map((p) => ({ ...p, w: 1200, h: 900 }));
    expect(photoGrid(sq)).toEqual([{ r: 0, c: 0 }, { r: 0, c: 1 }, { r: 1, c: 0 }, { r: 1, c: 1 }]);
  });
});

describe('arrangeGrid — 셀 크기 = 그 칸 카드의 최대 크기, 병합 셀은 가운데, 사진 묶음은 사진 배치 그대로 행·열', () => {
  const photos = [{ x: 0, y: 0, w: 1200, h: 900, imgW: 1000, imgH: 1000 }, { x: 1300, y: 0, w: 1200, h: 900, imgW: 1000, imgH: 1000 }];
  it('위 셋 + 아래 병합 하나, 둘째 사진은 오른쪽 열', () => {
    const c = (id: string, w: number, h: number, photo: number | null, x0: number, y0: number, x1: number, y1: number) => ({ id, w, h, photo, box: { x0, y0, x1, y1 } });
    const out = arrangeGrid([
      c('u1', 600, 900, 0, 100, 100, 300, 400), c('u2', 400, 800, 0, 302, 100, 500, 400), c('u3', 600, 900, 0, 498, 100, 700, 400),
      c('long', 1800, 300, 0, 101, 500, 699, 600),
      c('p2', 500, 500, 1, 100, 100, 300, 300),
      c('free', 700, 700, null, 0, 0, 0, 0),
    ], photos, 100, 0, 0.03);
    // 열 너비 600·400·600, 간격 100 → 열 x 0·700·1200, 전체 1800. 1행 높이 900
    expect(out.get('u1')).toEqual({ x: 0, y: 0 });
    expect(out.get('u2')).toEqual({ x: 700, y: 50 }); // 400×800 은 600? 아님 — 열 너비 400, 행 높이 900 → 세로 가운데
    expect(out.get('u3')).toEqual({ x: 1200, y: 0 });
    expect(out.get('long')).toEqual({ x: 0, y: 1000 }); // 세 칸 병합(폭 1800) 가운데 — 딱 맞음
    expect(out.get('p2')).toEqual({ x: 1800 + 200, y: 0 }); // 둘째 사진 묶음 = 다음 열, 묶음 사이 간격 두 배
    expect(out.get('free')).toEqual({ x: 0, y: 1300 + 200 });
  });
  it('묶음은 자기 사진 아래(사진 왼쪽에서 시작) — 앞 묶음이 짧으면 사이가 빈다', () => {
    const far = [{ x: 0, y: 0, w: 12000, h: 9000, imgW: 1000, imgH: 1000 }, { x: 13000, y: 0, w: 12000, h: 9000, imgW: 1000, imgH: 1000 }];
    const out = arrangeGrid([{ id: 'a', w: 500, h: 500, photo: 0, box: { x0: 0, y0: 0, x1: 100, y1: 100 } }, { id: 'b', w: 500, h: 500, photo: 1, box: { x0: 0, y0: 0, x1: 100, y1: 100 } }], far, 100, 0);
    expect(out.get('a')).toEqual({ x: 0, y: 0 });
    expect(out.get('b')).toEqual({ x: 13000, y: 0 });
  });
});
