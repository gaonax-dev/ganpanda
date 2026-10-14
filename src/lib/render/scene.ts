// 화면 없이 사진 한 장을 3D 합성해 PNG 로 (제안 이미지 만들기). RenderDialog 와 같은 규칙
import type { Font } from 'opentype.js';
import type { DesignSource, Photo, SignObject } from '../core/model';
import { renderSpecOf } from '../core/render';
import { placeOnWall, poseOfPlane, type WallPlane } from '../core/wallPlane';
import { Viewer } from '../sim/viewer';
import { buildChannel, buildLightbox, type BuiltSign, type FaceImage } from '../sim/signs';
import { assetUrl } from '../assets';

const loadImage = (url: string) => new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });

async function faceOf(o: SignObject, sources: DesignSource[]): Promise<FaceImage | undefined> {
  const d = o.design;
  const page = d && sources.find((s) => s.id === d.sourceId)?.pages[d.page];
  if (!d || !page) return undefined;
  const url = await assetUrl(page.assetId);
  if (!url) return undefined;
  const image = await loadImage(url);
  const kx = image.width / page.w, ky = image.height / page.h;
  return { image, sx: d.crop.x * kx, sy: d.crop.y * ky, sw: d.crop.w * kx, sh: d.crop.h * ky };
}

/** 사진 + 벽면 + 사인물 → 주간·야간 PNG 데이터 URL. 격자는 끈다 */
export async function renderPhotoPngs(photo: Photo, objects: SignObject[], plane: WallPlane, sources: DesignSource[], font: Font): Promise<{ day: string; night: string }> {
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-10000px;top:0;width:800px;height:600px;';
  document.body.appendChild(host);
  const v = new Viewer(host);
  const built: BuiltSign[] = [];
  try {
    v.showGrid(false);
    const k = Math.min(800 / photo.w, 600 / photo.h);
    v.resize(Math.max(1, Math.floor(photo.w * k)), Math.max(1, Math.floor(photo.h * k)));
    const url = await assetUrl(photo.assetId);
    if (!url) throw new Error('photo asset missing');
    v.setPhoto(await loadImage(url));
    const placed = objects.map((o) => ({ o, at: placeOnWall(plane, o) }));
    const maxX = Math.max(1000, ...placed.map((x) => x.at.cx + x.at.w / 2));
    const maxY = Math.max(1000, ...placed.map((x) => x.at.cy + x.at.h / 2));
    v.applyPose(poseOfPlane(plane, photo.w, photo.h), maxX, maxY);
    for (const { o, at } of placed) {
      const spec = renderSpecOf(o, at);
      if (!spec) continue;
      const face = spec.kind === 'lightbox' ? await faceOf(o, sources) : undefined;
      const b = spec.kind === 'channel' ? buildChannel(spec, font) : buildLightbox(spec, 'Pretendard, sans-serif', face);
      b.group.position.set(spec.x, spec.y, 0);
      v.signsRoot.add(b.group);
      built.push(b);
    }
    v.setNight(false); for (const b of built) b.setNight(false);
    const day = v.exportPng(photo.w, photo.h);
    v.setNight(true); for (const b of built) b.setNight(true);
    const night = v.exportPng(photo.w, photo.h);
    return { day, night };
  } finally {
    for (const b of built) b.dispose();
    v.renderer.dispose();
    host.remove();
  }
}

export async function dataUrlToBlob(url: string): Promise<Blob> {
  return (await fetch(url)).blob();
}
