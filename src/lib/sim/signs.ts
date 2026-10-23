// 간판 사양(SignSpec) → Three.js 메쉬. 모든 단위 mm, 벽면 = z 0 평면, +z = 벽 밖(카메라 쪽).
import * as THREE from 'three';
import type { Font } from 'opentype.js';
import type { Measured, SignSpec } from './types';
import { shapesToPath2D, textToShapes } from '../core/textShapes';
import { solveHomography } from '../core/homography';

/** 후광 채널의 벽 이격(스페이서) 거리 */
const HALO_STANDOFF = 35;
/** 채널 몸통 금속 (2026-10-23): 도장 · 헤어라인 · 거울(미러·티타늄) */
const METAL = { paint: { metalness: 0.6, roughness: 0.5 }, hairline: { metalness: 0.9, roughness: 0.32 }, mirror: { metalness: 1, roughness: 0.08 } } as const;

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
  mesh.userData.part = 'glow'; // 벽에 번지는 빛 — 상자를 뒤로 물려도 벽면(z=0)에 남긴다
  return mesh;
}

/**
 * 외곽선 = 사인물 **앞면** (2026-10-17 사용자: "두께를 주는 사인물의 경우 3d에서 나오는 것을 반대로 … 바탕만 반대 방향으로 익스트루드하고 채널과 스카시는 현재와 같이").
 * 상자와 그 위 것들(글자·상단 조명)을 두께만큼 벽 쪽(-z)으로 물려 상자 앞면이 z=0(그린 외곽선)에 오게 한다 → 입체 글자는 외곽선 면에서 카메라 쪽으로 선다.
 * 천갈이(기존 틀)와 프레임 새로 설치가 같은 외곽선을 쓸 수 있다. 벽 번짐(glow)은 벽에 그대로. warpToQuad 가 정점 x·y 만 보므로 z 는 정점에 굽는다
 */
export function recessBox(group: THREE.Group, depthMm: number) {
  if (!(depthMm > 0)) return;
  const done = new Set<THREE.BufferGeometry>();
  group.traverse((obj) => {
    const m = obj as THREE.Mesh;
    if (!m.isMesh || m.userData.part === 'glow' || done.has(m.geometry)) return;
    done.add(m.geometry);
    m.geometry.translate(0, 0, -depthMm);
  });
}

export interface ChannelGeometry {
  geometry: THREE.ExtrudeGeometry;
  measured: Measured;
  /** 원본 글자 윤곽(폰트 단위)과 mm 변환 정보 — 글로우 텍스처용. scaleX = 가로 배율(상자 맞춤으로 늘이고 줄인 만큼, 기본 = scale) */
  shapes: THREE.Shape[];
  center: THREE.Vector2;
  scale: number;
  scaleX: number;
}

/** 입체 글자 형상 (DOM 불필요 → 단위 테스트 대상). 중심 = 원점, 앞면 z = depth */
export function channelGeometry(spec: SignSpec, font: Font): ChannelGeometry {
  const text = spec.text.trim() || ' ';
  const shapes = textToShapes(font, text, spec.letterSpacing);
  if (!shapes.length) throw new Error('글자 윤곽이 없습니다 (폰트에 없는 글자·공백만)');
  const geometry = new THREE.ExtrudeGeometry(shapes, { depth: spec.depthMm, bevelEnabled: false, curveSegments: 6 });
  geometry.computeBoundingBox();
  const bb = geometry.boundingBox!.clone(); // translate/scale 이 boundingBox 를 갱신하므로 복사
  const fit = spec.fitBox;
  // 상자 맞춤(2026-10-18): 정면도·2D 와 같이 폰트 크기 = 상자 높이 90% (윤곽 단위 1000 = 폰트 크기), 세로 중심 = 글자 상자(어센더~디센더) 가운데(dominant-baseline central)
  // 아니면 잉크 높이 = heightMm
  const k = fit ? (fit.h * 0.9) / 1000 : spec.heightMm / Math.max(1, bb.max.y - bb.min.y);
  const emMid = ((font.ascender + font.descender) / 2) * (1000 / font.unitsPerEm);
  const center = new THREE.Vector2((bb.min.x + bb.max.x) / 2, fit ? emMid : (bb.min.y + bb.max.y) / 2);
  // 상자 폭 96% 에 늘이고 줄임 (textLength spacingAndGlyphs)
  const kx = fit ? (fit.w * 0.96) / Math.max(1e-6, (bb.max.x - bb.min.x) * k) * k : k;
  // 폰트 단위 → mm. 두께(z)는 이미 mm 이므로 x,y 만 스케일
  geometry.translate(-center.x, -center.y, 0);
  geometry.scale(kx, k, 1);
  geometry.computeVertexNormals();
  return {
    geometry,
    shapes,
    center,
    scale: k,
    scaleX: kx,
    measured: {
      widthMm: (bb.max.x - bb.min.x) * kx,
      heightMm: spec.heightMm,
      charCount: [...text].filter((c) => c.trim()).length,
    },
  };
}

/**
 * 사양대로 만든다: 채널 = 입체 글자, 박스 = 상자, 박스 + letters = 상자 앞면 위에 입체 글자(간판 몸통 + 채널 옵션).
 * 글자는 박스 폭의 90% 안에 맞추고 가운데에 놓는다
 */
/**
 * 간판 상단 조명 3D (2026-10-16 사용자: "간판에 상단에 돌출 조명, 트러스트바형식의 간접조명, 트러스트 타공조명 등을 자동 모델링"):
 * 사인물 좌표(가로 중심 0, 위 끝 = h/2, 벽 z=0 → 앞면 z=d)에 부품을 만든다. 그린 사각형 맞춤(warpToQuad)이 정점에 적용되므로
 * 모든 변환은 정점에 굽고 메쉬는 위치·회전 없이 둔다. 낮에는 기구만, 밤에는 빛 줄기·면 번짐·점이 켜진다
 */
/**
 * frameColor = 간판 프레임(상자 옆면) 색 — 기구 색이 "간판과 같은 색"이면 이 색. 위치(side)가 하단·좌·우면 상단 기준으로 만든 뒤 정점을 돌린다(좌·우는 간판 세로가 길이)
 */
export function topLightMeshes(tl: import('../core/topLight').TopLightSpec, W: number, H: number, d: number, frameColor?: string): { meshes: THREE.Mesh[]; setNight(night: boolean): void; dispose(): void } {
  const side = tl.side ?? 'top';
  const vertical = side === 'left' || side === 'right';
  const w = vertical ? H : W, h = vertical ? W : H; // 상단 기준 좌표계의 가로·세로
  const meshes: THREE.Mesh[] = [];
  const light = new THREE.Color(tl.color);
  const fixtureColor = tl.fixture === 'sign' ? frameColor : tl.fixture; // 2026-10-19 기구 색: 간판과 같은 색 / 색 지정
  const metal = new THREE.MeshStandardMaterial({ color: fixtureColor ?? (tl.kind === 'perf' ? '#2b2f33' : '#4a4f55'), metalness: 0.6, roughness: 0.5 });
  const glowMat = new THREE.MeshStandardMaterial({ color: '#dddddd', emissive: light, emissiveIntensity: 0, roughness: 0.5 });
  const beamMat = new THREE.MeshBasicMaterial({ color: light, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const washMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, part: string) => { const m = new THREE.Mesh(geo, mat); m.userData.part = part; m.castShadow = part !== 'beam' && part !== 'wash'; meshes.push(m); return m; };
  /** 위가 밝고 아래로 사라지는 면 번짐 (정점 색, 더하기 합성) */
  const wash = (strength: number) => {
    const g = new THREE.PlaneGeometry(w, h * 0.7, 1, 8);
    g.translate(0, h / 2 - h * 0.35, d + 1.5);
    const pos = g.attributes.position, cols: number[] = [];
    for (let i = 0; i < pos.count; i++) { const t = Math.max(0, (pos.getY(i) - (h / 2 - h * 0.7)) / (h * 0.7)) ** 2 * strength; cols.push(light.r * t, light.g * t, light.b * t); }
    g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    add(g, washMat, 'wash');
  };
  const barY = h / 2 + 32.5, barZ = d + 35;
  if (tl.kind === 'arm') {
    const n = Math.max(1, tl.count);
    for (let i = 0; i < n; i++) {
      const x = -w / 2 + ((i + 0.5) * w) / n;
      const A = new THREE.Vector3(x, h / 2 + 20, d * 0.5), B = new THREE.Vector3(x, h / 2 + 120, d + tl.armMm);
      const dir = B.clone().sub(A), len = dir.length();
      const arm = new THREE.BoxGeometry(24, 24, len);
      arm.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir.clone().normalize()));
      arm.translate((A.x + B.x) / 2, (A.y + B.y) / 2, (A.z + B.z) / 2);
      add(arm, metal, 'arm');
      const head = new THREE.BoxGeometry(160, 50, 90);
      head.rotateX(0.6); // 간판 쪽으로 숙임
      head.translate(B.x, B.y, B.z);
      add(head, glowMat, 'head');
      // 빛 줄기: 등기구 → 간판 위쪽 1/3 지점
      const T = new THREE.Vector3(x, h / 2 - h * 0.35, d + 5), bd = T.clone().sub(B), L = bd.length();
      const beam = new THREE.ConeGeometry(Math.max(150, Math.min(w / n, h) * 0.45), L, 24, 1, true);
      beam.translate(0, -L / 2, 0);
      beam.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), bd.normalize()));
      beam.translate(B.x, B.y, B.z);
      add(beam, beamMat, 'beam');
    }
    wash(0.5);
  } else {
    const bar = new THREE.BoxGeometry(w, 45, 70);
    bar.translate(0, barY, barZ);
    add(bar, metal, 'bar');
    if (tl.kind === 'bar') {
      const led = new THREE.BoxGeometry(w * 0.98, 6, 30);
      led.translate(0, h / 2 + 7, d + 50);
      add(led, glowMat, 'led');
      wash(0.9);
    } else {
      // 타공 점 조명: 수량(비우면 120mm 마다). 빛 방향 정면 = 바 앞면에서 보는 사람 쪽 / 간판 쪽(간접) = 바 아랫면에서 간판 면을 비춤 (2026-10-19)
      const n = Math.max(1, tl.count || Math.floor(w / 120));
      const toSign = tl.aim === 'sign';
      for (let i = 0; i < n; i++) {
        const dot = new THREE.BoxGeometry(22, toSign ? 6 : 22, toSign ? 22 : 6);
        dot.translate(-w / 2 + ((i + 0.5) * w) / n, toSign ? barY - 25.5 : barY, toSign ? barZ : d + 73);
        add(dot, glowMat, 'dot');
      }
      wash(toSign ? 0.9 : 0.45);
    }
  }
  // 위치: 상단 기준으로 만든 것을 간판 중심 둘레로 돌린다 (하단 180°, 좌 +90°, 우 −90°)
  if (side !== 'top') {
    const rot = new THREE.Matrix4().makeRotationZ(side === 'bottom' ? Math.PI : side === 'left' ? Math.PI / 2 : -Math.PI / 2);
    for (const m of meshes) m.geometry.applyMatrix4(rot);
  }
  return {
    meshes,
    setNight(night) {
      glowMat.emissiveIntensity = night ? 2 : 0;
      beamMat.opacity = night ? 0.1 : 0; // 원뿔 안·밖 두 겹이 더해져 실제로는 더 밝다 — 글자를 덮지 않게
      washMat.opacity = night ? 0.85 : 0;
    },
    dispose() { for (const m of meshes) m.geometry.dispose(); metal.dispose(); glowMat.dispose(); beamMat.dispose(); washMat.dispose(); },
  };
}
/** 만든 간판에 상단 조명을 더한다 (사양에 있을 때) */
/** 부속 3D (2026-10-19): 몰딩 = 앞 테두리 띠(폭 widthMm, 앞으로 살짝 나옴), 지주 = 간판 아래 지면까지 + 간판 뒤로 올라간 기둥. 정점에 굽는다(warpToQuad·recessBox 와 함께 움직임) */
export function accessoryMeshes(list: NonNullable<SignSpec['accessories']>, w: number, h: number, d: number): { meshes: THREE.Mesh[]; dispose(): void } {
  const meshes: THREE.Mesh[] = [];
  const mats: THREE.Material[] = [];
  const box = (sx: number, sy: number, sz: number, x: number, y: number, z: number, mat: THREE.Material, part: string) => { const g = new THREE.BoxGeometry(sx, sy, sz); g.translate(x, y, z); const m = new THREE.Mesh(g, mat); m.userData.part = part; m.castShadow = true; meshes.push(m); };
  for (const a of list) {
    const mat = new THREE.MeshStandardMaterial({ color: a.color, metalness: 0.7, roughness: 0.35 });
    mats.push(mat);
    if (a.kind === 'molding') {
      const t = a.widthMm, z = d + 4, dz = Math.max(16, d * 0.25); // 앞면 가장자리를 감싸는 띠
      if (a.edges !== 'lr') { box(w + t, t, dz, 0, h / 2, z - dz / 2 + 4, mat, 'molding'); box(w + t, t, dz, 0, -h / 2, z - dz / 2 + 4, mat, 'molding'); }
      if (a.edges !== 'tb') { box(t, h + (a.edges === 'all' ? -t : t), dz, -w / 2, 0, z - dz / 2 + 4, mat, 'molding'); box(t, h + (a.edges === 'all' ? -t : t), dz, w / 2, 0, z - dz / 2 + 4, mat, 'molding'); }
    } else {
      const s = a.sizeMm, len = a.heightMm + h, cy = h / 2 - len / 2;
      const xs = a.count <= 1 ? [0] : Array.from({ length: a.count }, (_, i) => -w / 2 + s * 1.5 + (i * (w - s * 3)) / (a.count - 1));
      for (const x of xs) box(s, len, s, x, cy, d / 2, mat, 'pole');
    }
  }
  return { meshes, dispose() { for (const m of meshes) m.geometry.dispose(); for (const m of mats) m.dispose(); } };
}
function withAccessories(b: BuiltSign, spec: SignSpec): BuiltSign {
  if (!spec.accessories?.length) return b;
  const t = accessoryMeshes(spec.accessories, spec.widthMm, spec.heightMm, spec.depthMm);
  for (const m of t.meshes) b.group.add(m);
  return { ...b, dispose() { b.dispose(); t.dispose(); } };
}
function withTopLights(b: BuiltSign, spec: SignSpec): BuiltSign {
  if (!spec.topLight) return b;
  const t = topLightMeshes(spec.topLight, spec.widthMm, spec.heightMm, spec.depthMm, spec.sideColor); // 기구 색 '간판과 같은 색' = 프레임 색
  for (const m of t.meshes) b.group.add(m);
  return { ...b, setNight(night) { b.setNight(night); t.setNight(night); }, dispose() { b.dispose(); t.dispose(); } };
}

/** images = 앞면 그림 객체(faceItems)의 그림, 객체 id → 이미지 */
export function buildSign(spec: SignSpec, font: Font, fontFamily: string, face?: FaceImage, images?: Record<string, CanvasImageSource>): BuiltSign {
  return withAccessories(withTopLights(buildSignBody(spec, font, fontFamily, face, images), spec), spec);
}

/** 그룹 안 모든 메쉬의 형상을 옮긴다 — warpToQuad 가 정점만 보므로 위치를 그룹 변환이 아니라 정점에 굽는다 */
function bakeOffset(group: THREE.Group, x: number, y: number, z: number) {
  group.traverse((obj) => { const m = obj as THREE.Mesh; if (m.isMesh) m.geometry.translate(x, y, z); });
}

/**
 * 조합형 4단계 (2026-10-16): 글자 객체마다 입체 글자를 정면도 자리에 (상자 앞면 위, 몸통 없음이면 벽 위). 크기는 정한 높이 그대로.
 * 폰트에 없는 글자 등으로 못 만든 객체는 건너뛴다
 */
function withLetterItems(box: BuiltSign, spec: SignSpec, font: Font): BuiltSign {
  const built: BuiltSign[] = [];
  for (const L of spec.letterItems ?? []) {
    let b: BuiltSign;
    try { b = buildChannel({ ...spec, kind: 'channel', text: L.text, heightMm: L.heightMm, ...(L.widthMm ? { fitBox: { w: L.widthMm, h: L.heightMm } } : {}), depthMm: L.depthMm, lighting: L.lighting, faceColor: L.faceColor, sideColor: L.sideColor, letterSpacing: L.letterSpacing, x: 0, y: 0, finish: L.finish, standoffMm: L.standoffMm, backLit: L.backLit, haloColor: L.haloColor }, font); }
    catch { continue; }
    bakeOffset(b.group, L.x, L.y, (spec.bodyless ? 0 : spec.depthMm) + (L.z ?? 0)); // z = 깊이 누적 (2단계: 시트 위에 선 채널)
    box.group.add(b.group);
    built.push(b);
  }
  return {
    group: box.group,
    measured: box.measured,
    setNight(night) { box.setNight(night); for (const b of built) b.setNight(night); },
    dispose() { box.dispose(); for (const b of built) b.dispose(); },
  };
}

function buildSignBody(spec: SignSpec, font: Font, fontFamily: string, face?: FaceImage, images?: Record<string, CanvasImageSource>): BuiltSign {
  if (spec.kind === 'channel') return buildChannel(spec, font);
  const box = buildLightbox(spec, fontFamily, face, images);
  if (spec.letterItems) return withLetterItems(box, spec, font);
  const L = spec.letters;
  if (!L || !L.text.trim()) return box;
  let letters: BuiltSign;
  try { letters = buildChannel({ ...spec, fitBox: undefined, kind: 'channel', text: L.text, heightMm: L.heightMm, widthMm: spec.widthMm, depthMm: L.depthMm, lighting: L.lighting, faceColor: L.faceColor, sideColor: L.sideColor, letterSpacing: L.letterSpacing, x: 0, y: 0 }, font); }
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
  const { geometry: geo, measured, shapes, center, scale: k, scaleX: kx } = channelGeometry(spec, font);
  const widthMm = measured.widthMm;

  const led = new THREE.Color(spec.faceColor);
  // 재질: 거울 같은 금속(metalness 0.85·roughness 0.3)이 환경맵 창을 그대로 비춰 번들거렸음 → 도장 금속에 가깝게 (2026-10-17 "스팩큘러가 과도하다")
  // 몸통 마감 (2026-10-23 L2): 헤어라인 = 결 있는 금속, 미러·티타늄 = 거울 — 도장보다 반사가 강하다
  const metal = METAL[spec.finish ?? 'paint'];
  const side = new THREE.MeshStandardMaterial({ color: spec.sideColor, ...metal });
  const face =
    spec.lighting === 'front'
      ? new THREE.MeshPhysicalMaterial({ color: led, emissive: led, roughness: 0.7, clearcoat: 0.05 }) // 반사광에 글자가 씻기지 않게 (2026-10-15)
      : spec.lighting === 'halo'
        ? new THREE.MeshStandardMaterial({ color: spec.sideColor, ...(spec.finish ? metal : { metalness: 0.7, roughness: 0.45 }) })
        : new THREE.MeshPhysicalMaterial({ color: led, roughness: 0.7, clearcoat: 0.05 });
  // ExtrudeGeometry 그룹 0 = 앞/뒷면, 1 = 옆면
  const mesh = new THREE.Mesh(geo, [face, side]);
  mesh.castShadow = true;
  mesh.position.z = spec.standoffMm ?? (spec.lighting === 'halo' ? HALO_STANDOFF : 0); // 까치발 띄움 거리 (2026-10-23)
  mesh.userData.signId = spec.id;
  group.add(mesh);

  // 글로우: 후광은 벽에 번지는 빛, 전광은 은은한 주변 번짐. 전후광(backLit)은 앞면 발광 + 벽 후광, 띄움이 클수록 넓게 번진다 (2026-10-23)
  const haloish = spec.lighting === 'halo' || !!spec.backLit;
  const spread = haloish ? Math.min(2, Math.max(0.6, (spec.standoffMm ?? HALO_STANDOFF) / HALO_STANDOFF)) : 1;
  const glowColor = new THREE.Color(spec.haloColor ?? spec.faceColor);
  let glow: THREE.Mesh | null = null;
  if (spec.lighting !== 'none') {
    const pad = spec.heightMm * 0.8;
    const gw = widthMm + pad * 2, gh = spec.heightMm + pad * 2;
    const tex = glowTexture((ctx, s) => {
      const path = shapesToPath2D(shapes, (v) => [
        ((v.x - center.x) * kx + gw / 2) * s,
        (gh / 2 - (v.y - center.y) * k) * s,
      ]);
      ctx.fill(path, 'evenodd');
    }, gw, gh, '#' + glowColor.getHexString(), [spec.heightMm * 0.2 * spread, spec.heightMm * 0.06 * spread]);
    glow = glowPlane(tex, gw, gh, 0.5);
    group.add(glow);
  }

  return {
    group,
    measured,
    setNight(night) {
      if ('emissiveIntensity' in face && spec.lighting === 'front') face.emissiveIntensity = night ? 1.7 : 0.12;
      if (glow) (glow.material as THREE.MeshBasicMaterial).opacity = night ? (haloish ? 1 : 0.4) : 0;
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
  // 벽 좌표가 거울상(원근 축 하나를 리버스)이면 꼭짓점이 뒤집혀 놓여 삼각형 감김이 반대가 된다 → 감김을 되돌린다
  // (2026-10-15 사용자: "원근에서 x축 방향으로 리버스하면 3d가 뒤집어진다"). 중심에서의 야코비안 부호 = det(H)/d³
  const det = H[0] * (H[4] * H[8] - H[5] * H[7]) - H[1] * (H[3] * H[8] - H[5] * H[6]) + H[2] * (H[3] * H[7] - H[4] * H[6]);
  const mirrored = det / H[8] ** 3 < 0;
  const done = new Set<THREE.BufferGeometry>(); // 같은 지오메트리를 두 메쉬가 나눠 쓰면 한 번만
  group.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    const g = mesh.geometry as THREE.BufferGeometry;
    if (done.has(g)) return;
    done.add(g);
    const pos = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i) * scale, y = pos.getY(i) * scale;
      const d = H[6] * x + H[7] * y + H[8];
      pos.setXY(i, (H[0] * x + H[1] * y + H[2]) / d, (H[3] * x + H[4] * y + H[5]) / d);
    }
    if (mirrored) reverseWinding(g);
    pos.needsUpdate = true;
    g.computeVertexNormals();
    g.computeBoundingBox(); g.computeBoundingSphere();
  });
  group.position.set(0, 0, 0);
  group.scale.setScalar(1);
}

/**
 * 상자를 박스 방향으로 (2026-10-15 사용자: "박스만 회전하고 크기는 외곽선만"): 면 좌표 z(두께)를 dir 방향으로 뻗게 한다 — 앞면(외곽선)은 그대로,
 * 두께만 기운다. dir 은 면 좌표의 단위 벡터(카메라 쪽). 없으면 면의 법선이고, 법선이 벽 안쪽이면(flip) 뒤집는다.
 * 박스 방향이 면과 거의 나란하면(두께가 사라짐) z 성분을 0.15 로 둔다
 */
export function orientBox(group: THREE.Group, dir: [number, number, number] | null, flip: boolean) {
  if (!dir) { if (flip) group.scale.z = -1; return; }
  const dz = Math.sign(dir[2] || 1) * Math.max(Math.abs(dir[2]), 0.15);
  group.matrixAutoUpdate = false;
  group.matrix.set(1, 0, dir[0], 0, 0, 1, dir[1], 0, 0, 0, dz, 0, 0, 0, 0, 1);
  group.matrixWorldNeedsUpdate = true;
}

/** 삼각형마다 두 꼭짓점을 바꿔 감김(앞뒤)을 뒤집는다. 인덱스가 있으면 인덱스만, 없으면 모든 속성을 */
function reverseWinding(g: THREE.BufferGeometry) {
  if (g.index) {
    const idx = g.index;
    for (let t = 0; t + 2 < idx.count; t += 3) { const b = idx.getX(t + 1); idx.setX(t + 1, idx.getX(t + 2)); idx.setX(t + 2, b); }
    idx.needsUpdate = true;
    return;
  }
  for (const name of Object.keys(g.attributes)) {
    const a = g.attributes[name] as THREE.BufferAttribute;
    for (let t = 0; t + 2 < a.count; t += 3) for (let k = 0; k < a.itemSize; k++) {
      const b = a.getComponent(t + 1, k); a.setComponent(t + 1, k, a.getComponent(t + 2, k)); a.setComponent(t + 2, k, b);
    }
    a.needsUpdate = true;
  }
}

/** 박스 앞면에 입힐 이미지 (디자인 소스의 잘라낸 영역) */
export interface FaceImage { image: CanvasImageSource; sx: number; sy: number; sw: number; sh: number }

export function buildLightbox(spec: SignSpec, fontFamily: string, face?: FaceImage, images?: Record<string, CanvasImageSource>): BuiltSign {
  const group = new THREE.Group();
  const w = spec.widthMm, h = spec.heightMm, d = spec.depthMm;

  const canvas = document.createElement('canvas');
  const s = 1024 / Math.max(w, h);
  canvas.width = Math.ceil(w * s);
  canvas.height = Math.ceil(h * s);
  const ctx = canvas.getContext('2d')!;
  if (!spec.clearFace) { ctx.fillStyle = spec.faceColor; ctx.fillRect(0, 0, canvas.width, canvas.height); } // 시트만 = 바탕 투명 (2026-10-22)
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
  // 조합형 앞면 객체 (그림, 시트의 글자, 도형): 정면도 자리에 평면으로 (2026-10-16 4단계). 앞면에서 올라선 것(z > 0.5mm: 채널 앞면 위 시트 — 2단계)은 텍스처가 아니라 그 높이의 얇은 판으로
  const raised = (spec.faceItems ?? []).filter((it) => (it.z ?? 0) > 0.5);
  for (const it of (spec.faceItems ?? []).filter((it) => !((it.z ?? 0) > 0.5))) drawFaceItem(ctx, it, (w / 2 + it.x - it.w / 2) * s, (h / 2 - it.y - it.h / 2) * s, it.w * s, it.h * s, images?.[it.id], fontFamily);
  const planes = raised.map((it) => facePlane(it, d, images?.[it.id], fontFamily));
  // 앞면 테: 프레임이 판을 둘러싸는 종류(후렉스·라이트패널·액자…)는 테를 프레임 색으로 그려 판과 구별 (2026-10-17 "3d에서 프레임과 판을 구별하나?")
  if (spec.frameMm && spec.frameMm > 0 && !spec.bodyless) {
    const fm = spec.frameMm * s;
    const rr = Math.max(0, Math.min(0.5, spec.corner ?? 0)) * Math.min(canvas.width, canvas.height);
    ctx.save();
    ctx.beginPath();
    if (rr > 0 && typeof ctx.roundRect === 'function') ctx.roundRect(0, 0, canvas.width, canvas.height, rr); else ctx.rect(0, 0, canvas.width, canvas.height);
    ctx.lineWidth = fm * 2; // 선 가운데가 가장자리라 안쪽으로 fm 만큼
    ctx.strokeStyle = spec.sideColor;
    ctx.stroke();
    ctx.restore();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const rounded = !!spec.corner;
  // ExtrudeGeometry 의 UV 는 형상 좌표(mm) 그대로 → 앞면 전체가 0~1 이 되게
  if (rounded) { tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping; tex.repeat.set(1 / w, 1 / h); tex.offset.set(0.5, 0.5); }

  const lit = spec.lighting !== 'none';
  const front = new THREE.MeshPhysicalMaterial({
    ...(spec.clearFace ? { transparent: true, depthWrite: false } : {}),
    map: tex, emissiveMap: lit ? tex : null, emissive: lit ? 0xffffff : 0x000000, roughness: 0.75, clearcoat: 0.05, // 앞면 반사광이 디자인·글자를 덮지 않게
  });
  const frame = new THREE.MeshStandardMaterial({ color: spec.sideColor, metalness: 0.5, roughness: 0.55, ...(spec.clearFace ? { visible: false } : {}) }); // 시트만 = 옆면 없음
  const geo = lightboxGeometry(w, h, d, spec.corner);
  // 그룹 0 = 앞·뒷면, 1 = 옆면 (뒷면은 벽에 붙어 보이지 않음)
  const mesh = new THREE.Mesh(geo, [front, frame]);
  mesh.castShadow = !spec.clearFace; // 시트는 그림자 없음
  mesh.userData.signId = spec.id;
  mesh.visible = !spec.bodyless; // 몸통 없음: 상자는 자리만 (글자만 보임)
  group.add(mesh);
  for (const pl of planes) group.add(pl.mesh);

  let glow: THREE.Mesh | null = null;
  if (lit && !spec.bodyless) {
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
      for (const pl of planes) pl.dispose();
      if (glow) { glow.geometry.dispose(); (glow.material as THREE.MeshBasicMaterial).map?.dispose(); (glow.material as THREE.Material).dispose(); }
    },
  };
}

type FaceItem = NonNullable<SignSpec['faceItems']>[number];
/** 앞면 객체 하나를 캔버스에 (텍스처·올라선 판 공용): 그림 / 글자(상자 폭 96% 에 맞춤) / 도형(사각·원·선, 채움·선 색) */
function drawFaceItem(ctx: CanvasRenderingContext2D, it: FaceItem, left: number, top: number, w: number, h: number, img: CanvasImageSource | undefined, fontFamily: string) {
  if (it.kind === 'image') { if (img) ctx.drawImage(img, left, top, w, h); return; }
  if (it.kind === 'shape') {
    const fill = it.fill ?? null, stroke = it.stroke ?? (it.fill ? null : it.color);
    ctx.save();
    if (it.opacity !== undefined) ctx.globalAlpha = Math.max(0, Math.min(1, it.opacity)); // 안개 시트 반투명
    ctx.lineWidth = Math.max(1, Math.max(w, h) * 0.02);
    if (it.shape === 'line') { ctx.strokeStyle = it.stroke ?? it.fill ?? it.color; ctx.lineWidth = Math.max(1, h * 0.5); ctx.beginPath(); ctx.moveTo(left, top + h / 2); ctx.lineTo(left + w, top + h / 2); ctx.stroke(); ctx.restore(); return; }
    ctx.beginPath();
    if (it.shape === 'ellipse') ctx.ellipse(left + w / 2, top + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2); else ctx.rect(left, top, w, h);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.stroke(); }
    ctx.restore();
    return;
  }
  if (!it.text) return;
  const size = h * 0.9;
  ctx.save();
  ctx.font = `800 ${size}px ${fontFamily}`;
  const mw = ctx.measureText(it.text).width;
  ctx.translate(left + w / 2, top + h / 2);
  if (mw > 0) ctx.scale((w * 0.96) / mw, 1); // 2D 와 같이 상자 폭 96% 에 늘이고 줄임 (2026-10-18)
  ctx.fillStyle = it.color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(it.text, 0, 0);
  ctx.restore();
}
/** 앞면에서 올라선 객체(2단계: 채널 앞면 위 시트의 글자·그림·도형) = 그 높이에 떠 있는 얇은 판. 자리는 정점에 굽는다(warpToQuad·recessBox 가 정점만 보므로) */
function facePlane(it: FaceItem, boxDepth: number, img: CanvasImageSource | undefined, fontFamily: string): { mesh: THREE.Mesh; dispose(): void } {
  const canvas = document.createElement('canvas');
  const s = 512 / Math.max(it.w, it.h, 1);
  canvas.width = Math.max(2, Math.ceil(it.w * s)); canvas.height = Math.max(2, Math.ceil(it.h * s));
  drawFaceItem(canvas.getContext('2d')!, it, 0, 0, canvas.width, canvas.height, img, fontFamily);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
  const geo = new THREE.PlaneGeometry(it.w, it.h);
  geo.translate(it.x, it.y, boxDepth + (it.z ?? 0) + 0.3);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.userData.part = 'faceItem';
  return { mesh, dispose() { geo.dispose(); tex.dispose(); mat.dispose(); } };
}
