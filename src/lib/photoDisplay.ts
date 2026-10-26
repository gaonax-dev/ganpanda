// 보드·리스트 표시용 사진: 긴 변을 줄인 사본(blob URL)과 평면도 카드 얼굴(작은 그림). 원본은 렌더링·원근 창에서만 쓴다.
// 휴대폰에서 12MP 사진 여러 장 + 카드마다 원본을 matrix3d 로 겹치던 것이 메모리를 넘겨 탭이 죽던 문제 (2026-10-15)
import { assetUrl } from './assets';
import { getDerived, putDerived } from './derivedImages';
import { displaySize, warpPixels } from './core/warpPixels';
import { rectToQuad } from './core/perspective';
import type { Pt } from './core/homography';

const isPhone = () => typeof matchMedia === 'function' && matchMedia('(max-width: 720px), (pointer: coarse)').matches;
/** 표시용 긴 변 (휴대폰 1600, 그 외 2400) */
export const displayMax = () => (isPhone() ? 1600 : 2400);

const loadImage = (url: string) => new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
const toJpeg = (c: HTMLCanvasElement) => new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('toBlob'))), 'image/jpeg', 0.85));

/** 줄인 크기로 디코딩 (2026-10-18 아이폰 크롬 "이 페이지를 열 수 없음" = 웹 프로세스 크래시 대응): 원본 크기를 알면 createImageBitmap 의 resize 옵션으로 작은 비트맵만 만든다 — 12MP 사진 한 장 통째 디코딩이 48MB.
 * 'original' = 이미 작음, null = 지원 안 함(옛 경로로) */
async function decodeSmall(url: string, size: { w: number; h: number }, max: number): Promise<Blob | 'original' | null> {
  if (typeof createImageBitmap !== 'function') return null;
  const s = displaySize(size.w, size.h, max);
  if (s.w >= size.w) return 'original';
  try {
    const blob = await (await fetch(url)).blob();
    const bmp = await createImageBitmap(blob, { resizeWidth: s.w, resizeHeight: s.h, resizeQuality: 'high' });
    if (bmp.width !== s.w) { bmp.close(); return null; } // resize 옵션을 무시하는 브라우저
    const c = document.createElement('canvas');
    c.width = s.w; c.height = s.h;
    c.getContext('2d')!.drawImage(bmp, 0, 0);
    bmp.close();
    const out = await toJpeg(c);
    c.width = c.height = 0;
    return out;
  } catch { return null; }
}

const displayCache = new Map<string, Promise<string | undefined>>();
/**
 * 줄인 사진 URL. 사진 줄이기와 카드 그림은 **대기열을 따로** 쓴다 — 같은 대기열이면 카드 작업이 사진 작업을 기다리며 서로 막혀
 * 사진이 영영 안 뜨던 문제(2026-10-15 운영: "핀볼 사진이 모두 사라졌다"). 실패하면 원본 URL 로, 실패는 기억하지 않는다
 */
let displayQueue: Promise<unknown> = Promise.resolve();
export function displayUrl(assetId: string, size?: { w: number; h: number }): Promise<string | undefined> {
  const cached = displayCache.get(assetId);
  if (cached) return cached;
  const key = `d|${assetId}|${displayMax()}`;
  const p = (async () => {
    // 기기에 만들어 둔 사본이 있으면 대기열·디코딩 없이 바로 (2026-10-27)
    const hit = await getDerived(key);
    if (hit) return 'original' in hit ? await assetUrl(assetId) : URL.createObjectURL(hit.blob);
    const job = displayQueue.then(() => makeDisplay(assetId, key, size));
    displayQueue = job.catch(() => undefined);
    return job;
  })().catch(() => undefined).then((u) => { if (!u) displayCache.delete(assetId); return u; });
  displayCache.set(assetId, p);
  return p;
}

/** 원본 → 줄인 사본 (만들면 기기에 저장, 줄일 필요 없으면 그것도 기억) */
async function makeDisplay(assetId: string, key: string, size?: { w: number; h: number }): Promise<string | undefined> {
  const url = await assetUrl(assetId);
  if (!url) return undefined;
  try {
    const small = size ? await decodeSmall(url, size, displayMax()) : null; // 크기를 알면 줄인 크기로만 디코딩
    if (small === 'original') { void putDerived(key, { original: true }); return url; }
    if (small) { void putDerived(key, { blob: small }); return URL.createObjectURL(small); }
    const img = await loadImage(url);
    const s = displaySize(img.naturalWidth, img.naturalHeight, displayMax());
    if (s.w === img.naturalWidth) { void putDerived(key, { original: true }); return url; }
    const c = document.createElement('canvas');
    c.width = s.w; c.height = s.h;
    c.getContext('2d')!.drawImage(img, 0, 0, s.w, s.h);
    const out = await toJpeg(c);
    c.width = c.height = 0;
    void putDerived(key, { blob: out });
    return URL.createObjectURL(out);
  } catch { return url; } // 줄이기 실패 → 원본 그대로 (기억하지 않는다)
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
let faceQueue: Promise<unknown> = Promise.resolve();
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
    const dkey = `f|${key}`;
    p = (async () => {
      const hit = await getDerived(dkey); // 기기에 만들어 둔 카드 얼굴 (2026-10-27)
      if (hit && 'blob' in hit) return URL.createObjectURL(hit.blob);
      const job = faceQueue.then(() => makeFace(assetId, photoW, quad, ow, oh, dkey));
      faceQueue = job.catch(() => undefined);
      return job;
    })().catch(() => undefined);
    faceCache.set(key, p);
    p.then((u) => { if (!u) faceCache.delete(key); });
  }
  return p;
}

async function makeFace(assetId: string, photoW: number, quad: Pt[], ow: number, oh: number, dkey: string): Promise<string | undefined> {
  const src = await pixelsOf(assetId);
  if (!src) return undefined;
  const k = src.width / photoW;
  let H: number[];
  try { H = rectToQuad(ow, oh, quad.map(([x, y]) => [x * k, y * k] as Pt)); } catch { return undefined; }
  const c = document.createElement('canvas');
  c.width = ow; c.height = oh;
  c.getContext('2d')!.putImageData(new ImageData(warpPixels(src, H, ow, oh) as Uint8ClampedArray<ArrayBuffer>, ow, oh), 0, 0);
  const blob = await toJpeg(c);
  void putDerived(dkey, { blob });
  return URL.createObjectURL(blob);
}
