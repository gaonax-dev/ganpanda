// 사진 보드 카드 정렬 (2026-10-20 사용자: "사진보드의 사진과 사인물 배치 그리고 카드 정렬을 비교해 최대한 같은 위치로 인식되도록 구성해줘")
import { describe, expect, it } from 'vitest';
import { arrangeLikePhotos } from '../../src/lib/core/arrange';

// 사진 1 장: 평면 x 0, 폭 12000mm(보드에서의 폭), 사진 원본 1200px → 1px = 10mm
const photo = { x: 0, w: 12000, imgW: 1200 };
const card = (id: string, w: number, h: number, x0: number, y0: number, x1: number, y1: number, p: number | null = 0) => ({ id, w, h, photo: p, box: { x0, y0, x1, y1 } });

describe('arrangeLikePhotos — 카드는 사진 속 사인물 자리 그대로(사진을 보드 폭으로 옮긴 자리)', () => {
  it('사인물 가운데 아래에 카드 가운데, 위 사인물은 위에 — 묶음 맨 위가 0', () => {
    const out = arrangeLikePhotos([
      card('upper', 2000, 800, 100, 100, 300, 180), // 가운데 (200, 140) px → (2000, 1400) mm
      card('lower', 1000, 1000, 800, 500, 900, 600), // 가운데 (850, 550) → (8500, 5500)
    ], [photo], 200, 0);
    expect(out.get('upper')).toEqual({ x: 2000 - 1000, y: 0 });
    expect(out.get('lower')).toEqual({ x: 8500 - 500, y: 5500 - 500 - (1400 - 400) });
  });
  it('겹치면 덜 움직이는 쪽(오른쪽·왼쪽·아래·위)으로 비키고, 이름 줄(labelMm)도 겹침으로 친다', () => {
    const out = arrangeLikePhotos([
      card('big', 4000, 1000, 100, 100, 500, 200), // 가운데 3000,1500 → 1000~5000 × 1000~2000
      card('small', 1000, 500, 450, 120, 550, 170), // 가운데 5000,1450 → 4500~5500: 오른쪽으로 700 이면 비킨다
    ], [photo], 200, 300);
    expect(out.get('big')).toEqual({ x: 1000, y: 0 });
    expect(out.get('small')).toEqual({ x: 5200, y: 200 });
  });
  it('큰 카드의 왼쪽에 있던 사인물은 왼쪽으로 비킨다 (오른쪽 아래로 멀리 밀리지 않음)', () => {
    const out = arrangeLikePhotos([
      card('big', 3000, 4000, 500, 100, 800, 500), // 가운데 6500 → 5000~8000
      card('left', 2000, 300, 300, 200, 500, 230), // 가운데 4000 → 3000~5000: 큰 카드와 겹침 → 왼쪽으로
    ], [photo], 200, 0);
    expect(out.get('left')!.x).toBe(5000 - 200 - 2000);
  });
  it('두 번째 사진의 카드는 그 사진 자리 아래, 앞 묶음이 넘어오면 밀린다. 사진 없는 카드는 모두의 아래', () => {
    const out = arrangeLikePhotos([
      card('a', 3000, 500, 0, 0, 100, 100),
      card('b', 1000, 500, 600, 0, 700, 100, 1),
      card('free', 700, 700, 0, 0, 0, 0, null),
    ], [photo, { x: 13000, w: 12000, imgW: 1200 }], 200, 0);
    expect(out.get('a')).toEqual({ x: -1000, y: 0 }); // 사진 왼쪽 끝 사인물 가운데 아래 — 사진보다 왼쪽으로 나와도 그 자리
    expect(out.get('b')).toEqual({ x: 13000 + 6500 - 500, y: 0 });
    expect(out.get('free')).toEqual({ x: 0, y: 500 + 400 });
  });
});
