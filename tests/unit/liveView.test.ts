// 3D 단계: 화면 가운데 사진만 실시간 (2026-10-27 사용자: "3d 랜더링보다 실시간이 더 빠르지 않나?" → "확대할때 이상해 화면에서 가운데 있는 사진의 3d만 실시간")
// 그 사진에서 화면에 보이는 부분만, 화면 해상도로 그린다 — 확대해도 또렷하고 그림 크기가 화면을 넘지 않는다
import { describe, expect, it } from 'vitest';
import { liveView } from '../../src/lib/core/liveView';

// 보드 단위: 사진 a 는 (0,0) 폭 1000, b 는 (1200,0) 폭 1000. 원본 픽셀은 2000×1500 (보드 높이 750)
const photos = [
  { id: 'a', x: 0, y: 0, width: 1000, w: 2000, h: 1500 },
  { id: 'b', x: 1200, y: 0, width: 1000, w: 2000, h: 1500 },
];

describe('가운데 사진 고르기', () => {
  it('화면 가운데가 들어간 사진', () => {
    // 줌 0.5, 화면 1200×600: 가운데(600,300) = 보드 (1200-? ) → b 가 가운데
    const v = liveView(photos, { x: -400, y: 0, zoom: 0.5 }, { w: 1200, h: 600 });
    expect(v?.id).toBe('b');
  });
  it('가운데에 사진이 없으면 가장 많이 보이는 사진, 하나도 안 보이면 없음', () => {
    expect(liveView(photos, { x: 0, y: 0, zoom: 0.3 }, { w: 1200, h: 600 })?.id).toBe('a'); // a 300px · b 일부, 가운데(600,300)는 사이 빈 곳
    expect(liveView(photos, { x: 5000, y: 0, zoom: 1 }, { w: 800, h: 600 })).toBeNull();
  });
  it('쓸 수 있는 사진만 (3D 벽면이 있는 사진)', () => {
    expect(liveView(photos, { x: -400, y: 0, zoom: 0.5 }, { w: 1200, h: 600 }, (id) => id === 'a')?.id).toBe('a');
  });
});

describe('보이는 부분만 화면 해상도로', () => {
  it('통째로 보이면 사진 전체, 크기는 화면에 보이는 픽셀', () => {
    const v = liveView([photos[0]], { x: 100, y: 50, zoom: 0.5 }, { w: 1200, h: 600 })!;
    expect(v.crop).toEqual({ x: 0, y: 0, w: 2000, h: 1500 });
    expect(v.px).toEqual({ w: 500, h: 375 });
    expect(v.rect).toEqual({ x: 0, y: 0, w: 1000, h: 750 }); // 보드 단위(사진 안)
  });
  it('크게 확대하면 보이는 조각만 — 그림 크기는 화면을 넘지 않는다', () => {
    // 줌 8: 사진 보드 폭 1000 → 화면 8000px. 화면 800×600 은 사진의 가운데 조각
    const v = liveView([photos[0]], { x: -3600, y: -2700, zoom: 8 }, { w: 800, h: 600 })!;
    expect(v.px).toEqual({ w: 800, h: 600 });
    expect(v.rect).toEqual({ x: 450, y: 337.5, w: 100, h: 75 });
    expect(v.crop).toEqual({ x: 900, y: 675, w: 200, h: 150 }); // 원본 픽셀 = 보드 × 2
  });
});
