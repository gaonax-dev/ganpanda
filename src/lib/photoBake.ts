// 이미지 조절 굽기 (2026-10-21 "이미지 조절(크롭(크게도 가능하게),밝기)"): 원본 에셋을 크롭·밝기대로 새 그림으로. 원본 밖은 흰 여백.
// 좌표 체계는 core/photoEdit.ts — 여기는 픽셀만 만든다
import type { PhotoSource } from './core/model';

export const PAD_COLOR = '#ffffff';

/** 원본 그림(url)을 source 의 크롭·밝기로 구워 JPEG Blob 으로 */
export async function bakePhoto(url: string, src: PhotoSource): Promise<Blob> {
  const blob = await (await fetch(url)).blob();
  const bmp = await createImageBitmap(blob, { imageOrientation: 'from-image' });
  try {
    const c = document.createElement('canvas');
    c.width = src.crop.w; c.height = src.crop.h;
    const g = c.getContext('2d')!;
    g.fillStyle = PAD_COLOR; g.fillRect(0, 0, c.width, c.height);
    const filterOk = 'filter' in g;
    if (filterOk && src.brightness !== 1) g.filter = `brightness(${src.brightness})`;
    g.drawImage(bmp, -src.crop.x, -src.crop.y);
    g.filter = 'none';
    if (!filterOk && src.brightness !== 1) brightenPixels(g, c.width, c.height, src.brightness); // 사파리 등 filter 없는 캔버스
    const out = await new Promise<Blob | null>((res) => c.toBlob(res, 'image/jpeg', 0.9));
    c.width = c.height = 0;
    if (!out) throw new Error('toBlob');
    return out;
  } finally { bmp.close(); }
}

function brightenPixels(g: CanvasRenderingContext2D, w: number, h: number, k: number) {
  const img = g.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) { d[i] = Math.min(255, d[i] * k); d[i + 1] = Math.min(255, d[i + 1] * k); d[i + 2] = Math.min(255, d[i + 2] * k); }
  g.putImageData(img, 0, 0);
}
