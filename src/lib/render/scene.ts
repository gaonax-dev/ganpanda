// 화면 없이 사진 한 장을 3D 합성해 PNG 로 (제안 이미지 만들기). RenderDialog 와 같은 규칙
import type { Font } from 'opentype.js';
import type { DesignSource, Photo, SignObject } from '../core/model';
import { fitScale, renderSpecOf } from '../core/render';
import { placeOnWall, poseOfPlane, projectionFromPlane, quadOnWall, signPlaneOf, sizedAt, boxLocalDirOf, zTowardCamera, type WallPlane } from '../core/wallPlane';
import { Viewer } from '../sim/viewer';
import { buildLightbox, buildSign, orientBox, recessBox, warpToQuad, type BuiltSign, type FaceImage } from '../sim/signs';
import { assetUrl } from '../assets';
import { loadItemImages } from './itemImages';

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

/** 뷰어 하나에 사진·사인물을 올린다 (호출자가 뷰어를 재사용하거나 버린다). designs=false 면 디자인 이미지를 입히지 않아 가볍다 */
async function buildScene(v: Viewer, photo: Photo, objects: SignObject[], plane: WallPlane, sources: DesignSource[], font: Font, opts: { designs: boolean; maxW: number; maxH: number }): Promise<BuiltSign[]> {
  const built: BuiltSign[] = [];
  v.showGrid(false);
  v.clearSignCameras();
  const k = Math.min(opts.maxW / photo.w, opts.maxH / photo.h, 1);
  v.resize(Math.max(1, Math.floor(photo.w * k)), Math.max(1, Math.floor(photo.h * k)));
  const url = await assetUrl(photo.assetId);
  if (!url) throw new Error('photo asset missing');
  v.setPhoto(await loadImage(url));
  const placed = objects.map((o) => { const own = plane ? (signPlaneOf(o, plane) ?? plane) : plane; /* 원근에 맞는 사인물은 원근 설정의 각도 우선 */ return { o, plane: own, at: placeOnWall(own, o) }; });
  const maxX = Math.max(1000, ...placed.map((x) => x.at.cx + x.at.w / 2));
  const maxY = Math.max(1000, ...placed.map((x) => x.at.cy + x.at.h / 2));
  v.applyProjection(projectionFromPlane(plane, photo.w, photo.h), poseOfPlane(plane, photo.w, photo.h), maxX, maxY);
  for (const { o, plane: own, at } of placed) {
    const spec = renderSpecOf(o, sizedAt(o, at, plane)); // 사인물 자체 크기는 정면 축과 무관 (2026-10-15)
    if (!spec) continue;
    const face = opts.designs && spec.kind === 'lightbox' ? await faceOf(o, sources) : undefined;
    const images = opts.designs && spec.faceItems ? await loadItemImages(o, sources) : undefined;
    let b: BuiltSign;
    try { b = buildSign(spec, font, 'Pretendard, sans-serif', face, images); }
    catch { try { b = buildLightbox({ ...spec, kind: 'lightbox', text: '' }, 'Pretendard, sans-serif'); } catch { continue; } } // 실패한 사인물은 상자로, 그래도 안 되면 건너뜀
    if (spec.kind === 'lightbox' && !spec.bodyless) recessBox(b.group, spec.depthMm); // 외곽선 = 앞면: 바탕은 뒤로, 글자는 앞으로 (2026-10-17)
    const corners = quadOnWall(own, o) as [number, number][];
    warpToQuad(b.group, spec.widthMm, spec.heightMm, corners, spec.kind === 'channel' ? fitScale(b.measured.widthMm, spec.widthMm) : 1);
    // 박스 방향으로 (정면 축·회전 고리, 2026-10-15). 없으면 법선 — 원근 카메라의 +z 가 벽 안쪽이면 뒤집어 앞면이 카메라를 보게
    orientBox(b.group, boxLocalDirOf(o, own, plane, photo.w, photo.h), zTowardCamera(projectionFromPlane(own, photo.w, photo.h), [spec.x, spec.y]) < 0);
    v.signsRoot.add(b.group);
    v.addSignCamera(b.group, projectionFromPlane(own, photo.w, photo.h), poseOfPlane(own, photo.w, photo.h), corners);
    built.push(b);
  }
  return built;
}

const hiddenHost = () => { const host = document.createElement('div'); host.style.cssText = 'position:fixed;left:-10000px;top:0;width:800px;height:600px;'; document.body.appendChild(host); return host; };

/** 사진 + 벽면 + 사인물 → 주간·야간 PNG 데이터 URL (제안 이미지, 디자인 포함). 격자는 끈다 */
export async function renderPhotoPngs(photo: Photo, objects: SignObject[], plane: WallPlane, sources: DesignSource[], font: Font): Promise<{ day: string; night: string }> {
  const host = hiddenHost();
  const v = new Viewer(host);
  let built: BuiltSign[] = [];
  try {
    built = await buildScene(v, photo, objects, plane, sources, font, { designs: true, maxW: 800, maxH: 600 });
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

/**
 * 보드 **3D 단계**용 합성기 (2026-10-15 사용자: "3D 는 화면에 바로 올리고, 렌더링은 사진마다"): WebGL 뷰어 하나를 켜 둔 채 사진들을 차례로 그려
 * 주간 PNG 만 만든다. 디자인 이미지는 입히지 않고(가볍게) 사진 긴 변 ≤ 640px 로 — 사진마다 뷰어를 새로 만들지 않아 부하가 작다. 단계를 나가면 dispose
 */
export class StageRenderer {
  private host: HTMLDivElement | null = null;
  private viewer: Viewer | null = null;
  async render(photo: Photo, objects: SignObject[], plane: WallPlane, sources: DesignSource[], font: Font): Promise<string> {
    if (!this.viewer) { this.host = hiddenHost(); this.viewer = new Viewer(this.host); }
    const v = this.viewer;
    let built: BuiltSign[] = [];
    try {
      built = await buildScene(v, photo, objects, plane, sources, font, { designs: false, maxW: 640, maxH: 480 });
      v.setNight(false); for (const b of built) b.setNight(false);
      return v.exportPng(Math.min(photo.w, 1280), Math.min(photo.w, 1280) * (photo.h / photo.w));
    } finally {
      for (const b of built) { b.group.removeFromParent(); b.dispose(); }
    }
  }
  dispose() {
    this.viewer?.renderer.dispose();
    this.host?.remove();
    this.viewer = null; this.host = null;
  }
}

export async function dataUrlToBlob(url: string): Promise<Blob> {
  return (await fetch(url)).blob();
}
