// 사인물 AO 굽기 — ProgressiveLightMap (2026-11-09 사용자: "디자인 파일이 들어오면 occ를 구워서 계속 사용 가능하지 않을까?" → "1번 ProgressiveLightMap으로 진행해").
// 사인물(사진에 놓기 전, 자기 좌표)을 하늘 반구의 빛 여러 개로 차례로 비춰 그림자를 쌓아, 받는 면 두 곳에 굽는다:
//   face = 상자 앞면(그 위 채널 글자·시트의 접촉 그림자), wall = 벽(사인물 전체의 접촉 그림자).
// 결과는 사인물 3D 사양 키로 기기(IndexedDB)에 두고 계속 쓴다 — 디자인·구성이 바뀌면 키가 바뀌어 한 번 새로 굽는다. 휴대폰은 굽지 않고 있는 것만 쓴다.
// 3D 장면에서는 받는 면 자리에 회색 그림을 곱하기(MultiplyBlending)로 얹는다 → docs/features/render-3d.md
import * as THREE from 'three';
import { ProgressiveLightMap } from 'three/examples/jsm/misc/ProgressiveLightMap.js';
import { aoGeomKey, aoToGray, skyDirs } from '../core/aoBake';
import { aoLoaded, aoStore as store } from '../aoStore';
import { assetUrl, putAsset } from '../assets';
import { getDerived, putDerived } from '../derivedImages';

/** 굽기 버전 — 굽는 방식이 바뀌면 올려 새로 굽는다 */
const AO_VERSION = 2; // 2: 박스 방향 기울임(orientBox)을 넣어 굽는다 (2026-11-09)
/** 하늘 빛 수 · 받는 면 그림 크기 · 그림자 맵 */
const SAMPLES = 96, RES = 192, SHADOW = 768;
/** 받는 면 평면을 긴 변에서 나누는 칸 수 (원근 맞추기용) */
const RECEIVER_SEGMENTS = 64;
/** AO 세기 (1 = 구운 그대로) — 회색을 흰색 쪽으로 당긴다 */
export const AO_STRENGTH = 0.8;

type Receiver = { name: 'face' | 'wall'; w: number; h: number; cx: number; cy: number; z: number };

let renderer: THREE.WebGLRenderer | null = null;
function bakeRenderer(): THREE.WebGLRenderer {
  if (!renderer) {
    renderer = new THREE.WebGLRenderer({ antialias: false });
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setSize(8, 8, false);
  }
  return renderer;
}

const mem = new Map<string, ImageBitmap | HTMLCanvasElement>();

/**
 * 프로젝트에 올라온 AO 를 **뒤에서** 받는다 — 3D 짓기를 기다리게 하지 않는다. 받으면 기억(mem·기기)하고 알린다(aoLoaded → 다시 그림).
 * 올리는 중이라 서버에 아직 없으면 재시도에 수십 초 — 그동안 실시간 3D 가 안 지어져 저장된 3D 그림만 늘어나 깍두기였다 (2026-11-10 "확대시 3d가 깍두기 생긴다")
 */
const fetching = new Set<string>();
function fetchFromStore(key: string) {
  const id = store()?.get(key);
  if (!id || fetching.has(key)) return;
  fetching.add(key);
  void (async () => {
    try {
      const url = await assetUrl(id);
      if (!url) return;
      const blob = await (await fetch(url)).blob();
      mem.set(key, await createImageBitmap(blob));
      await putDerived(key, { blob }); // 다음엔 기기에서 바로
      aoLoaded();
    } catch { /* 못 받으면 AO 없이 */ } finally { fetching.delete(key); }
  })();
}
const tick = () => new Promise<void>((ok) => setTimeout(ok, 0));

/** 받는 면 하나를 굽는다 → AO 회색 캔버스 (RES × RES) */
async function bakeReceiver(occluders: THREE.Mesh[], rc: Receiver, bounds: THREE.Box3, shear: THREE.Matrix4): Promise<HTMLCanvasElement> {
  const r = bakeRenderer();
  const plm = new ProgressiveLightMap(r, RES);
  const center = bounds.getCenter(new THREE.Vector3());
  const radius = Math.max(1, bounds.getBoundingSphere(new THREE.Sphere()).radius, Math.hypot(rc.w, rc.h) / 2);
  const light = new THREE.DirectionalLight(0xffffff, 1);
  light.castShadow = true;
  light.shadow.mapSize.set(SHADOW, SHADOW);
  const cam = light.shadow.camera as THREE.OrthographicCamera;
  cam.left = -radius; cam.right = radius; cam.top = radius; cam.bottom = -radius; cam.near = 1; cam.far = radius * 6;
  cam.updateProjectionMatrix();
  light.shadow.bias = -0.0004;
  light.shadow.normalBias = radius * 0.002;
  const recv = new THREE.Mesh(receiverGeometry(rc), new THREE.MeshPhongMaterial({ color: 0xffffff, specular: 0x000000, shininess: 0 }));
  recv.matrixAutoUpdate = false;
  recv.matrix.copy(shear).multiply(new THREE.Matrix4().makeTranslation(0, 0, rc.z));
  recv.updateMatrixWorld(true);
  const holder = new THREE.Group();
  holder.add(recv);
  plm.addObjectsToLightMap([light, recv]);
  plm.scene.add(light.target);
  // 가리는 것 = 사인물 도형 — 그림자만 드리운다(받는 면 그림에 직접 그려지지 않게 색 쓰기 끔)
  const occMat = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, side: THREE.DoubleSide });
  for (const o of occluders) {
    const c = new THREE.Mesh(o.geometry, occMat);
    c.matrixAutoUpdate = false;
    c.matrix.copy(shear).multiply(o.matrixWorld); // 장면과 같은 기울임으로 — 기울인 뒤 글자 자리에 그림자가 앉는다
    c.castShadow = true;
    plm.scene.add(c);
  }
  const view = new THREE.PerspectiveCamera();
  const dirs = skyDirs(SAMPLES);
  for (let i = 0; i < dirs.length; i++) {
    const [x, y, z] = dirs[i];
    light.position.set(center.x + x * radius * 3, center.y + y * radius * 3, center.z + z * radius * 3);
    light.target.position.copy(center);
    light.updateMatrixWorld(); light.target.updateMatrixWorld();
    plm.update(view, i + 1, true);
    if (i % 24 === 23) await tick(); // 화면이 멈추지 않게
  }
  // 마지막으로 쓴 버퍼 (update 가 쓰고 나서 차례를 바꾼다)
  const p = plm as unknown as { buffer1Active: boolean; progressiveLightMap1: THREE.WebGLRenderTarget; progressiveLightMap2: THREE.WebGLRenderTarget };
  const target = p.buffer1Active ? p.progressiveLightMap2 : p.progressiveLightMap1;
  const buf = new Float32Array(RES * RES * 4);
  r.readRenderTargetPixels(target, 0, 0, RES, RES, buf);
  // 받는 면 하나뿐 — 묶음 여백 안쪽만 (potpack: 1 + 2·padding)
  const pad = 3 / RES, span = 1 + pad * 2;
  const x0 = Math.round((pad / span) * RES), size = Math.max(1, Math.round((1 / span) * RES));
  const crop = new Float32Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const si = ((x0 + y) * RES + (x0 + x)) * 4, di = (y * size + x) * 4;
    for (let k = 0; k < 4; k++) crop[di + k] = buf[si + k];
  }
  // 기준 = 가려지지 않은 곳(밝은 쪽 98%) — 받는 면은 사인물보다 넓어 바깥은 늘 하늘을 다 본다
  const lum: number[] = [];
  for (let i = 0; i < crop.length; i += 4) lum.push((crop[i] + crop[i + 1] + crop[i + 2]) / 3);
  lum.sort((a, b) => a - b);
  const ref = lum[Math.floor(lum.length * 0.98)] ?? 0;
  const gray = aoToGray(crop, ref);
  for (let i = 0; i < gray.length; i += 4) { const v = 255 - (255 - gray[i]) * AO_STRENGTH; gray[i] = gray[i + 1] = gray[i + 2] = v; }
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  // 렌더 타깃은 아래가 0 — 캔버스는 위가 0 이라 뒤집어 넣는다
  const img = new ImageData(size, size);
  for (let y = 0; y < size; y++) img.data.set(gray.subarray((size - 1 - y) * size * 4, (size - y) * size * 4), y * size * 4);
  canvas.getContext('2d')!.putImageData(img, 0, 0);
  recv.geometry.dispose(); (recv.material as THREE.Material).dispose(); occMat.dispose(); holder.clear();
  for (const t of [p.progressiveLightMap1, p.progressiveLightMap2]) t.dispose();
  return canvas;
}

/**
 * 받는 면 평면 — 가운데 어긋남(cx·cy)은 도형에 굽는다(사진 자리 맞추기 warpToQuad 는 도형 꼭짓점만 옮기고 물체 자리 x·y 는 보지 않는다).
 * 잘게 나눈다: 꼭짓점 4개면 사다리꼴(원근) 자리에 맞출 때 안쪽이 원근이 아닌 직선 보간으로 늘어나 그림자가 글자에서 밀렸다(핀볼 측면간판 약 100mm, 2026-11-09)
 */
function receiverGeometry(rc: Receiver): THREE.BufferGeometry {
  const long = Math.max(rc.w, rc.h), seg = (s: number) => Math.max(2, Math.ceil((RECEIVER_SEGMENTS * s) / long));
  return new THREE.PlaneGeometry(rc.w, rc.h, seg(rc.w), seg(rc.h)).translate(rc.cx, rc.cy, 0);
}

/** orientBox 와 같은 기울임 행렬 (z 를 dir 방향으로) */
function shearOf(box?: { dir: [number, number, number] | null; flip: boolean }): THREE.Matrix4 {
  const m = new THREE.Matrix4();
  if (!box?.dir) { if (box?.flip) m.makeScale(1, 1, -1); return m; }
  const d = box.dir, dz = Math.sign(d[2] || 1) * Math.max(Math.abs(d[2]), 0.15);
  return m.set(1, 0, d[0], 0, 0, 1, d[1], 0, 0, 0, dz, 0, 0, 0, 0, 1);
}

const toBlob = (c: HTMLCanvasElement) => new Promise<Blob | null>((ok) => c.toBlob(ok, 'image/png'));

/** 받는 면 자리 (사인물 자기 좌표, mm) */
function receiversOf(spec: { kind: string; widthMm: number; heightMm: number; bodyless?: boolean; letterItems?: unknown[]; letters?: unknown }, bounds: THREE.Box3): Receiver[] {
  const size = bounds.getSize(new THREE.Vector3());
  const pad = Math.max(size.x, size.y) * 0.15 + size.z * 1.5;
  const out: Receiver[] = [{ name: 'wall', w: size.x + pad * 2, h: size.y + pad * 2, cx: (bounds.min.x + bounds.max.x) / 2, cy: (bounds.min.y + bounds.max.y) / 2, z: bounds.min.z + 0.3 }];
  // 상자 앞면(외곽선 = 앞면, z = 0) 위에 글자·시트가 올라가면 그 접촉 그림자
  if (spec.kind === 'lightbox' && !spec.bodyless && (spec.letterItems?.length || spec.letters)) out.push({ name: 'face', w: spec.widthMm, h: spec.heightMm, cx: 0, cy: 0, z: 0.3 });
  return out;
}

/**
 * 사인물 그룹에 구운 AO 를 얹는다 (상자를 뒤로 물린 뒤, 사진 자리에 맞추기 전 — 자기 좌표). 저장된 것이 있으면 그것을, 없으면 bake 가 참일 때 굽고 저장.
 * 받는 면마다 곱하기 판 하나(userData.part = 'ao'). 실패하면 조용히 넘어간다(AO 없이 그린다)
 */
export async function attachAO(group: THREE.Group, spec: Parameters<typeof receiversOf>[0], opts: { bake: boolean; box?: { dir: [number, number, number] | null; flip: boolean } }): Promise<void> {
  try {
    group.updateMatrixWorld(true);
    const occluders: THREE.Mesh[] = [];
    group.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && m.visible && m.userData.part !== 'glow' && m.userData.part !== 'ao') occluders.push(m); });
    if (!occluders.length) return;
    const bounds = new THREE.Box3();
    for (const m of occluders) { m.geometry.computeBoundingBox(); bounds.union(m.geometry.boundingBox!.clone().applyMatrix4(m.matrixWorld)); }
    if (bounds.isEmpty()) return;
    // 박스 방향(사진마다 다름)도 키에 — 같은 사인물도 기울기가 다르면 그림자 자리가 다르다
    const box = opts.box?.dir ? `|${opts.box.dir.map((v) => v.toFixed(2)).join(',')}` : opts.box?.flip ? '|f' : '';
    const shear = shearOf(opts.box);
    // 키 = 그림자를 드리우는 도형의 꼭짓점 자리만 — 색·재질·조명이 바뀌어도 그대로 쓴다 (2026-11-10 "체널과 프레임의 위치만 재질은 상관없음")
    const geo = aoGeomKey(occluders.map((m) => ({ pos: (m.geometry.attributes.position as THREE.BufferAttribute).array, m: m.matrixWorld.elements })), `${spec.kind}|${Math.round(spec.widthMm)}x${Math.round(spec.heightMm)}|${spec.bodyless ? 'b' : ''}`);
    const base = `ao|v${AO_VERSION}|${geo}${box}`;
    for (const rc of receiversOf(spec, bounds)) {
      const key = `${base}|${rc.name}`;
      let src = mem.get(key) ?? null;
      if (!src) {
        const d = await getDerived(key);
        if (d && 'blob' in d) {
          src = await createImageBitmap(d.blob);
          // 이 기기에서 구웠는데 프로젝트에 아직 없으면 올린다 (다른 기기가 쓰게)
          const st = store();
          if (st && !st.get(key) && opts.bake) { const blob = d.blob; void putAsset(blob).then((id) => st.set(key, id)).catch(() => undefined); }
        }
      }
      if (!src && !opts.bake) { fetchFromStore(key); continue; } // 굽지 않는 기기: 받는 건 뒤에서
      if (!src && opts.bake) {
        const c = await bakeReceiver(occluders, rc, bounds, shear);
        const blob = await toBlob(c);
        if (blob) {
          await putDerived(key, { blob });
          const st = store();
          if (st) { try { st.set(key, await putAsset(blob)); } catch { /* 못 올려도 이 기기에서는 쓴다 */ } }
        }
        src = c;
      }
      if (!src) continue;
      mem.set(key, src);
      // 장면마다 새 캔버스 — 장면을 버릴 때 캔버스를 비운다(releaseTextures)
      const canvas = document.createElement('canvas');
      canvas.width = src.width; canvas.height = src.height;
      canvas.getContext('2d')!.drawImage(src, 0, 0);
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.NoColorSpace;
      const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.MultiplyBlending, premultipliedAlpha: true, toneMapped: false });
      const plane = new THREE.Mesh(receiverGeometry(rc), mat);
      plane.position.set(0, 0, rc.z);
      plane.userData.part = 'ao';
      plane.renderOrder = -2;
      group.add(plane);
    }
  } catch (e) { console.warn('AO 굽기 실패', e); }
}
