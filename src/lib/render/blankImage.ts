// 빈(완전히 투명한) 그림인지 (2026-11-07 핀볼: 일러스트 좌표 문제로 받은 디자인 PNG 가 모두 투명이었다 — 넣어도 카드에 아무것도 안 보였다)
/** 긴 변 256px 로 줄여 그려 불투명한 픽셀이 하나도 없으면 true. 읽지 못하면 false(넣는다) */
export async function isBlankImage(blob: Blob): Promise<boolean> {
  try {
    const bmp = await createImageBitmap(blob);
    const k = Math.min(1, 256 / Math.max(bmp.width, bmp.height, 1));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(bmp.width * k)); c.height = Math.max(1, Math.round(bmp.height * k));
    const ctx = c.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(bmp, 0, 0, c.width, c.height);
    bmp.close();
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    c.width = c.height = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i] > 0) return false;
    return true;
  } catch { return false; }
}
