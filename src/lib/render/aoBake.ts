// 사인물 AO 굽기 — ProgressiveLightMap (2026-11-09 사용자: "디자인 파일이 들어오면 occ를 구워서 계속 사용 가능하지 않을까?" → "1번 ProgressiveLightMap으로 진행해").
// 사인물(사진에 놓기 전, 자기 좌표)을 하늘 반구의 빛 여러 개로 차례로 비춰 그림자를 쌓아, 받는 면 두 곳에 굽는다:
//   face = 상자 앞면(그 위 채널 글자·시트의 접촉 그림자), wall = 벽(사인물 전체의 접촉 그림자).
// 결과는 사인물 3D 사양 키로 기기(IndexedDB)에 두고 계속 쓴다 — 디자인·구성이 바뀌면 키가 바뀌어 한 번 새로 굽는다. 휴대폰은 굽지 않고 있는 것만 쓴다.
// 3D 장면에서는 받는 면 자리에 회색 그림을 곱하기(MultiplyBlending)로 얹는다 → docs/features/render-3d.md
import * as THREE from 'three';
import { ProgressiveLightMap } from 'three/examples/jsm/misc/ProgressiveLightMap.js';
import { aoKey, aoToGray, skyDirs } from '../core/aoBake';
import { getDerived, putDerived } from '../derivedImages';

/** 굽기 버전 — 굽는 방식이 바뀌면 올려 새로 굽는다 */
const AO_VERSION = 1;
/** 하늘 빛 수 · 받는 면 그림 크기 · 그림자 맵 */
const SAMPLES = 96, RES = 192, SHADOW = 768;
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
const tick = () => new Promise<void>((ok) => setTimeout(ok, 0));

/** 받는 면 하나를 굽는다 → AO 회색 캔버스 (RES × RES) */
async function bakeReceiver(occluders: THREE.Mesh[], rc: Receiver, bounds: THREE.Box3): Promise<HTMLCanvasElement> {
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
  const recv = new THREE.Mesh(new THREE.PlaneGeometry(rc.w, rc.h), new THREE.MeshPhongMaterial({ color: 0xffffff, specular: 0x000000, shininess: 0 }));
  recv.position.set(rc.cx, rc.cy, rc.z);
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
    c.matrix.copy(o.matrixWorld);
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
export async function attachAO(group: THREE.Group, spec: Parameters<typeof receiversOf>[0] & object, opts: { bake: boolean }): Promise<void> {
  try {
    group.updateMatrixWorld(true);
    const occluders: THREE.Mesh[] = [];
    group.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && m.visible && m.userData.part !== 'glow' && m.userData.part !== 'ao') occluders.push(m); });
    if (!occluders.length) return;
    const bounds = new THREE.Box3();
    for (const m of occluders) { m.geometry.computeBoundingBox(); bounds.union(m.geometry.boundingBox!.clone().applyMatrix4(m.matrixWorld)); }
    if (bounds.isEmpty()) return;
    const base = `ao|v${AO_VERSION}|${aoKey(spec)}`;
    for (const rc of receiversOf(spec, bounds)) {
      const key = `${base}|${rc.name}`;
      let src = mem.get(key) ?? null;
      if (!src) {
        const d = await getDerived(key);
        if (d && 'blob' in d) src = await createImageBitmap(d.blob);
      }
      if (!src && opts.bake) {
        const c = await bakeReceiver(occluders, rc, bounds);
        const blob = await toBlob(c);
        if (blob) await putDerived(key, { blob });
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
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(rc.w, rc.h), mat);
      plane.position.set(rc.cx, rc.cy, rc.z);
      plane.userData.part = 'ao';
      plane.renderOrder = -2;
      group.add(plane);
    }
  } catch (e) { console.warn('AO 굽기 실패', e); }
}
