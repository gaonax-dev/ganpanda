import { describe, expect, it } from 'vitest';
import { fitRect, pan, toScreen, toWorld, zoomAt, type Viewport, type XY } from '../../src/lib/core/viewport';

const v0: Viewport = { x: 100, y: 50, zoom: 2 };

describe('무한 캔버스 뷰포트', () => {
  it('world ↔ screen 왕복 변환', () => {
    const w = { x: 37, y: -12 };
    const s = toScreen(v0, w);
    expect(s).toEqual({ x: 174, y: 26 });
    expect(toWorld(v0, s)).toEqual(w);
  });

  it('커서 위치를 고정한 채 확대한다', () => {
    const cursor = { x: 400, y: 300 };
    const before = toWorld(v0, cursor);
    const v1 = zoomAt(v0, cursor, 1.5);
    expect(v1.zoom).toBeCloseTo(3);
    const after = toWorld(v1, cursor);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
  });

  it('확대 배율은 한계를 넘지 않는다', () => {
    expect(zoomAt(v0, { x: 0, y: 0 }, 1e6).zoom).toBe(12); // 40 → 12 (2026-10-21 휴대폰 크래시)
    expect(zoomAt(v0, { x: 0, y: 0 }, 1e-6).zoom).toBe(0.02);
  });

  it('화면 이동', () => {
    expect(pan(v0, 10, -5)).toEqual({ x: 110, y: 45, zoom: 2 });
  });

  it('영역을 화면 가운데에 맞춘다', () => {
    const v = fitRect({ x: 0, y: 0, w: 1000, h: 500 }, 800, 600, 0);
    expect(v.zoom).toBeCloseTo(0.8);
    const c = toScreen(v, { x: 500, y: 250 });
    expect(c.x).toBeCloseTo(400);
    expect(c.y).toBeCloseTo(300);
  });
});

describe('핀치 (두 손가락)', async () => {
  const { pinch } = await import('../../src/lib/core/viewport');
  it('두 손가락을 벌리면 가운데 점의 world 좌표가 고정된 채 거리 비율만큼 확대된다', () => {
    const prev: [XY, XY] = [{ x: 100, y: 200 }, { x: 300, y: 200 }];
    const now: [XY, XY] = [{ x: 0, y: 200 }, { x: 400, y: 200 }]; // 200 → 400 = 2배
    const mid = { x: 200, y: 200 };
    const before = toWorld(v0, mid);
    const v1 = pinch(v0, prev, now);
    expect(v1.zoom).toBeCloseTo(4);
    const after = toWorld(v1, mid);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
  });
  it('두 손가락을 같이 옮기면 확대 없이 이동한다', () => {
    const prev: [XY, XY] = [{ x: 100, y: 200 }, { x: 300, y: 200 }];
    const now: [XY, XY] = [{ x: 130, y: 250 }, { x: 330, y: 250 }];
    const v1 = pinch(v0, prev, now);
    expect(v1.zoom).toBeCloseTo(v0.zoom);
    expect(v1.x).toBeCloseTo(v0.x + 30);
    expect(v1.y).toBeCloseTo(v0.y + 50);
  });
  it('손가락이 겹쳐 거리가 0 이면 확대하지 않는다', () => {
    const v1 = pinch(v0, [{ x: 10, y: 10 }, { x: 10, y: 10 }], [{ x: 10, y: 10 }, { x: 50, y: 10 }]);
    expect(v1.zoom).toBeCloseTo(v0.zoom);
  });
});

describe('두 손가락: 화면 이동이 가장 먼저, 그다음 확대·축소 (twoFinger, 2026-10-20 "두손가락 드래그(화면팬)는 모든 제스처중 가장 우선한다. 그 다음 줌이다")', async () => {
  const { twoFinger, startTwoFinger } = await import('../../src/lib/core/viewport');
  const v = { x: 0, y: 0, zoom: 1 };
  const A = { x: 100, y: 300 }, B = { x: 300, y: 300 };
  it('나란히 끌면 이동만 — 손가락 간격이 조금(8% 안) 흔들려도 배율은 그대로', () => {
    let st = startTwoFinger([A, B]);
    let r = twoFinger(v, st, [A, B], [{ x: 150, y: 340 }, { x: 357, y: 340 }]); // 간격 200 → 207 (3.5%)
    expect(r.v.zoom).toBe(1);
    expect(r.v.x).toBeCloseTo(53.5, 1); expect(r.v.y).toBeCloseTo(40, 5); // 가운데 점을 따라 이동
    st = r.st;
    r = twoFinger(r.v, st, [{ x: 150, y: 340 }, { x: 357, y: 340 }], [{ x: 200, y: 380 }, { x: 410, y: 380 }]); // 누적 5%
    expect(r.v.zoom).toBe(1);
    expect(r.st.zooming).toBe(false);
  });
  it('간격이 분명히 바뀌면(8% 넘게) 그때부터 확대·축소도 — 이동은 계속', () => {
    const st = startTwoFinger([A, B]);
    const r = twoFinger(v, st, [A, B], [{ x: 50, y: 300 }, { x: 350, y: 300 }]); // 200 → 300
    expect(r.st.zooming).toBe(true);
    expect(r.v.zoom).toBeCloseTo(1.5, 5);
  });
});

describe('휴대폰 메모리 (2026-10-21 "모바일에서 핀치줌중에 페이지 열수 없음 크레시가 난다")', async () => {
  const { zoomAt, ZOOM_MAX } = await import('../../src/lib/core/viewport');
  const { capBox } = await import('../../src/lib/core/perspective');
  it('최대 확대 12배 — 3D 로 겹친 그림이 확대만큼 큰 그림으로 그려져 메모리가 넘쳤다', () => {
    expect(ZOOM_MAX).toBe(12);
    expect(zoomAt({ x: 0, y: 0, zoom: 10 }, { x: 0, y: 0 }, 5).zoom).toBe(12);
  });
  it('원근으로 겹치는 그림 상자는 긴 변 1024px 안 (비율 유지)', () => {
    expect(capBox(3200, 300)).toEqual({ w: 1024, h: 96 });
    expect(capBox(500, 400)).toEqual({ w: 500, h: 400 });
    expect(capBox(2000, 6000)).toEqual({ w: 2000 * (1024 / 6000), h: 1024 });
  });
});
