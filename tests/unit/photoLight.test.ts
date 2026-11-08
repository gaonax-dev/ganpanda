// 기본 조명은 사진 밝기에 맞춘다 (2026-11-09 사용자: "기본 라이팅이 사진의 밝기와 연동되어야하는 것도 필요하다")
import { describe, expect, it } from 'vitest';
import { photoLightScale } from '../../src/lib/core/render';

describe('photoLightScale — 사진 평균 밝기(0~1) → 주간 조명 배율', () => {
  it('보통 밝기(0.5)의 사진은 1', () => expect(photoLightScale(0.5)).toBeCloseTo(1, 5));
  it('어두운 사진은 조명을 줄이고, 밝은 사진은 조금 올린다', () => {
    expect(photoLightScale(0.25)).toBeLessThan(0.75);
    expect(photoLightScale(0.7)).toBeGreaterThan(1.1);
  });
  it('너무 어둡거나 밝아도 범위 안 (0.4 ~ 1.3)', () => {
    expect(photoLightScale(0)).toBe(0.4);
    expect(photoLightScale(1)).toBe(1.3);
    expect(photoLightScale(Number.NaN)).toBe(1);
  });
});
