// 올리기 전 사진 줄이기 (2026-10-17 사용자: "이미지가 기기에서 오는데 오래 걸리거나 모바일에서는 누락되는 경우도 있다")
import { describe, expect, it } from 'vitest';
import { UPLOAD_MAX, uploadSize } from '../../src/lib/photoPrep';
import { DEFAULT_ENV, ENVIRONMENTS, envUrl } from '../../src/lib/sim/env';

describe('uploadSize: 긴 변 3200 으로, 작은 사진은 그대로', () => {
  it('4032×3024 → 3200×2400, 1600×1200 그대로, 세로 사진도', () => {
    expect(UPLOAD_MAX).toBe(3200);
    expect(uploadSize(4032, 3024)).toEqual({ w: 3200, h: 2400 });
    expect(uploadSize(1600, 1200)).toEqual({ w: 1600, h: 1200 });
    expect(uploadSize(3024, 4032)).toEqual({ w: 2400, h: 3200 });
  });
});
describe('환경맵 목록', () => {
  it('기본은 도심 거리, 파일은 /env/<id>.hdr', () => {
    expect(DEFAULT_ENV).toBe('konigsallee');
    expect(ENVIRONMENTS.map((e) => e.id)).toEqual(['konigsallee', 'pergola_walkway', 'bloem_olive_house']);
    expect(envUrl('konigsallee')).toBe('/env/konigsallee.hdr');
  });
});
