// 간판 사양(SignSpec) → Three.js 메쉬. 모든 단위 mm, 벽면 = z 0 평면, +z = 벽 밖(카메라 쪽).
import * as THREE from 'three';
import type { Font } from 'opentype.js';
import type { Measured, SignSpec } from './types';
import { shapesToPath2D, textToShapes } from '../core/textShapes';

/** 후광 채널의 벽 이격(스페이서) 거리 */
const HALO_STANDOFF = 35;

export interface BuiltSign {
  group: THREE.Group;
  measured: Measured;
  /** 낮/밤 전환 시 호출 */
  setNight(night: boolean): void;
  dispose(): void;
}

/** blurMm: [넓은 번짐, 좁은 번짐] 반경 (mm) */
function glowTexture(
  draw: (ctx: CanvasRenderingContext2D, s: number) => void, w: number, h: number, color: string, blurMm: [number, number],
) {
  const s = 512 / Math.max(w, h);
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(w * s);
  canvas.height = Math.ceil(h * s);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = color;
  for (const b of blurMm) {
    ctx.filter = `blur(${Math.max(1, b * s)}px)`;
    draw(ctx, s);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function glowPlane(tex: THREE.Texture, w: number, h: number, z: number) {
  const mat = new THREE.MeshBasicMaterial({
    map: tex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  mesh.position.z = z;
  mesh.renderOrder = -1;
  return mesh;
}

export interface ChannelGeometry {
  geometry: THREE.ExtrudeGeometry;
  measured: Measured;
  /** 원본 글자 윤곽(폰트 단위)과 mm 변환 정보 — 글로우 텍스처용 */
  shapes: THREE.Shape[];
  center: THREE.Vector2;
  scale: number;
}

/** 입체 글자 형상 (DOM 불필요 → 단위 테스트 대상). 중심 = 원점, 앞면 z = depth */
export function channelGeometry(spec: SignSpec, font: Font): ChannelGeometry {
  const text = spec.text.trim() || ' ';
  const shapes = textToShapes(font, text, spec.letterSpacing);
  const geometry = new THREE.ExtrudeGeometry(shapes, { depth: spec.depthMm, bevelEnabled: false, curveSegments: 6 });
  geometry.computeBoundingBox();
  const bb = geometry.boundingBox!.clone(); // translate/scale 이 boundingBox 를 갱신하므로 복사
  const k = spec.heightMm / Math.max(1, bb.max.y - bb.min.y);
  const center = new THREE.Vector2((bb.min.x + bb.max.x) / 2, (bb.min.y + bb.max.y) / 2);
  // 폰트 단위 → mm. 두께(z)는 이미 mm 이므로 x,y 만 스케일
  geometry.translate(-center.x, -center.y, 0);
  geometry.scale(k, k, 1);
  geometry.computeVertexNormals();
  return {
    geometry,
    shapes,
    center,
    scale: k,
    measured: {
      widthMm: (bb.max.x - bb.min.x) * k,
      heightMm: spec.heightMm,
      charCount: [...text].filter((c) => c.trim()).length,
    },
  };
}

export function buildChannel(spec: SignSpec, font: Font): BuiltSign {
  const group = new THREE.Group();
  const { geometry: geo, measured, shapes, center, scale: k } = channelGeometry(spec, font);
  const widthMm = measured.widthMm;

  const led = new THREE.Color(spec.faceColor);
  const side = new THREE.MeshStandardMaterial({ color: spec.sideColor, metalness: 0.85, roughness: 0.32 });
  const face =
    spec.lighting === 'front'
      ? new THREE.MeshPhysicalMaterial({ color: led, emissive: led, roughness: 0.25, clearcoat: 0.6 })
      : spec.lighting === 'halo'
        ? new THREE.MeshStandardMaterial({ color: spec.sideColor, metalness: 0.9, roughness: 0.22 })
        : new THREE.MeshPhysicalMaterial({ color: led, roughness: 0.4, clearcoat: 0.4 });
  // ExtrudeGeometry 그룹 0 = 앞/뒷면, 1 = 옆면
  const mesh = new THREE.Mesh(geo, [face, side]);
  mesh.castShadow = true;
  mesh.position.z = spec.lighting === 'halo' ? HALO_STANDOFF : 0;
  mesh.userData.signId = spec.id;
  group.add(mesh);

  // 글로우: 후광은 벽에 번지는 빛, 전광은 은은한 주변 번짐
  let glow: THREE.Mesh | null = null;
  if (spec.lighting !== 'none') {
    const pad = spec.heightMm * 0.8;
    const gw = widthMm + pad * 2, gh = spec.heightMm + pad * 2;
    const tex = glowTexture((ctx, s) => {
      const path = shapesToPath2D(shapes, (v) => [
        ((v.x - center.x) * k + gw / 2) * s,
        (gh / 2 - (v.y - center.y) * k) * s,
      ]);
      ctx.fill(path, 'evenodd');
    }, gw, gh, '#' + led.getHexString(), [spec.heightMm * 0.2, spec.heightMm * 0.06]);
    glow = glowPlane(tex, gw, gh, 0.5);
    group.add(glow);
  }

  return {
    group,
    measured,
    setNight(night) {
      if ('emissiveIntensity' in face && spec.lighting === 'front') face.emissiveIntensity = night ? 1.7 : 0.12;
      if (glow) (glow.material as THREE.MeshBasicMaterial).opacity = night ? (spec.lighting === 'halo' ? 1 : 0.4) : 0;
    },
    dispose() {
      geo.dispose(); side.dispose(); face.dispose();
      if (glow) { glow.geometry.dispose(); (glow.material as THREE.MeshBasicMaterial).map?.dispose(); (glow.material as THREE.Material).dispose(); }
    },
  };
}

/** 박스 앞면에 입힐 이미지 (디자인 소스의 잘라낸 영역) */
export interface FaceImage { image: CanvasImageSource; sx: number; sy: number; sw: number; sh: number }

export function buildLightbox(spec: SignSpec, fontFamily: string, face?: FaceImage): BuiltSign {
  const group = new THREE.Group();
  const w = spec.widthMm, h = spec.heightMm, d = spec.depthMm;

  const canvas = document.createElement('canvas');
  const s = 1024 / Math.max(w, h);
  canvas.width = Math.ceil(w * s);
  canvas.height = Math.ceil(h * s);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = spec.faceColor;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (face) ctx.drawImage(face.image, face.sx, face.sy, face.sw, face.sh, 0, 0, canvas.width, canvas.height);
  const text = spec.text.trim();
  if (text && !face) {
    let size = canvas.height * 0.62;
    ctx.font = `800 ${size}px ${fontFamily}`;
    const maxW = canvas.width * 0.88;
    const mw = ctx.measureText(text).width;
    if (mw > maxW) { size *= maxW / mw; ctx.font = `800 ${size}px ${fontFamily}`; }
    ctx.fillStyle = spec.textColor;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.letterSpacing = `${spec.letterSpacing * size}px`;
    ctx.fillText(text, canvas.width / 2, canvas.height / 2 + size * 0.04);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;

  const lit = spec.lighting !== 'none';
  const front = new THREE.MeshPhysicalMaterial({
    map: tex, emissiveMap: lit ? tex : null, emissive: lit ? 0xffffff : 0x000000, roughness: 0.3, clearcoat: 0.5,
  });
  const frame = new THREE.MeshStandardMaterial({ color: spec.sideColor, metalness: 0.7, roughness: 0.4 });
  const geo = new THREE.BoxGeometry(w, h, d);
  // BoxGeometry 재질 순서: +x, -x, +y, -y, +z(앞), -z
  const mesh = new THREE.Mesh(geo, [frame, frame, frame, frame, front, frame]);
  mesh.position.z = d / 2;
  mesh.castShadow = true;
  mesh.userData.signId = spec.id;
  group.add(mesh);

  let glow: THREE.Mesh | null = null;
  if (lit) {
    const pad = Math.min(w, h) * 0.5;
    const gw = w + pad * 2, gh = h + pad * 2;
    const gt = glowTexture((c, sc) => c.fillRect(pad * sc, pad * sc, w * sc, h * sc), gw, gh, spec.faceColor, [pad * 0.4, pad * 0.12]);
    glow = glowPlane(gt, gw, gh, 0.5);
    group.add(glow);
  }

  return {
    group,
    measured: { widthMm: w, heightMm: h, charCount: [...text].filter((c) => c.trim()).length },
    setNight(night) {
      front.emissiveIntensity = night ? 0.85 : 0.1;
      if (glow) (glow.material as THREE.MeshBasicMaterial).opacity = night ? 0.35 : 0;
    },
    dispose() {
      geo.dispose(); tex.dispose(); front.dispose(); frame.dispose();
      if (glow) { glow.geometry.dispose(); (glow.material as THREE.MeshBasicMaterial).map?.dispose(); (glow.material as THREE.Material).dispose(); }
    },
  };
}
