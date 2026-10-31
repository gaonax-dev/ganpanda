// 채널 키트 미리보기 (2026-10-31, docs/features/channel-models.md): 키트 모델(glb) + 구운 회색조 라이트맵(두 번째 UV) — 색은 여기서 입힌다.
// 낮 = 라이트맵(빛만) × 고른 색 + 약한 환경맵(금속 반사), 밤 = 밤 라이트맵 + 앞면·뒤판 발광(LED 색) + 벽 후광(밤 벽 라이트맵 × LED 색).
// WebGL 화면은 하나(아이폰 — docs/architecture/rendering-lod.md). 색 바꾸기는 재질 값만 바꿔 바로
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { roomEnvironment } from '../sim/env';
import type { KitLook } from '../core/channelKit';
import { SERVER_URL } from '../sync';
import { loadSession } from '../auth';

export interface KitMaps { letters: string; wall: string; letterIntensity: number; wallIntensity: number }
export interface KitVariant { id: string; label: string; file: string; roles: string[]; lightmaps: { day: KitMaps; night: KitMaps }; size: [number, number, number]; bytes: number }
export interface KitManifest { version: number; letter: string; variants: KitVariant[] }
/** 받은 키트: 어디서(공개판·초안·앱에 든 기본) + 파일 주소 앞부분 */
export interface LoadedKit extends KitManifest { source: 'server' | 'draft' | 'static'; base: string }

const BASE = `${import.meta.env.BASE_URL ?? '/'}channel-models/`.replace(/\/\/+/g, '/');
// 서버 키트 (2026-10-31 "운영자만, 초안 공개 2단계로 진행해줘"): 블렌더 애드온이 올린 공개판을 먼저, 운영자가 [초안 미리보기]를 켜면 초안, 없으면 앱에 든 기본
const DRAFT_KEY = 'ganpanda.kitDraft';
export const kitDraftOn = () => { try { return localStorage.getItem(DRAFT_KEY) === '1'; } catch { return false; } };
export function setKitDraft(on: boolean) { try { if (on) localStorage.setItem(DRAFT_KEY, '1'); else localStorage.removeItem(DRAFT_KEY); } catch { /* 기기 저장 불가 */ } resetKitManifest(); }
export function resetKitManifest() { manifestP = null; }
async function fetchServer(draft: boolean): Promise<LoadedKit | null> {
  if (!SERVER_URL) return null;
  const s = loadSession();
  // 늘 새로 확인 — 세션에 한 번만 받으니 가볍고, 공개하면 바로 (브라우저 캐시 60초를 기다리지 않게)
  const r = await fetch(`${SERVER_URL}/api/kit/manifest${draft ? '?draft=1' : ''}`, { cache: 'no-cache', headers: draft && s ? { authorization: `Bearer ${s}` } : {} }).catch(() => null);
  if (!r?.ok) return null;
  return { ...(await r.json()), source: draft ? 'draft' : 'server', base: `${SERVER_URL}/api/kit/files/` };
}
/** 파일 주소 — 서버 파일은 내용 해시 이름이라 판 표시가 필요 없다 */
const fileUrl = (mf: LoadedKit, f: string) => (mf.source === 'static' ? `${BASE}${f}?v=${mf.version}` : `${mf.base}${f}`);
/** 라이트맵 세기 보정 — 블렌더 확산 굽기 값 → three 라이트맵(조도) */
const LM_GAIN = Math.PI;
const WALL_DAY = '#d9d6d0';

let manifestP: Promise<LoadedKit | null> | null = null;
export function loadKitManifest(): Promise<LoadedKit | null> {
  manifestP ??= (async () => {
    const m = (kitDraftOn() ? await fetchServer(true) : null) ?? (await fetchServer(false));
    if (m) return m;
    const r = await fetch(`${BASE}manifest.json`).catch(() => null);
    return r?.ok ? { ...(await r.json()), source: 'static', base: BASE } : null;
  })();
  return manifestP;
}
const sceneCache = new Map<string, Promise<THREE.Group>>();
function loadScene(v: KitVariant, mf: LoadedKit): Promise<THREE.Group> {
  const url = fileUrl(mf, v.file);
  let p = sceneCache.get(url);
  if (!p) { p = new GLTFLoader().loadAsync(url).then((g) => g.scene); sceneCache.set(url, p); }
  return p;
}
const texCache = new Map<string, Promise<THREE.Texture>>();
function loadMap(file: string, mf: LoadedKit): Promise<THREE.Texture> {
  const k = fileUrl(mf, file);
  let p = texCache.get(k);
  if (!p) {
    p = new THREE.TextureLoader().loadAsync(k).then((t) => {
      t.flipY = false; // glTF UV 와 같은 방향
      t.colorSpace = THREE.NoColorSpace; // 빛 세기(선형)
      t.channel = 1; // 두 번째 UV
      return t;
    });
    texCache.set(k, p);
  }
  return p;
}

const finishOf = (f: string): { metalness: number; roughness: number } =>
  /미러/.test(f) ? { metalness: 1, roughness: 0.06 } : /티타늄/.test(f) ? { metalness: 1, roughness: 0.16 } : /헤어라인/.test(f) ? { metalness: 1, roughness: 0.36 } : { metalness: 0, roughness: 0.5 };

export class KitView {
  readonly renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(28, 1, 0.01, 20);
  private root: THREE.Group | null = null;
  private mats = new Map<string, THREE.MeshStandardMaterial>();
  private wallBasic = new THREE.MeshBasicMaterial();
  private maps: { day: { letters: THREE.Texture; wall: THREE.Texture; v: KitMaps }; night: { letters: THREE.Texture; wall: THREE.Texture; v: KitMaps } } | null = null;
  private walls: THREE.Mesh[] = [];
  /** 지금 보이는 종류 */
  variant = '';
  private loadedKey = '';
  /** 지금 키트의 출처·판 (확인용) */
  source = { source: '', version: 0 };
  private yaw = 0;
  private fit = { center: new THREE.Vector3(), radius: 0.3 };

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(typeof devicePixelRatio === 'number' ? devicePixelRatio : 1, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene.environment = roomEnvironment(this.renderer);
  }

  setSize(w: number, h: number) {
    this.renderer.setSize(Math.max(1, Math.round(w)), Math.max(1, Math.round(h)), false);
    this.camera.aspect = Math.max(1, w) / Math.max(1, h);
    this.frame();
  }

  /** 종류를 바꾼다 (모델·라이트맵을 받아 얹는다). 같은 종류면 색만 */
  async show(variantId: string, look: KitLook, night: boolean): Promise<boolean> {
    const mf = await loadKitManifest();
    const v = mf?.variants.find((x) => x.id === variantId);
    if (!mf || !v) return false;
    const key = `${mf.source}:${mf.version}:${variantId}`;
    if (this.loadedKey !== key) {
      const [src, dl, dw, nl, nw] = await Promise.all([loadScene(v, mf), loadMap(v.lightmaps.day.letters, mf), loadMap(v.lightmaps.day.wall, mf), loadMap(v.lightmaps.night.letters, mf), loadMap(v.lightmaps.night.wall, mf)]);
      if (this.root) this.scene.remove(this.root);
      this.root = src.clone(true);
      this.maps = { day: { letters: dl, wall: dw, v: v.lightmaps.day }, night: { letters: nl, wall: nw, v: v.lightmaps.night } };
      this.walls = [];
      for (const m of [...this.mats.values()]) m.dispose();
      this.mats.clear();
      this.root.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        const role = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material)?.name || mesh.name.replace(/[._]\d+$/, '');
        if (role === 'wall') { this.walls.push(mesh); return; }
        let mat = this.mats.get(role);
        if (!mat) { mat = new THREE.MeshStandardMaterial({ name: role }); this.mats.set(role, mat); }
        mesh.material = mat;
      });
      this.scene.add(this.root);
      this.variant = variantId;
      this.loadedKey = key;
      this.source = { source: mf.source, version: mf.version };
      const box = new THREE.Box3();
      this.root.traverse((o) => { if ((o as THREE.Mesh).isMesh && !this.walls.includes(o as THREE.Mesh)) box.expandByObject(o); });
      box.getCenter(this.fit.center);
      this.fit.radius = box.getSize(new THREE.Vector3()).length() / 2;
      this.frame();
    }
    this.apply(look, night);
    return true;
  }

  /** 색·밤낮만 바꾼다 — 다시 받지 않는다 */
  apply(look: KitLook, night: boolean) {
    if (!this.maps) return;
    const m = night ? this.maps.night : this.maps.day;
    const lit = night && look.lit;
    const color = (role: string): string => (role === 'face' ? look.face : role === 'side' ? look.side : role === 'cap' ? look.cap : role === 'back' ? look.back : role === 'bracket' ? '#9aa0a6' : role === 'frame' ? look.side : '#cccccc');
    for (const [role, mat] of this.mats) {
      mat.color.set(color(role));
      const f = role === 'side' || role === 'cap' ? finishOf(look.finish) : role === 'bracket' ? { metalness: 0.9, roughness: 0.4 } : { metalness: 0, roughness: role === 'face' ? 0.3 : 0.5 };
      mat.metalness = f.metalness; mat.roughness = f.roughness;
      mat.lightMap = m.letters;
      mat.lightMapIntensity = m.v.letterIntensity * LM_GAIN * (night ? 0.6 : 1);
      mat.envMapIntensity = f.metalness > 0.5 ? 1 : 0.15; // 빛은 라이트맵 — 환경맵은 반사만
      const glow = lit && (role === 'face' || role === 'back');
      mat.emissive.set(glow ? (role === 'face' ? look.face : look.led) : '#000000');
      mat.emissiveIntensity = glow ? 1.4 : 0;
      mat.needsUpdate = true;
    }
    for (const w of this.walls) {
      if (night) {
        this.wallBasic.map = m.wall;
        this.wallBasic.color.set(look.lit ? look.led : '#000000').multiplyScalar(look.lit ? Math.min(1, m.v.wallIntensity * 0.55) : 0); // 벽 전체가 하얗게 타지 않게
        this.wallBasic.needsUpdate = true;
        w.material = this.wallBasic;
      } else {
        let mat = this.mats.get('wall');
        if (!mat) { mat = new THREE.MeshStandardMaterial({ name: 'wall', roughness: 0.9 }); this.mats.set('wall', mat); }
        mat.color.set(WALL_DAY);
        mat.lightMap = m.wall;
        mat.lightMapIntensity = m.v.wallIntensity * LM_GAIN;
        mat.envMapIntensity = 0.1;
        mat.needsUpdate = true;
        w.material = mat;
      }
    }
    this.scene.environmentIntensity = night ? 0.05 : 0.6;
    this.render();
  }

  /** 살짝 돌려 보기 (라디안, 앞에서 ±0.7) */
  turn(yaw: number) { this.yaw = Math.max(-0.7, Math.min(0.7, yaw)); this.frame(); this.render(); }

  private frame() {
    const { center, radius } = this.fit;
    const dist = (radius / Math.sin(THREE.MathUtils.degToRad(this.camera.fov / 2))) * 1.1;
    const dir = new THREE.Vector3(Math.sin(0.35 + this.yaw), 0.18, Math.cos(0.35 + this.yaw)).normalize();
    this.camera.position.copy(center).addScaledVector(dir, dist);
    this.camera.lookAt(center);
    this.camera.updateProjectionMatrix();
  }

  render() { this.renderer.render(this.scene, this.camera); }

  /** 지금 화면을 그림으로 (카드) */
  snapshot(type = 'image/webp'): Promise<Blob | null> {
    this.render();
    return new Promise((ok) => this.renderer.domElement.toBlob(ok, type, 0.9));
  }

  dispose() {
    for (const m of this.mats.values()) m.dispose();
    this.wallBasic.dispose();
    this.renderer.dispose();
  }
}
