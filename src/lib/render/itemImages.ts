// 조합형 그림 객체의 그림을 불러온다 (3D 앞면·실사 합성, 2026-10-16 4단계). 디자인 파일 페이지 또는 직접 올린 그림
import type { DesignSource, SignObject } from '../core/model';
import { assetUrl } from '../assets';

const loadImage = (url: string) => new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });

/** 그림 객체의 에셋 id (디자인 파일이면 그 페이지 그림) */
export function itemAssetId(image: NonNullable<NonNullable<SignObject['parts']>[number]['items'][number]['image']>, sources: DesignSource[]): string | undefined {
  return 'assetId' in image ? image.assetId : sources.find((s) => s.id === image.sourceId)?.pages[image.page]?.assetId;
}

/** 객체 id → 이미지. 못 불러온 그림은 빠진다(앞면에 그리지 않음) */
export async function loadItemImages(o: SignObject, sources: DesignSource[]): Promise<Record<string, HTMLImageElement>> {
  const out: Record<string, HTMLImageElement> = {};
  await Promise.all((o.parts ?? []).flatMap((p) => p.items).map(async (it) => {
    const id = it.kind === 'image' && it.image ? itemAssetId(it.image, sources) : undefined;
    const url = id && (await assetUrl(id));
    if (!url) return;
    try { out[it.id] = await loadImage(url); } catch { /* 깨진 그림은 건너뜀 */ }
  }));
  return out;
}
