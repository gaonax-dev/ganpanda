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
    expect(zoomAt(v0, { x: 0, y: 0 }, 1e6).zoom).toBe(40);
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
