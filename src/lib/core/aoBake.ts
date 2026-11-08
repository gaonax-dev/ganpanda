// 사인물 AO(앰비언트 오클루전) 굽기의 순수 계산 — 하늘 방향·빛 → 회색·키 (2026-11-09 "디자인 파일이 들어오면 occ를 구워서 계속 사용 가능하지 않을까?" → ProgressiveLightMap).
// 굽기 자체(WebGL)는 render/aoBake.ts → docs/features/render-3d.md
import { fnv1a } from './proposal';

/** 앞(+z) 반구의 방향 n 개 — 코사인 가중(해머슬리 점열, 늘 같은 순서). 하늘 빛을 고르게 받는 AO 를 이 방향의 빛들로 쌓는다 */
export function skyDirs(n: number): [number, number, number][] {
  const out: [number, number, number][] = [];
  for (let i = 0; i < n; i++) {
    let bits = i, rad = 0, f = 0.5;
    while (bits) { if (bits & 1) rad += f; bits >>>= 1; f /= 2; } // 반전 비트 (판 데르 코르풋)
    const u = (i + 0.5) / n, v = rad;
    const r = Math.sqrt(u), phi = 2 * Math.PI * v;
    out.push([r * Math.cos(phi), r * Math.sin(phi), Math.sqrt(Math.max(0, 1 - u))]);
  }
  return out;
}

/** 쌓인 빛(RGBA float, 0~) → AO 회색 RGBA(8bit). ref = 가려지지 않은 곳의 빛(그 값 = 흰색 255) */
export function aoToGray(f: Float32Array, ref: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(f.length);
  for (let i = 0; i < f.length; i += 4) {
    const v = ref > 0 ? Math.min(1, (f[i] + f[i + 1] + f[i + 2]) / 3 / ref) : 1;
    out[i] = out[i + 1] = out[i + 2] = Math.round(v * 255);
    out[i + 3] = 255;
  }
  return out;
}

/** AO 저장 키 — 사인물 3D 사양(모양·치수·두께·구성)만, 사진 위 자리(x·y)는 빼고 */
export function aoKey(spec: object): string {
  const { x: _x, y: _y, ...rest } = spec as Record<string, unknown>;
  return fnv1a(JSON.stringify(rest));
}
