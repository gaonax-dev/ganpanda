// 휴대폰 메모리 줄이기 (2026-10-15 사용자: "마지막에 죽어버린다. 사진이 많아서인지"):
// 사진은 긴 변을 줄여 보여 주고, 평면도 카드 얼굴은 원본 전체를 matrix3d 로 겹치는 대신 작은 그림으로 펼쳐 둔다
import { applyHomography } from './homography';

export function displaySize(w: number, h: number, max: number): { w: number; h: number } {
  const k = Math.min(1, max / Math.max(w, h));
  return { w: Math.round(w * k), h: Math.round(h * k) };
}

/** 출력(outW×outH) 각 픽셀을 H(출력 px → 원본 px)로 원본에서 가져온다 (최근접). 원본 밖은 투명 */
export function warpPixels(src: { width: number; height: number; data: Uint8ClampedArray }, H: number[], outW: number, outH: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(outW * outH * 4);
  for (let y = 0; y < outH; y++) {
    for (let x = 0; x < outW; x++) {
      const [sx, sy] = applyHomography(H, [x + 0.5, y + 0.5]);
      const ix = Math.floor(sx), iy = Math.floor(sy);
      if (ix < 0 || iy < 0 || ix >= src.width || iy >= src.height) continue;
      const si = (iy * src.width + ix) * 4, oi = (y * outW + x) * 4;
      out[oi] = src.data[si]; out[oi + 1] = src.data[si + 1]; out[oi + 2] = src.data[si + 2]; out[oi + 3] = src.data[si + 3];
    }
  }
  return out;
}
