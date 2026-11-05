// 3D 단계 저장 그림 크기 (2026-11-05 사용자: "확대할때 3d 업데이트 안되서 깍두기 보임" → "맥앱에서만 그런거 같은데"):
// 실시간 3D 가 준비되기 전에는 저장된 합성 그림이 보인다 — 긴 변 1280 이라 10배 확대에서 계단. 데스크톱은 2560 (원본보다 크게는 안 함)
import { describe, expect, it } from 'vitest';
import { STAGE_EXPORT_LONG, stageExportSize } from '../../src/lib/render/stageSize';

describe('stageExportSize', () => {
  it('긴 변 2560, 비율 그대로, 원본보다 크게는 안 함', () => {
    expect(STAGE_EXPORT_LONG).toBe(2560);
    expect(stageExportSize(3200, 2400)).toEqual({ w: 2560, h: 1920 });
    expect(stageExportSize(2400, 3200)).toEqual({ w: 1920, h: 2560 });
    expect(stageExportSize(1000, 750)).toEqual({ w: 1000, h: 750 });
  });
});
