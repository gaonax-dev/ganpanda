// 사인물 AO(앰비언트 오클루전) 굽기의 순수 계산 — 하늘 방향·빛 → 회색·키 (2026-11-09 "디자인 파일이 들어오면 occ를 구워서 계속 사용 가능하지 않을까?" → ProgressiveLightMap).
// 굽기 자체(WebGL)는 render/aoBake.ts → docs/features/render-3d.md

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

/**
 * AO 저장 키 — 그림자를 드리우는 도형(채널·프레임 등)의 꼭짓점 자리(1mm 단위, 물체 행렬 적용)만 (2026-11-10 사용자: "디자인과 구성(체널과 프레임의 위치만 재질은 상관없음)이 변하지 않으면 계속 사용하게").
 * 색·재질·조명을 바꿔도 같은 키 — 디자인(패스)이나 구성(글자·프레임 자리·두께)이 바뀌면 다른 키. extra = 받는 면 등 덧붙일 것.
 * m = 4×4 열 우선(three Matrix4.elements)
 */
export function aoGeomKey(meshes: { pos: ArrayLike<number>; m: ArrayLike<number> }[], extra: string): string {
  let h = 0x811c9dc5;
  const mix = (n: number) => { h ^= n | 0; h = Math.imul(h, 0x01000193); };
  for (const { pos, m } of meshes) {
    mix(pos.length);
    for (let i = 0; i + 2 < pos.length; i += 3) {
      const x = pos[i], y = pos[i + 1], z = pos[i + 2];
      mix(Math.round(m[0] * x + m[4] * y + m[8] * z + m[12]));
      mix(Math.round(m[1] * x + m[5] * y + m[9] * z + m[13]));
      mix(Math.round(m[2] * x + m[6] * y + m[10] * z + m[14]));
    }
  }
  for (let i = 0; i < extra.length; i++) mix(extra.charCodeAt(i));
  return (h >>> 0).toString(16).padStart(8, '0');
}

/**
 * AO 를 굽는 기기인가 — 데스크톱 앱(Tauri, User-Agent 의 Ganpanda-App/)만 (2026-11-10 사용자: "모바일에서는 굽지않고(기기확인) 데스크탑 앱에서만 굽게").
 * 모바일(아이폰·안드로이드, 맥처럼 보이는 아이패드 = 터치)과 브라우저는 굽지 않고 프로젝트에 올라온 것만 쓴다
 */
export function canBakeAOOn(ua: string, maxTouchPoints: number): boolean {
  if (!/Ganpanda-App\//.test(ua)) return false;
  if (/iPhone|iPad|iPod|Android|Mobile/i.test(ua)) return false;
  return maxTouchPoints <= 1;
}
