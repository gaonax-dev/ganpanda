// 사진 설정: 교체·이미지 조절(크롭 — 사진 밖으로 키우기도·밝기)·삭제 (2026-10-21 사용자: "현재 x 마크 대신 설정버튼으로 사진교체, 이미지 조절(크롭(크게도 가능하게),밝기), 삭제")
import { describe, expect, it } from 'vitest';
import { adjustPlan, mapObjectPts, mapPhotoPts, mapPinPts, normalizeCrop, replacePlan, sourceOf } from '../../src/lib/core/photoEdit';
import type { Photo, Pin, SignObject } from '../../src/lib/core/model';

const photo: Photo = { id: 'p', name: 'a', assetId: 'A', w: 1600, h: 1000, x: 100, y: 50, width: 800, zones: [[[0, 0], [100, 0], [100, 100]]], camera: { x: [{ a: [10, 10], b: [20, 10] }, { a: [10, 90], b: [20, 90] }], y: [{ a: [10, 10], b: [10, 20] }, { a: [90, 10], b: [90, 20] }], origin: [10, 90], ref: { axis: 'x', from: [10, 90], to: [60, 90], mm: 1000 } } };
const shift = ([x, y]: [number, number]): [number, number] => [x + 5, y - 7];

describe('사진 px 좌표 옮기기 (크롭·교체 후에도 영역·존·축 선·말풍선이 같은 자리에)', () => {
  it('사진: 존·축 선·원점·기준 길이 핸들', () => {
    const p = mapPhotoPts(photo, shift);
    expect(p.zones![0][1]).toEqual([105, -7]);
    expect(p.camera!.x[0].a).toEqual([15, 3]);
    expect(p.camera!.origin).toEqual([15, 83]);
    expect((p.camera!.ref as { from: [number, number] }).from).toEqual([15, 83]);
    expect(photo.camera!.origin).toEqual([10, 90]); // 원본은 그대로
  });
  it('사인물: quad·polygon, 말풍선: 꼭지·몸통 오프셋은 그대로', () => {
    const o = { id: 'o', photoId: 'p', quad: [[0, 0], [10, 0], [10, 10], [0, 10]], polygon: [[1, 1], [2, 2], [3, 1]] } as unknown as SignObject;
    const m = mapObjectPts(o, shift);
    expect(m.quad[2]).toEqual([15, 3]);
    expect(m.polygon![0]).toEqual([6, -6]);
    const pin = { id: 'n', photoId: 'p', x: 10, y: 10, bx: 30, by: -20 } as Pin;
    expect(mapPinPts(pin, shift)).toEqual({ x: 15, y: 3, bx: 30, by: -20 });
  });
});

describe('크롭 (원본 밖으로 키울 수 있다 — 여백이 생긴다)', () => {
  it('정수로 맞추고 최소 16px, 원본 밖도 허용', () => {
    expect(normalizeCrop({ x: -100.4, y: -50.6, w: 1800.2, h: 1100 })).toEqual({ x: -100, y: -51, w: 1800, h: 1100 });
    expect(normalizeCrop({ x: 0, y: 0, w: 3, h: 2 })).toEqual({ x: 0, y: 0, w: 16, h: 16 });
  });
  it('조절 계획: 새 크기, 좌표 이동(옛 크롭 → 새 크롭), 보드 위치는 같은 자리(사진 px 당 보드 px 유지)', () => {
    // 처음(원본 그대로)에서 위·왼쪽을 100px 잘라내고 오른쪽은 200px 늘린다
    const plan = adjustPlan(photo, { x: 100, y: 100, w: 1700, h: 900 }, 1.2);
    expect(plan.w).toBe(1700); expect(plan.h).toBe(900);
    expect(plan.shift).toEqual([-100, -100]);
    expect(plan.width).toBeCloseTo(850); // 800 × 1700/1600
    expect(plan.x).toBeCloseTo(150); expect(plan.y).toBeCloseTo(100); // 100px 잘라낸 만큼 오른쪽·아래로 (0.5 보드px/사진px)
    expect(plan.source).toEqual({ assetId: 'A', w: 1600, h: 1000, crop: { x: 100, y: 100, w: 1700, h: 900 }, brightness: 1.2 });
  });
  it('다시 조절하면 원본 기준: 이동 = 옛 크롭 − 새 크롭', () => {
    const once = { ...photo, w: 1700, h: 900, source: { assetId: 'A', w: 1600, h: 1000, crop: { x: 100, y: 100, w: 1700, h: 900 }, brightness: 1.2 } };
    const plan = adjustPlan(once, { x: 0, y: 0, w: 1600, h: 1000 }, 1);
    expect(plan.shift).toEqual([100, 100]);
    expect(plan.w).toBe(1600);
    expect(sourceOf(once)).toEqual(once.source);
    expect(sourceOf(photo)).toEqual({ assetId: 'A', w: 1600, h: 1000, crop: { x: 0, y: 0, w: 1600, h: 1000 }, brightness: 1 });
  });
  it('원본 그대로(크롭 = 원본, 밝기 1)로 돌아오면 source 를 지운다', () => {
    const once = { ...photo, source: { assetId: 'A', w: 1600, h: 1000, crop: { x: 100, y: 100, w: 1700, h: 900 }, brightness: 1.2 } };
    expect(adjustPlan(once, { x: 0, y: 0, w: 1600, h: 1000 }, 1).source).toBeUndefined();
  });
});

describe('사진 교체 (같은 자리에서 다시 찍은 사진)', () => {
  it('새 사진 px 로 좌표를 비율대로(가로 기준 한 배율), 보드 폭은 그대로, 조절(source)은 지운다', () => {
    const plan = replacePlan({ ...photo, source: { assetId: 'A', w: 1600, h: 1000, crop: { x: 0, y: 0, w: 1600, h: 1000 }, brightness: 1.3 } }, 'B', 3200, 2000);
    expect(plan.scale).toBe(2);
    expect(plan.map([10, 20])).toEqual([20, 40]);
    expect(plan.patch).toEqual({ assetId: 'B', w: 3200, h: 2000, source: undefined });
  });
  it('가로세로 비율이 다르면 알려 준다 (좌표는 가로 배율로만)', () => {
    expect(replacePlan(photo, 'B', 1600, 1000).aspectDiffers).toBe(false);
    expect(replacePlan(photo, 'B', 1000, 1600).aspectDiffers).toBe(true);
  });
});
