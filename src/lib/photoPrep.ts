// 올리기 전 사진 줄이기 (2026-10-17 사용자: "이미지가 기기에서 오는데 오래 걸리거나 모바일에서는 누락되는 경우도 있다").
// 휴대폰 사진(12MP, 3~6MB)을 그대로 올리면 다른 기기가 받는 데 오래 걸린다. 긴 변 UPLOAD_MAX px 로 줄여 올린다 —
// 사진 좌표(영역·축 선)는 올린 에셋의 px 기준이라 올리기 전에만 줄이면 일관된다. EXIF 회전은 createImageBitmap 이 적용한다
import { displaySize } from './core/warpPixels';

/** 올리는 사진의 긴 변 상한 (px). 실측·3D 합성에 충분하고 용량은 1/3 수준 */
export const UPLOAD_MAX = 3200;

/** 줄인 크기 (이미 작으면 그대로) */
export const uploadSize = (w: number, h: number, max = UPLOAD_MAX) => displaySize(w, h, max);

/** 사진 파일을 올릴 크기로. 그림이 아니거나 이미 작거나 줄이기에 실패하면 원본 그대로 */
export async function prepareUpload(file: File | Blob): Promise<Blob> {
  if (!file.type.startsWith('image/') || typeof createImageBitmap !== 'function') return file;
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const s = uploadSize(bmp.width, bmp.height);
    if (s.w === bmp.width && s.h === bmp.height && file.type !== 'image/heic') { bmp.close(); return file; }
    const c = document.createElement('canvas');
    c.width = s.w; c.height = s.h;
    c.getContext('2d')!.drawImage(bmp, 0, 0, s.w, s.h);
    bmp.close();
    const out = await new Promise<Blob | null>((res) => c.toBlob(res, 'image/jpeg', 0.9));
    c.width = c.height = 0;
    return out ?? file;
  } catch { return file; }
}
