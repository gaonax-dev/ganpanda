// 보드·리스트 표시용 사진: 긴 변을 줄인 사본(blob URL)과 평면도 카드 얼굴(작은 그림). 원본은 렌더링·원근 창에서만 쓴다.
// 휴대폰에서 12MP 사진 여러 장 + 카드마다 원본을 matrix3d 로 겹치던 것이 메모리를 넘겨 탭이 죽던 문제 (2026-10-15)
import { assetUrl } from './assets';
import { displaySize, warpPixels } from './core/warpPixels';
import { rectToQuad } from './core/perspective';
import type { Pt } from './core/homography';

const isPhone = () => typeof matchMedia === 'function' && matchMedia('(max-width: 720px), (pointer: coarse)').matches;
/** 표시용 긴 변 (휴대폰 1600, 그 외 2400) */
export const displayMax = () => (isPhone() ? 1600 : 2400);

const loadImage = (url: string) => new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
const toBlobUrl = (c: HTMLCanvasElement) => new Promise<string>((res, rej) => c.toBlob((b) => (b ? res(URL.createObjectURL(b)) : rej(new Error('toBlob'))), 'image/jpeg', 0.85));

const displayCache = new Map<string, Promise<string | undefined>>();
/** 줄인 사진 URL (한 장씩 차례로 만들어 동시에 원본 여러 장을 풀지 않는다) */
let queue: Promise<unknown> = Promise.resolve();
export function displayUrl(assetId: string): Promise<string | undefined> {
  let p = displayCache.get(assetId);
  if (!p) {
    p = (queue = queue.then(async () => {
      const url = await assetUrl(assetId);
      if (!url) return undefined;
      const img = await loadImage(url);
      const s = displaySize(img.naturalWidth, img.naturalHeight, displayMax());
      if (s.w === img.naturalWidth) return url;
      const c = document.createElement('canvas');
      c.width = s.w; c.height = s.h;
      c.getContext('2d')!.drawImage(img, 0, 0, s.w, s.h);
      img.src = ''; // 원본 해제
      const out = await toBlobUrl(c);
      c.width = c.height = 0;
      return out;
    }).catch(() => undefined)) as Promise<string | undefined>;
    displayCache.set(assetId, p);
  }
  return p;
}

/** 줄인 사진의 픽셀 (카드 얼굴을 만들 때만, 최근 1장만 들고 있음) */
let pixels: { assetId: string; data: Promise<ImageData | null> } | null = null;
function pixelsOf(assetId: string): Promise<ImageData | null> {
  if (pixels?.assetId === assetId) return pixels.data;
  const data = (async () => {
    const url = await displayUrl(assetId);
    if (!url) return null;
    const img = await loadImage(url);
    const c = document.createElement('canvas');
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    const g = c.getContext('2d', { willReadFrequently: true })!;
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height);
    c.width = c.height = 0;
    return d;
  })().catch(() => null);
  pixels = { assetId, data };
  return data;
}

const faceCache = new Map<string, Promise<string | undefined>>();
/**
 * 평면도 카드 얼굴: 사진 영역(quad, 원본 px)을 정면 직사각형(비율 w:h)으로 펼친 작은 그림(긴 변 ≤ max px)
 * photo.w = 원본 폭 (줄인 사진과의 배율 계산용)
 */
export function faceUrl(assetId: string, photoW: number, quad: Pt[], w: number, h: number, max = 360): Promise<string | undefined> {
  const out = displaySize(w, h, max);
  const ow = Math.max(1, out.w), oh = Math.max(1, out.h);
  const key = `${assetId}|${photoW}|${quad.map((p) => p.map((v) => Math.round(v)).join(',')).join(';')}|${ow}x${oh}`;
  let p = faceCache.get(key);
  if (!p) {
    p = (queue = queue.then(async () => {
      const src = await pixelsOf(assetId);
      if (!src) return undefined;
      const k = src.width / photoW;
      let H: number[];
      try { H = rectToQuad(ow, oh, quad.map(([x, y]) => [x * k, y * k] as Pt)); } catch { return undefined; }
      const c = document.createElement('canvas');
      c.width = ow; c.height = oh;
      c.getContext('2d')!.putImageData(new ImageData(warpPixels(src, H, ow, oh) as Uint8ClampedArray<ArrayBuffer>, ow, oh), 0, 0);
      return await toBlobUrl(c);
    }).catch(() => undefined)) as Promise<string | undefined>;
    faceCache.set(key, p);
  }
  return p;
}
