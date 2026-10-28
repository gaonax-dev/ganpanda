// 화면 없이 사진 한 장을 3D 합성해 PNG 로 (제안 이미지 만들기). RenderDialog 와 같은 규칙
import * as THREE from 'three';
import { releaseTextures } from './release';
import type { Font } from 'opentype.js';
import type { CameraPose } from '../core/homography';
import type { DesignSource, Photo, SignObject } from '../core/model';
import { fitScale, renderSpecOf } from '../core/render';
import { placeOnWall, poseOfPlane, projectionFromPlane, quadOnWall, signPlaneOf, sizedAt, boxLocalDirOf, zTowardCamera, type WallPlane } from '../core/wallPlane';
import { Viewer } from '../sim/viewer';
import { buildLightbox, buildSign, orientBox, recessBox, warpToQuad, type BuiltSign, type FaceImage } from '../sim/signs';
import { assetUrl } from '../assets';
import { displayUrl } from '../photoDisplay';
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
/** estOf: 치수를 넣지 않은 사인물의 추정 치수 — 글자·시트 면 축척에만 (2026-10-22 "3d에서 … 비정상적으로 커지는거") */
export type EstOf = (o: SignObject) => { w: number; h: number } | null;
/** 지어 둔 장면 (실시간 3D 가 사진마다 기억 — 2026-10-28 "진행해봐": 다시 가운데로 오면 바로) — 뷰어에 얹기 전 */
export interface PreparedScene {
  photo: Photo;
  tex: THREE.Texture;
  P: number[]; pose: CameraPose; maxX: number; maxY: number;
  signs: { b: BuiltSign; P: number[]; pose: CameraPose; corners: [number, number][] }[];
}
type SceneOpts = { designs: boolean; estOf?: EstOf; /** 앞면 그림 긴 변 픽셀 (실시간 3D 는 크게) */ texLong?: number; /** 디자인 그림을 이만큼만 기다린다(ms) — 실시간 3D 는 못 받은 그림 하나 때문에 장면이 멈추지 않게 */ assetWaitMs?: number };
/** 늦으면 없는 것으로 (2026-10-28 핀볼 사본: 못 받는 디자인 그림의 재시도 ~18초 동안 실시간 3D 장면 짓기 줄이 통째로 멈췄다) */
const within = <T>(p: Promise<T>, ms?: number): Promise<T | undefined> => (ms !== undefined ? Promise.race([p, new Promise<undefined>((ok) => setTimeout(() => ok(undefined), ms))]) : p);
/** 한 번 늦었던 디자인 그림(사인물 id → 시각) — 1분 동안은 다시 기다리지 않는다(받는 중이면 그대로 받고, 다음 장면부터 들어간다) */
const slowDesign = new Map<string, number>();
const SLOW_FOR_MS = 60_000;
function designWait(id: string, ms?: number): number | undefined {
  if (ms === undefined) return undefined;
  const t = slowDesign.get(id);
  return t && Date.now() - t < SLOW_FOR_MS ? 0 : ms;
}
async function timed<T>(id: string, p: Promise<T>, ms?: number): Promise<T | undefined> {
  const wait = designWait(id, ms);
  let done = false;
  const out = await within(p.then((v) => { done = true; return v; }), wait);
  if (!done && wait !== undefined) slowDesign.set(id, Date.now()); else if (done) slowDesign.delete(id);
  return out;
}

/** 사진·사인물을 불러와 장면 재료를 만든다 (뷰어는 건드리지 않는다) */
async function prepareScene(photo: Photo, objects: SignObject[], plane: WallPlane, sources: DesignSource[], font: Font, opts: SceneOpts): Promise<PreparedScene> {
  // 배경 사진은 줄인 표시용 사본으로 (휴대폰 1600 · 그 외 2400px) — 원본(3200px)을 통째로 텍스처로 올리면 휴대폰 메모리가 넘친다 (2026-10-28 아이폰 새로고침)
  const url = (await displayUrl(photo.assetId, { w: photo.w, h: photo.h })) ?? (await assetUrl(photo.assetId));
  if (!url) throw new Error('photo asset missing');
  const tex = new THREE.Texture(await loadImage(url));
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  const placed = objects.map((o) => { const own = plane ? (signPlaneOf(o, plane) ?? plane) : plane; /* 원근에 맞는 사인물은 원근 설정의 각도 우선 */ return { o, plane: own, at: placeOnWall(own, o) }; });
  const maxX = Math.max(1000, ...placed.map((x) => x.at.cx + x.at.w / 2));
  const maxY = Math.max(1000, ...placed.map((x) => x.at.cy + x.at.h / 2));
  const signs: PreparedScene['signs'] = [];
  // 디자인 그림은 모든 사인물 것을 한꺼번에 받는다 — 기다림은 사진 하나에 최대 assetWaitMs (사인물마다 차례로 기다리면 늘어난다)
  const specs = placed.map(({ o, at }) => renderSpecOf(o, sizedAt(o, at, plane), opts.estOf?.(o))); // 사인물 자체 크기는 정면 축과 무관 (2026-10-15)
  const assets = await Promise.all(placed.map(({ o }, i) => {
    const spec = specs[i];
    if (!spec || !opts.designs) return { face: undefined, images: undefined };
    return Promise.all([
      spec.kind === 'lightbox' ? timed(`f:${o.id}`, faceOf(o, sources).catch(() => undefined), opts.assetWaitMs) : undefined,
      spec.faceItems ? timed(`i:${o.id}`, loadItemImages(o, sources).catch(() => undefined), opts.assetWaitMs) : undefined,
    ]).then(([face, images]) => ({ face, images }));
  }));
  for (const [i, { o, plane: own }] of placed.entries()) {
    const spec = specs[i];
    if (!spec) continue;
    const { face, images } = assets[i];
    let b: BuiltSign;
    try { b = buildSign(spec, font, 'Pretendard, sans-serif', face, images, opts.texLong); }
    catch { try { b = buildLightbox({ ...spec, kind: 'lightbox', text: '' }, 'Pretendard, sans-serif'); } catch { continue; } } // 실패한 사인물은 상자로, 그래도 안 되면 건너뜀
    if (spec.kind === 'lightbox' && !spec.bodyless) recessBox(b.group, spec.depthMm); // 외곽선 = 앞면: 바탕은 뒤로, 글자는 앞으로 (2026-10-17)
    const corners = quadOnWall(own, o) as [number, number][];
    warpToQuad(b.group, spec.widthMm, spec.heightMm, corners, spec.kind === 'channel' ? fitScale(b.measured.widthMm, spec.widthMm) : 1);
    // 박스 방향으로 (정면 축·회전 고리, 2026-10-15). 없으면 법선 — 원근 카메라의 +z 가 벽 안쪽이면 뒤집어 앞면이 카메라를 보게
    orientBox(b.group, boxLocalDirOf(o, own, plane, photo.w, photo.h), zTowardCamera(projectionFromPlane(own, photo.w, photo.h), [spec.x, spec.y]) < 0);
    b.setNight(false);
    signs.push({ b, P: projectionFromPlane(own, photo.w, photo.h), pose: poseOfPlane(own, photo.w, photo.h), corners });
  }
  return { photo, tex, P: projectionFromPlane(plane, photo.w, photo.h), pose: poseOfPlane(plane, photo.w, photo.h), maxX, maxY, signs };
}
/** 장면 재료를 뷰어에 얹는다 (빠름 — 앞 장면은 내리기만, 버리지 않는다). owned = 뷰어가 사진 텍스처를 가진다(다음 사진에서 버림) */
function applyScene(v: Viewer, s: PreparedScene, owned: boolean) {
  v.showGrid(false);
  v.clearSignCameras();
  v.signsRoot.clear();
  v.usePhotoTexture(s.tex, owned);
  v.applyProjection(s.P, s.pose, s.maxX, s.maxY);
  for (const g of s.signs) { v.signsRoot.add(g.b.group); v.addSignCamera(g.b.group, g.P, g.pose, g.corners); }
  v.setNight(false);
}
function disposeScene(s: PreparedScene) { for (const g of s.signs) { g.b.group.removeFromParent(); releaseTextures(g.b.group); g.b.dispose(); } s.tex.dispose(); } // 캔버스도 바로 비운다 (2026-10-29 아이폰 화면 이동 반복 다운)

/** 뷰어 하나에 사진·사인물을 올린다 (호출자가 뷰어를 재사용하거나 버린다). designs=false 면 디자인 이미지를 입히지 않아 가볍다 */
async function buildScene(v: Viewer, photo: Photo, objects: SignObject[], plane: WallPlane, sources: DesignSource[], font: Font, opts: SceneOpts & { maxW: number; maxH: number }): Promise<BuiltSign[]> {
  const k = Math.min(opts.maxW / photo.w, opts.maxH / photo.h, 1);
  v.resize(Math.max(1, Math.floor(photo.w * k)), Math.max(1, Math.floor(photo.h * k)));
  const prep = await prepareScene(photo, objects, plane, sources, font, opts);
  await v.envReady; // HDRI 조명으로 (2026-10-17)
  applyScene(v, prep, true);
  return prep.signs.map((g) => g.b);
}

const hiddenHost = () => { const host = document.createElement('div'); host.style.cssText = 'position:fixed;left:-10000px;top:0;width:800px;height:600px;'; document.body.appendChild(host); return host; };

/** 사진 + 벽면 + 사인물 → 주간·야간 PNG 데이터 URL (제안 이미지, 디자인 포함). 격자는 끈다 */
export async function renderPhotoPngs(photo: Photo, objects: SignObject[], plane: WallPlane, sources: DesignSource[], font: Font, estOf?: EstOf): Promise<{ day: string; night: string }> {
  const host = hiddenHost();
  const v = new Viewer(host);
  let built: BuiltSign[] = [];
  try {
    built = await buildScene(v, photo, objects, plane, sources, font, { designs: true, maxW: 800, maxH: 600, estOf });
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
 * 주간 PNG 만 만든다. 디자인 이미지도 입히고(2026-10-17, 2D 단계와 같은 모습) 사진 긴 변 ≤ 640px 로 — 사진마다 뷰어를 새로 만들지 않아 부하가 작다. 단계를 나가면 dispose
 */
export class StageRenderer {
  private host: HTMLDivElement | null = null;
  private viewer: Viewer | null = null;
  async render(photo: Photo, objects: SignObject[], plane: WallPlane, sources: DesignSource[], font: Font, estOf?: EstOf): Promise<string> {
    if (!this.viewer) { this.host = hiddenHost(); this.viewer = new Viewer(this.host); }
    const v = this.viewer;
    let built: BuiltSign[] = [];
    try {
      built = await buildScene(v, photo, objects, plane, sources, font, { designs: true, maxW: 640, maxH: 480, estOf }); // 디자인 이미지도 입힌다 (2026-10-17 사용자: "3d에서는 이미지 맵이 들어오지 않았다")
      v.setNight(false); for (const b of built) b.setNight(false);
      return v.exportPng(Math.min(photo.w, 1280), Math.min(photo.w, 1280) * (photo.h / photo.w), 'image/jpeg', 0.88); // 저장해 두므로 JPEG (2026-10-29)
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

/**
 * 실시간 3D (2026-10-27 "화면에서 가운데 있는 사진의 3d만 실시간"): 화면 가운데 사진 하나를 WebGL 로 바로 그린다.
 * 장면은 내용이 바뀔 때만 다시 짓고(build), 화면 이동·확대는 보이는 부분·크기만 바꿔 다시 그린다(frame) — PNG 만들기 없음
 */
/** 실시간 3D 의 앞면 그림 긴 변 (보통 1024 의 3배 · 휴대폰 1.5배) */
export const LIVE_TEX_LONG = 3072, LIVE_TEX_LONG_PHONE = 1024; // 휴대폰 1536 → 1024 (2026-10-29 아이폰 화면 이동 반복 다운 — 사인물마다 앞면 캔버스)
/** 실시간 3D 가 디자인 그림을 기다리는 시간 */
export const LIVE_ASSET_WAIT_MS = 2500;
export const isPhone = () => typeof matchMedia === 'function' && matchMedia('(max-width: 720px), (pointer: coarse)').matches;
export class LiveStage {
  readonly viewer: Viewer;
  /** 지어 둔 장면 — 사진 id → (내용 키, 장면). 최근 것이 뒤 (휴대폰 2 · 그 외 4) */
  private cache = new Map<string, { key: string; scene: PreparedScene }>();
  private applied: string | null = null;
  private readonly keep: number;
  /** 휴대폰은 가볍게 (MSAA 없음, 화면 배율 1.5) */
  constructor(host: HTMLElement, light = isPhone()) { this.viewer = new Viewer(host, { light }); this.keep = light ? 1 : 4; } // 휴대폰 2 → 1 (2026-10-29 아이폰 화면 이동 반복 다운)
  private chain: Promise<unknown> = Promise.resolve();
  private opts(estOf?: EstOf): SceneOpts { return { designs: true, estOf, texLong: this.viewer.light ? LIVE_TEX_LONG_PHONE : LIVE_TEX_LONG, assetWaitMs: LIVE_ASSET_WAIT_MS }; }
  private remember(id: string, key: string, scene: PreparedScene) {
    const old = this.cache.get(id);
    if (old && old.scene !== scene) this.drop(id);
    this.cache.delete(id); this.cache.set(id, { key, scene });
    while (this.cache.size > this.keep) {
      const oldest = [...this.cache.keys()].find((k) => k !== this.applied && k !== id);
      if (!oldest) break;
      this.drop(oldest);
    }
  }
  private drop(id: string) {
    const c = this.cache.get(id);
    if (!c) return;
    if (this.applied === id) { this.viewer.signsRoot.clear(); this.viewer.clearSignCameras(); this.applied = null; }
    this.cache.delete(id);
    disposeScene(c.scene);
  }
  /**
   * 가운데 사진의 장면 — **한 번에 하나씩**(2026-10-28 핀볼: 겹쳐 지으면 사진이 바뀌고 사인물이 쌓였다), 지어 둔 장면이 있으면 바로 얹는다.
   * isCurrent 가 거짓이면 얹지 않는다(지은 것은 기억). 'built' = 새로 지음, 'cached' = 기억한 것, false = 얹지 않음
   */
  build(photo: Photo, key: string, objects: SignObject[], plane: WallPlane, sources: DesignSource[], font: Font, estOf: EstOf | undefined, isCurrent: () => boolean = () => true): Promise<'built' | 'cached' | false> {
    const run = this.chain.then(async () => {
      if (!isCurrent()) return false;
      const hit = this.cache.get(photo.id);
      let made: 'built' | 'cached' = 'cached';
      let scene = hit?.key === key ? hit.scene : null;
      if (!scene) {
        scene = await prepareScene(photo, objects, plane, sources, font, this.opts(estOf));
        await this.viewer.envReady;
        this.remember(photo.id, key, scene);
        made = 'built';
      } else this.remember(photo.id, key, scene);
      if (!isCurrent()) return false;
      applyScene(this.viewer, scene, false);
      this.applied = photo.id;
      return made;
    });
    this.chain = run.catch(() => false);
    return run;
  }
  /** 쉬는 동안 옆 사진 장면을 미리 (데스크톱) — 얹지는 않는다 */
  prefetch(photo: Photo, key: string, objects: SignObject[], plane: WallPlane, sources: DesignSource[], font: Font, estOf?: EstOf) {
    this.chain = this.chain.then(async () => {
      if (this.cache.get(photo.id)?.key === key) return;
      const scene = await prepareScene(photo, objects, plane, sources, font, this.opts(estOf));
      this.remember(photo.id, key, scene);
    }).catch(() => undefined);
  }
  /** 지금 장면의 사진 id 와 사인물 수 (확인용) */
  get scenePhoto() { return this.applied ?? ''; }
  get sceneSigns() { return this.viewer.signsRoot.children.length; }
  get cachedIds() { return [...this.cache.keys()]; }
  /**
   * 보이는 부분(원본 픽셀)을 그림판 가득 — 그림판은 **보드 화면 크기로 고정**(크기가 바뀔 때만 다시 만든다), 화면에는 CSS 로 보이는 조각 크기에 맞춘다.
   * 그래서 화면을 움직이는 동안 매번 바로 다시 그릴 수 있다 (2026-10-28 "3d가 실시간으로 랜더링 보이느게 어려운건가?" → "진행해봐")
   */
  frame(crop: { x: number; y: number; w: number; h: number }, boardW: number, boardH: number) {
    const c = this.applied ? this.cache.get(this.applied) : null;
    if (!c) return;
    this.viewer.resize(Math.max(1, Math.round(boardW)), Math.max(1, Math.round(boardH)));
    const el = this.viewer.renderer.domElement;
    el.style.width = '100%'; el.style.height = '100%';
    this.viewer.setCrop(crop, c.scene.photo.w, c.scene.photo.h);
  }
  /**
   * 지금 얹힌 장면을 사진 전체 그림(JPEG)으로 뜬다 — 휴대폰의 저장된 3D 그림 (2026-10-29). 그림판 크기는 그대로(다시 만들지 않음),
   * 사진 전체를 그려 사진 비율의 2D 캔버스로 옮긴다. 그다음 보던 자르기로 되돌린다
   */
  async snapshot(crop: { x: number; y: number; w: number; h: number } | null): Promise<Blob | null> {
    const c = this.applied ? this.cache.get(this.applied) : null;
    if (!c) return null;
    const { w: pw, h: ph } = c.scene.photo;
    const v = this.viewer, el = v.renderer.domElement;
    v.setCrop({ x: 0, y: 0, w: pw, h: ph }, pw, ph);
    v.renderNow();
    const long = Math.min(1280, Math.max(el.width, el.height));
    const k = long / Math.max(pw, ph);
    const out = document.createElement('canvas');
    out.width = Math.max(1, Math.round(pw * k)); out.height = Math.max(1, Math.round(ph * k));
    out.getContext('2d')!.drawImage(el, 0, 0, el.width, el.height, 0, 0, out.width, out.height);
    if (crop) v.setCrop(crop, pw, ph);
    const blob = await new Promise<Blob | null>((ok) => out.toBlob(ok, 'image/jpeg', 0.85));
    out.width = out.height = 0;
    return blob;
  }
  dispose() { for (const id of [...this.cache.keys()]) this.drop(id); this.viewer.renderer.dispose(); this.viewer.renderer.domElement.remove(); }
}

export async function dataUrlToBlob(url: string): Promise<Blob> {
  return (await fetch(url)).blob();
}
