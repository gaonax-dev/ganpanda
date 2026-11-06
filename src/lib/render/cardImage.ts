// 사인물 카드의 최종 이미지 (2026-11-06 정의 "보내기는 위의 순서로 최종(3d제외) 이미지로 보낸다"): 디자인 탭 카드와 같은 층(core/cardLayers 'final') —
// 디자인이 있으면 대지 이미지, 없으면 실측 사진 위 2D 속성 내용(바탕색·구성 요소). 일러스트 "받은 이미지" 레이어로 → docs/features/design-sync.md
import { app } from '../state.svelte';
import { assetUrl } from '../assets';
import { faceUrl } from '../photoDisplay';
import { bodyLook } from '../core/render';
import { cardLayers } from '../core/cardLayers';
import { layoutParts } from '../core/partsLayout';
import { itemAssetId } from './itemImages';
import { drawFaceItem } from './faceDraw';
import type { SignObject } from '../core/model';

/** 그림 긴 변 (px) */
export const CARD_IMAGE_LONG = 1600;
const load = (src: string) => new Promise<HTMLImageElement>((ok, no) => { const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => ok(i); i.onerror = no; i.src = src; });

/** w·h = 사인물 mm. 그린 것이 없으면 null */
export async function cardFinalPng(o: SignObject, w: number, h: number, long = CARD_IMAGE_LONG): Promise<Blob | null> {
  const k = long / Math.max(w, h, 1);
  const cw = Math.max(1, Math.round(w * k)), ch = Math.max(1, Math.round(h * k));
  const c = document.createElement('canvas');
  c.width = cw; c.height = ch;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  const L = cardLayers('final', !!o.design);
  let drawn = false;
  const ph = app.photos.find((x) => x.id === o.photoId);
  if (L.photo && ph && o.quad.length === 4) {
    const f = await faceUrl(ph.assetId, ph.w, o.quad, w, h, long);
    const img = f ? await load(f).catch(() => undefined) : undefined;
    if (img) { ctx.drawImage(img, 0, 0, cw, ch); drawn = true; }
  }
  if (L.design && o.design) {
    const page = app.sources.find((s) => s.id === o.design!.sourceId)?.pages[o.design.page];
    const u = page && (await assetUrl(page.assetId));
    const img = u ? await load(u).catch(() => undefined) : undefined;
    if (page && img) {
      const kx = img.naturalWidth / page.w, ky = img.naturalHeight / page.h, cr = o.design.crop;
      ctx.drawImage(img, cr.x * kx, cr.y * ky, cr.w * kx, cr.h * ky, 0, 0, cw, ch);
      drawn = true;
    }
  }
  if (L.fill) {
    const look = bodyLook(o);
    if (look) { ctx.globalAlpha = look.opacity; ctx.fillStyle = look.color; ctx.fillRect(0, 0, cw, ch); ctx.globalAlpha = 1; drawn = true; }
  }
  if (L.parts) {
    if (typeof document !== 'undefined' && document.fonts) await document.fonts.load('700 32px Pretendard').catch(() => undefined);
    for (const l of layoutParts(o, w, h, cw, ch)) {
      const id = l.kind === 'image' && l.image ? itemAssetId(l.image, app.sources) : undefined;
      const u = id ? await assetUrl(id) : undefined;
      const img = u ? await load(u).catch(() => undefined) : undefined;
      if (l.kind === 'image' && !img) continue;
      drawFaceItem(ctx, l, l.x, l.y, l.w, l.h, img, 'Pretendard, sans-serif', 700);
      drawn = true;
    }
  }
  if (!drawn) { c.width = c.height = 0; return null; }
  const b = await new Promise<Blob | null>((ok) => c.toBlob(ok, 'image/png'));
  c.width = c.height = 0;
  return b;
}
