// 화면 없이 사진 한 장을 3D 합성해 PNG 로 (제안 이미지 만들기). RenderDialog 와 같은 규칙
import type { Font } from 'opentype.js';
import type { DesignSource, Photo, SignObject } from '../core/model';
import { fitScale, renderSpecOf } from '../core/render';
import { placeOnWall, poseOfPlane, projectionFromPlane, quadOnWall, wallPlaneOf, type WallPlane } from '../core/wallPlane';
import { Viewer } from '../sim/viewer';
import { buildLightbox, buildSign, warpToQuad, type BuiltSign, type FaceImage } from '../sim/signs';
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
    const placed = objects.map((o) => { const own = plane ? (wallPlaneOf([o], null) ?? plane) : plane; return { o, plane: own, at: placeOnWall(own, o) }; });
    const maxX = Math.max(1000, ...placed.map((x) => x.at.cx + x.at.w / 2));
    const maxY = Math.max(1000, ...placed.map((x) => x.at.cy + x.at.h / 2));
    v.applyProjection(projectionFromPlane(plane, photo.w, photo.h), poseOfPlane(plane, photo.w, photo.h), maxX, maxY);
    for (const { o, plane: own, at } of placed) {
      const spec = renderSpecOf(o, at);
      if (!spec) continue;
      const face = spec.kind === 'lightbox' ? await faceOf(o, sources) : undefined;
      let b: BuiltSign;
      try { b = buildSign(spec, font, 'Pretendard, sans-serif', face); }
      catch { try { b = buildLightbox({ ...spec, kind: 'lightbox', text: '' }, 'Pretendard, sans-serif'); } catch { continue; } } // 실패한 사인물은 상자로, 그래도 안 되면 건너뜀
      const corners = quadOnWall(own, o) as [number, number][];
      warpToQuad(b.group, spec.widthMm, spec.heightMm, corners, spec.kind === 'channel' ? fitScale(b.measured.widthMm, spec.widthMm) : 1);
      v.signsRoot.add(b.group);
      v.addSignCamera(b.group, projectionFromPlane(own, photo.w, photo.h), poseOfPlane(own, photo.w, photo.h), corners);
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
