// 3D 조명 환경맵 (2026-10-17 사용자: "docs/environments 환경맵이다 … three 의 라이팅에 사용되는 HDRI 다").
// 원본 EXR(1k, 8MB)은 docs/environments 에 두고, 웹에는 `scripts/exr2hdr.mjs` 로 줄인 512×256 RGBE .hdr(약 500KB)를 public/env 에 둔다.
// 뷰어는 먼저 RoomEnvironment 로 그리고, HDRI 가 내려오면 바꿔 끼운다(실패하면 RoomEnvironment 그대로). PMREM 결과는 렌더러마다 캐시
import * as THREE from 'three';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

export const ENVIRONMENTS = [
  { id: 'konigsallee', label: '도심 거리 (쾨니히스알레)' },
  { id: 'pergola_walkway', label: '야외 산책로' },
  { id: 'bloem_olive_house', label: '주택가' },
] as const;
export type EnvId = (typeof ENVIRONMENTS)[number]['id'];
/** 기본: 간판이 서는 곳과 가장 비슷한 도심 거리 */
export const DEFAULT_ENV: EnvId = 'konigsallee';
export const envUrl = (id: EnvId) => `${import.meta.env.BASE_URL ?? '/'}env/${id}.hdr`.replace(/\/\/+/g, '/');

const cache = new WeakMap<THREE.WebGLRenderer, Map<string, Promise<THREE.Texture | null>>>();
const hdriCache = new Map<string, Promise<THREE.DataTexture | null>>();

/** 즉시 쓸 수 있는 실내 환경맵 (HDRI 를 받기 전·실패 시) */
export function roomEnvironment(renderer: THREE.WebGLRenderer): THREE.Texture {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const tex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  return tex;
}

function loadHdri(id: EnvId): Promise<THREE.DataTexture | null> {
  let p = hdriCache.get(id);
  if (!p) {
    p = new HDRLoader().loadAsync(envUrl(id)).catch(() => null);
    hdriCache.set(id, p);
  }
  return p;
}

/** HDRI 환경맵 (PMREM). 못 받으면 null — 호출자는 RoomEnvironment 를 유지한다 */
export function loadEnvironment(renderer: THREE.WebGLRenderer, id: EnvId = DEFAULT_ENV): Promise<THREE.Texture | null> {
  let per = cache.get(renderer);
  if (!per) { per = new Map(); cache.set(renderer, per); }
  let p = per.get(id);
  if (!p) {
    p = loadHdri(id).then((hdri) => {
      if (!hdri) return null;
      const pmrem = new THREE.PMREMGenerator(renderer);
      const tex = pmrem.fromEquirectangular(hdri).texture;
      pmrem.dispose();
      return tex;
    });
    per.set(id, p);
  }
  return p;
}
