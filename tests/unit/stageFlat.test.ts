// 3D 로 바꿀 필요가 없는 사진 (2026-10-29 사용자: "시트처럼 2d인 경우는 3d로 변환할 이유가 없다")
import { describe, expect, it } from 'vitest';
import { needs3d } from '../../src/lib/core/stageFlat';

const q = [[0, 0], [10, 0], [10, 5], [0, 5]];
describe('사진에 3D 로 그릴 사인물이 있는가', () => {
  it('시트·현수막뿐이면 없음, 간판(몸통)·채널·스카시가 하나라도 있으면 있음', () => {
    expect(needs3d([{ quad: q, sheetIds: ['sh-cut'] }])).toBe(false); // 시트
    expect(needs3d([{ quad: q, sheetIds: [], productId: 'banner' }])).toBe(false); // 현수막
    expect(needs3d([{ quad: q, sheetIds: ['sh-print'] }, { quad: q, sheetIds: [], productId: 'board-flex' }])).toBe(true);
    expect(needs3d([{ quad: q, sheetIds: [], productId: 'ch-scashi' }])).toBe(true); // 스카시 = 입체
    expect(needs3d([])).toBe(false);
  });
  it('분류가 없는 사인물(외곽선만)은 3D 로 그리지 않는다', () => {
    expect(needs3d([{ quad: q, sheetIds: [] }])).toBe(false);
  });
});
