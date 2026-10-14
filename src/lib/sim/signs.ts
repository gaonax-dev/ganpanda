// 간판 사양(SignSpec) → Three.js 메쉬. 모든 단위 mm, 벽면 = z 0 평면, +z = 벽 밖(카메라 쪽).
import * as THREE from 'three';
import type { Font } from 'opentype.js';
import type { Measured, SignSpec } from './types';
import { shapesToPath2D, textToShapes } from '../core/textShapes';
import { solveHomography } from '../core/homography';

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
  if (!shapes.length) throw new Error('글자 윤곽이 없습니다 (폰트에 없는 글자·공백만)');
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

/**
 * 사양대로 만든다: 채널 = 입체 글자, 박스 = 상자, 박스 + letters = 상자 앞면 위에 입체 글자(간판 몸통 + 채널 옵션).
 * 글자는 박스 폭의 90% 안에 맞추고 가운데에 놓는다
 */
export function buildSign(spec: SignSpec, font: Font, fontFamily: string, face?: FaceImage): BuiltSign {
  if (spec.kind === 'channel') return buildChannel(spec, font);
  const box = buildLightbox(spec, fontFamily, face);
  const L = spec.letters;
  if (!L || !L.text.trim()) return box;
  let letters: BuiltSign;
  try { letters = buildChannel({ ...spec, kind: 'channel', text: L.text, heightMm: L.heightMm, widthMm: spec.widthMm, depthMm: L.depthMm, lighting: L.lighting, faceColor: L.faceColor, sideColor: L.sideColor, letterSpacing: L.letterSpacing, x: 0, y: 0 }, font); }
  catch { return box; } // 글자를 만들 수 없으면(폰트에 없는 글자) 상자만
  const k = Math.min(1, (spec.widthMm * 0.9) / Math.max(1, letters.measured.widthMm), (spec.heightMm * 0.9) / L.heightMm);
  letters.group.scale.setScalar(k);
  letters.group.position.set(0, 0, spec.depthMm); // 상자 앞면 위
  box.group.add(letters.group);
  return {
    group: box.group,
    measured: box.measured,
    setNight(night) { box.setNight(night); letters.setNight(night); },
    dispose() { box.dispose(); letters.dispose(); },
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

/** 박스 형상: 중심 원점, 벽(z=0)에서 앞면(z=depth)까지. corner 가 있으면 둥근 사각형을 밀어낸다. 재질 그룹 0 = 앞·뒷면, 1 = 옆면 */
export function lightboxGeometry(w: number, h: number, d: number, corner = 0): THREE.BufferGeometry {
  const r = Math.max(0, Math.min(0.5, corner)) * Math.min(w, h);
  if (r <= 0) {
    const g = new THREE.BoxGeometry(w, h, d);
    g.translate(0, 0, d / 2);
    // BoxGeometry 그룹(+x,-x,+y,-y,+z,-z) → 앞·뒷면 = 0, 옆면 = 1 로 재정렬
    const groups = g.groups.map((gr) => ({ ...gr }));
    g.clearGroups();
    for (const [i, gr] of groups.entries()) g.addGroup(gr.start, gr.count, i === 4 || i === 5 ? 0 : 1);
    return g;
  }
  const s = new THREE.Shape();
  const x0 = -w / 2, x1 = w / 2, y0 = -h / 2, y1 = h / 2;
  s.moveTo(x0 + r, y0); s.lineTo(x1 - r, y0); s.absarc(x1 - r, y0 + r, r, -Math.PI / 2, 0, false);
  s.lineTo(x1, y1 - r); s.absarc(x1 - r, y1 - r, r, 0, Math.PI / 2, false);
  s.lineTo(x0 + r, y1); s.absarc(x0 + r, y1 - r, r, Math.PI / 2, Math.PI, false);
  s.lineTo(x0, y0 + r); s.absarc(x0 + r, y0 + r, r, Math.PI, Math.PI * 1.5, false);
  const g = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: false, curveSegments: 8 });
  g.computeVertexNormals();
  return g;
}

/**
 * 만든 사인물(중심 원점, 가로 w × 세로 h 의 직사각형 기준)을 벽면 위 **임의의 사각형**(TL,TR,BR,BL, mm)에 맞춘다.
 * 평면 안 호모그래피를 모든 정점의 x,y 에 적용(z 는 그대로) — 카메라가 벽과 조금 어긋나 있어도 사인물은 사용자가 그린 자리에 그대로 놓인다
 * (2026-10-14 사용자: "사진 위의 사인물 크기는 사용자가 그린 사인물에 맞물리면 된다"). scale 은 먼저 곱한다(글자 폭 맞춤)
 */
export function warpToQuad(group: THREE.Group, w: number, h: number, corners: [number, number][], scale = 1) {
  const H = solveHomography([[-w / 2, h / 2], [w / 2, h / 2], [w / 2, -h / 2], [-w / 2, -h / 2]], corners);
  group.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    const g = mesh.geometry as THREE.BufferGeometry;
    const pos = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i) * scale, y = pos.getY(i) * scale;
      const d = H[6] * x + H[7] * y + H[8];
      pos.setXY(i, (H[0] * x + H[1] * y + H[2]) / d, (H[3] * x + H[4] * y + H[5]) / d);
    }
    pos.needsUpdate = true;
    g.computeVertexNormals();
    g.computeBoundingBox(); g.computeBoundingSphere();
  });
  group.position.set(0, 0, 0);
  group.scale.setScalar(1);
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
  const rounded = !!spec.corner;
  // ExtrudeGeometry 의 UV 는 형상 좌표(mm) 그대로 → 앞면 전체가 0~1 이 되게
  if (rounded) { tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping; tex.repeat.set(1 / w, 1 / h); tex.offset.set(0.5, 0.5); }

  const lit = spec.lighting !== 'none';
  const front = new THREE.MeshPhysicalMaterial({
    map: tex, emissiveMap: lit ? tex : null, emissive: lit ? 0xffffff : 0x000000, roughness: 0.3, clearcoat: 0.5,
  });
  const frame = new THREE.MeshStandardMaterial({ color: spec.sideColor, metalness: 0.7, roughness: 0.4 });
  const geo = lightboxGeometry(w, h, d, spec.corner);
  // 그룹 0 = 앞·뒷면, 1 = 옆면 (뒷면은 벽에 붙어 보이지 않음)
  const mesh = new THREE.Mesh(geo, [front, frame]);
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
