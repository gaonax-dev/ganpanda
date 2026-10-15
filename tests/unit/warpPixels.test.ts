import { describe, expect, it } from 'vitest';
import { displaySize, warpPixels } from '../../src/lib/core/warpPixels';
import { rectToQuad } from '../../src/lib/core/perspective';

describe('카드 얼굴을 작은 그림으로 (휴대폰 메모리, 2026-10-15)', () => {
  it('사진 표시 크기: 긴 변을 max 로 줄이고 작으면 그대로', () => {
    expect(displaySize(4032, 3024, 2048)).toEqual({ w: 2048, h: 1536 });
    expect(displaySize(3024, 4032, 2048)).toEqual({ w: 1536, h: 2048 });
    expect(displaySize(1600, 1000, 2048)).toEqual({ w: 1600, h: 1000 });
  });
  it('사각 영역을 정면 직사각형으로 펼친다 (출력 픽셀 → 원본 픽셀, 최근접)', () => {
    // 4×4 원본: 왼쪽 위 2×2 빨강, 나머지 검정
    const src = { width: 4, height: 4, data: new Uint8ClampedArray(4 * 4 * 4) };
    for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) { const i = (y * 4 + x) * 4; src.data[i] = 255; src.data[i + 3] = 255; }
    // 영역 = 왼쪽 위 2×2 → 출력 4×2 전부 빨강
    const H = rectToQuad(4, 2, [[0, 0], [2, 0], [2, 2], [0, 2]]);
    const out = warpPixels(src, H, 4, 2);
    expect(out.length).toBe(4 * 2 * 4);
    for (let i = 0; i < 8; i++) { expect(out[i * 4]).toBe(255); expect(out[i * 4 + 3]).toBe(255); }
    // 영역 밖을 가리키는 픽셀은 투명
    const H2 = rectToQuad(2, 2, [[3, 3], [6, 3], [6, 6], [3, 6]]);
    const out2 = warpPixels(src, H2, 2, 2);
    expect(out2[3 * 4 + 3]).toBe(0);
  });
});
