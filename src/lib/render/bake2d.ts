// 2D 원근 그림(인쇄 글자·그림·도형, 입힌 디자인)을 그림 한 장으로 굽는다 (2026-10-29 사용자: "아이폰앱에서 2d에서 줌인 줌아웃을 하면 에러" → 핀볼 확인)
// 전엔 글자·디자인을 DOM(svg·배경 그림)으로 그려 matrix3d 로 겹쳤다 — 3D 변환 층은 쪼개 그리지(타일) 못해 확대 배율만큼 큰 그림으로 다시 그려
// 핀볼 2D 20개 층이 12배에서 화면 9,499px 짜리가 되며 아이폰 웹뷰가 멈췄다. 구운 그림(<img>)에 변환을 걸면 브라우저는 그림을 그대로 늘려 쓴다(메모리 그대로).
// 내용이 같으면 다시 굽지 않는다(LOD — 같은 모양이라 바뀌는 순간이 보이지 않음)
import type { LaidItem } from '../core/partsLayout';
import { drawFaceItem } from './faceDraw';

/** 구운 그림의 긴 변 최대 (px) — 표시 크기의 2배까지, 이보다 크게는 굽지 않는다 */
export const BAKE_MAX = 1024;
const cache = new Map<string, Promise<string | undefined>>();
const load = (src: string) => new Promise<HTMLImageElement>((ok, no) => { const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => ok(i); i.onerror = no; i.src = src; });
let fontsReady: Promise<unknown> | null = null;
const fonts = () => (fontsReady ??= typeof document !== 'undefined' && document.fonts ? Promise.all([document.fonts.load('700 32px Pretendard'), document.fonts.ready]).catch(() => undefined) : Promise.resolve());

/** 표시 w×h 를 몇 배로 구울지 */
export function bakeScale(w: number, h: number): number { return Math.max(0.1, Math.min(2, BAKE_MAX / Math.max(w, h, 1))); }

function remember(key: string, make: () => Promise<Blob | null>): Promise<string | undefined> {
  let p = cache.get(key);
  if (!p) {
    p = make().then((b) => (b ? URL.createObjectURL(b) : undefined)).catch(() => undefined);
    cache.set(key, p);
    p.then((u) => { if (!u) cache.delete(key); });
  }
  return p;
}
const toPng = (c: HTMLCanvasElement) => new Promise<Blob | null>((ok) => c.toBlob(ok, 'image/png'));

/** 배치된 글자·그림·도형 (표시 w×h 기준 좌표) → 투명 PNG */
export function bakeParts(key: string, laid: LaidItem[], w: number, h: number, urlOf: (l: LaidItem) => string | undefined): Promise<string | undefined> {
  return remember(`p|${key}`, async () => {
    await fonts();
    const k = bakeScale(w, h);
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w * k)); c.height = Math.max(1, Math.round(h * k));
    const ctx = c.getContext('2d')!;
    for (const l of laid) {
      const u = l.kind === 'image' ? urlOf(l) : undefined;
      const img = u ? await load(u).catch(() => undefined) : undefined;
      if (l.kind === 'image' && !img) continue;
      drawFaceItem(ctx, l, l.x * k, l.y * k, l.w * k, l.h * k, img, 'Pretendard, sans-serif', 700); // 2D(svg) 와 같은 굵기
    }
    const b = await toPng(c);
    c.width = c.height = 0;
    return b;
  });
}

/** 디자인 페이지의 잘라낸 영역 → w×h 그림 */
export function bakeDesign(key: string, pageUrl: string, crop: { x: number; y: number; w: number; h: number }, pageW: number, pageH: number, w: number, h: number): Promise<string | undefined> {
  return remember(`d|${key}`, async () => {
    const img = await load(pageUrl);
    const kx = img.naturalWidth / pageW, ky = img.naturalHeight / pageH;
    const k = bakeScale(w, h);
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w * k)); c.height = Math.max(1, Math.round(h * k));
    const ctx = c.getContext('2d')!;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, crop.x * kx, crop.y * ky, crop.w * kx, crop.h * ky, 0, 0, c.width, c.height);
    const b = await new Promise<Blob | null>((ok) => c.toBlob(ok, 'image/jpeg', 0.92));
    c.width = c.height = 0;
    return b;
  });
}
