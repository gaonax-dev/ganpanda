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

// 2026-10-28 사용자: "3d 화면에서 줌 아웃하면 3d 랜더링 뜨고 화면을 새로고침한다. 개별 업데이트로 하고 화면 새로고침을 피할 수 있어?"
describe('너무 작게 보이면 실시간 안 함', () => {
  it('화면에 보이는 사진의 짧은 변이 LIVE_MIN_PX 보다 작으면 없음 (멀리서 보면 3D 차이가 안 보인다 — 장면을 짓지 않는다)', async () => {
    const { LIVE_MIN_PX } = await import('../../src/lib/core/liveView');
    // 줌 0.1: 사진 보드 1000×750 → 화면 100×75
    expect(liveView([photos[0]], { x: 10, y: 10, zoom: 0.1 }, { w: 400, h: 800 })).toBeNull();
    const z = (LIVE_MIN_PX + 10) / 750; // 짧은 변(높이)이 기준을 조금 넘게
    expect(liveView([photos[0]], { x: 0, y: 0, zoom: z }, { w: 2000, h: 2000 })?.id).toBe('a');
  });
});

// 2026-10-30 아이폰 진단 기록: 3D 에서 확대·축소하는 동안 가운데 사진이 두 장 사이를 한 프레임에도 여러 번 오가며 장면을 다시 얹었고, 그 직후 다시 열렸다
describe('가운데 사진은 쉽게 바뀌지 않는다 (앞 사진 유지)', async () => {
  const { liveView } = await import('../../src/lib/core/liveView');
  const photos = [
    { id: 'a', x: 0, y: 0, width: 1000, w: 1000, h: 750 },
    { id: 'b', x: 1300, y: 0, width: 1000, w: 1000, h: 750 },
  ];
  const screen = { w: 1200, h: 600 };
  it('가운데가 사이 빈 곳이면 앞 사진을 그대로 (더 많이 보이는 쪽으로 바로 넘어가지 않는다)', () => {
    const v = { x: -500, y: 0, zoom: 0.5 }; // 가운데(600,300) = 보드 2200 → b 안
    expect(liveView(photos, v, screen)?.id).toBe('b');
    const g = { x: 600 - 1150 * 0.5, y: 0, zoom: 0.5 }; // 가운데 = 보드 1150 (a 끝 1000 · b 시작 1300 사이)
    expect(liveView(photos, g, screen, () => true, 'a')?.id).toBe('a');
    expect(liveView(photos, g, screen, () => true, 'b')?.id).toBe('b');
  });
  it('다른 사진이 가운데를 차지하고 앞 사진은 아니면 그때 넘어간다', () => {
    const v = { x: 600 - 1800 * 0.5, y: 0, zoom: 0.5 }; // 가운데 = 보드 1800 → b 안
    expect(liveView(photos, v, screen, () => true, 'a')?.id).toBe('b');
  });
  it('앞 사진이 너무 작아졌거나 화면 밖이면 놓는다', () => {
    const far = { x: 600 - 1150 * 0.05, y: 0, zoom: 0.05 }; // 짧은 변 37px < 80
    expect(liveView(photos, far, screen, () => true, 'a')).toBeNull();
  });
});

describe('휴대폰은 가운데 사진이 바뀌면 지어 둔 장면이어도 멈춘 뒤에 얹는다 (2026-10-30)', async () => {
  const { liveBuildDelay, LIVE_SETTLE_MS } = await import('../../src/lib/core/liveView');
  it('휴대폰이면 늘 기다린다, 데스크톱은 바로', () => {
    expect(liveBuildDelay(true, true)).toBe(LIVE_SETTLE_MS);
    expect(liveBuildDelay(true, false)).toBe(LIVE_SETTLE_MS);
    expect(liveBuildDelay(false, true)).toBe(0);
  });
});
