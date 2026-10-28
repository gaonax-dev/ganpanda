// 줌아웃 LOD — 사진 한 장의 원근 글자·그림 층을 납작한 그림 한 장으로 (2026-10-29 사용자: "아이폰 앱과 크롬에서 둘다 2d에서 줌 아웃에 앱은 다시 열고 크롬은 죽었다").
// 사인물마다 3D 변환(matrix3d) 층이면 줌아웃 때 모든 층이 한꺼번에 화면에 들어와 층마다 메모리를 잡는다. 사진이 작게 보일 때는
// 구운 그림들을 캔버스에서 원근으로 그려(작은 삼각형으로 나눠 아핀 변환) 3D 변환 없는 그림 한 장으로 쓴다.
import { solveHomography, applyHomography, type Pt } from '../core/homography';

/** 납작한 그림의 긴 변 최대 (px) — 화면에서 사진이 이 해상도보다 크게 보이면 사인물별 원근 층으로 */
export const FLAT_MAX = 1024;
/** 휴대폰에서 크게 보일 때 납작한 그림의 긴 변 — 휴대폰은 사인물별 원근 층을 아예 쓰지 않는다 (2026-10-29 아이폰 줌인·줌아웃 반복 다운) */
export const FLAT_MAX_HI = 2048;
/** 납작한 그림의 긴 변: 작게 보이면 FLAT_MAX, 휴대폰에서 크게 보이면 FLAT_MAX_HI, 데스크톱에서 크게 보이면 null(사인물별 원근 층) */
export function flatMaxFor(phone: boolean, enough: boolean): number | null {
  return enough ? FLAT_MAX : phone ? FLAT_MAX_HI : null;
}
/** 원근을 근사하는 칸 수 (한 변) */
const GRID = 12;
const UNIT: Pt[] = [[0, 0], [1, 0], [1, 1], [0, 1]];

export interface FlatLayer {
  url: string;
  /** 구운 그림의 CSS 크기 (원근 변환 전) */
  w: number; h: number;
  /** 놓일 자리 — 사진 표시 좌표 (왼쪽 위, 오른쪽 위, 오른쪽 아래, 왼쪽 아래) */
  quad: Pt[];
  /** 외곽선으로 자르기 — 사진 표시 좌표 */
  clip?: Pt[];
}

/** 이 사진을 화면에서 그릴 때 납작한 그림으로 충분한가 (화면 px × 기기 배율 ≤ FLAT_MAX) */
export function flatEnough(screenW: number, screenH: number, dpr: number): boolean {
  return Math.max(screenW, screenH) * dpr <= FLAT_MAX;
}

/** 세 점 → 세 점 아핀 변환 [a, b, c, d, e, f] (canvas setTransform 순서) */
export function affine(s: [Pt, Pt, Pt], d: [Pt, Pt, Pt]): [number, number, number, number, number, number] | null {
  const [s0, s1, s2] = s, [d0, d1, d2] = d;
  const den = (s1[0] - s0[0]) * (s2[1] - s0[1]) - (s2[0] - s0[0]) * (s1[1] - s0[1]);
  if (!den) return null;
  const a = ((d1[0] - d0[0]) * (s2[1] - s0[1]) - (d2[0] - d0[0]) * (s1[1] - s0[1])) / den;
  const c = ((d2[0] - d0[0]) * (s1[0] - s0[0]) - (d1[0] - d0[0]) * (s2[0] - s0[0])) / den;
  const b = ((d1[1] - d0[1]) * (s2[1] - s0[1]) - (d2[1] - d0[1]) * (s1[1] - s0[1])) / den;
  const dd = ((d2[1] - d0[1]) * (s1[0] - s0[0]) - (d1[1] - d0[1]) * (s2[0] - s0[0])) / den;
  return [a, b, c, dd, d0[0] - a * s0[0] - c * s0[1], d0[1] - b * s0[0] - dd * s0[1]];
}

/** 그림(w×h)을 사각형 quad 에 원근으로 그린다 — 칸마다 삼각형 두 개, 이음새가 안 보이게 살짝 넓혀 자른다 */
export function drawQuad(g: CanvasRenderingContext2D, img: CanvasImageSource, iw: number, ih: number, quad: Pt[], grid = GRID) {
  const H = solveHomography(UNIT, quad);
  const at = (u: number, v: number) => applyHomography(H, [u, v]);
  for (let j = 0; j < grid; j++) for (let i = 0; i < grid; i++) {
    const u0 = i / grid, u1 = (i + 1) / grid, v0 = j / grid, v1 = (j + 1) / grid;
    const S: Pt[] = [[u0 * iw, v0 * ih], [u1 * iw, v0 * ih], [u1 * iw, v1 * ih], [u0 * iw, v1 * ih]];
    const D: Pt[] = [at(u0, v0), at(u1, v0), at(u1, v1), at(u0, v1)];
    for (const [p, q, r] of [[0, 1, 2], [0, 2, 3]] as const) {
      const m = affine([S[p], S[q], S[r]], [D[p], D[q], D[r]]);
      if (!m) continue;
      const cx = (D[p][0] + D[q][0] + D[r][0]) / 3, cy = (D[p][1] + D[q][1] + D[r][1]) / 3;
      const grow = (pt: Pt): Pt => { const dx = pt[0] - cx, dy = pt[1] - cy, l = Math.hypot(dx, dy) || 1; return [pt[0] + (dx / l) * 0.6, pt[1] + (dy / l) * 0.6]; };
      g.save();
      g.beginPath();
      const t = [grow(D[p]), grow(D[q]), grow(D[r])];
      g.moveTo(t[0][0], t[0][1]); g.lineTo(t[1][0], t[1][1]); g.lineTo(t[2][0], t[2][1]); g.closePath();
      g.clip();
      g.transform(m[0], m[1], m[2], m[3], m[4], m[5]);
      g.drawImage(img, 0, 0, iw, ih);
      g.restore();
    }
  }
}

const cache = new Map<string, Promise<string | undefined>>();
const CACHE_MAX = 120;

function load(url: string): Promise<HTMLImageElement | null> {
  return new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ok(null); i.src = url; });
}

/** 층들을 W×H(사진 표시 좌표) 그림 한 장으로 — 긴 변 ≤ FLAT_MAX PNG. 같은 key 는 다시 그리지 않는다 */
export function flattenOverlay(key: string, layers: FlatLayer[], W: number, H: number, max = FLAT_MAX): Promise<string | undefined> {
  let p = cache.get(key);
  if (p) { cache.delete(key); cache.set(key, p); return p; }
  p = (async () => {
    const k = Math.min(2, max / Math.max(W, H, 1)); // 긴 변 ≤ FLAT_MAX, 작은 사진은 2배까지
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(W * k)); c.height = Math.max(1, Math.round(H * k));
    const g = c.getContext('2d');
    if (!g) return undefined;
    g.globalAlpha = 0.95; // .warp 와 같은 불투명도
    for (const l of layers) {
      const img = await load(l.url);
      if (!img) continue;
      g.save();
      g.scale(c.width / W, c.height / H);
      if (l.clip?.length) { g.beginPath(); l.clip.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.clip(); }
      drawQuad(g, img, l.w, l.h, l.quad);
      g.restore();
    }
    const blob = await new Promise<Blob | null>((ok) => c.toBlob(ok, 'image/png'));
    c.width = c.height = 0;
    return blob ? URL.createObjectURL(blob) : undefined;
  })().catch(() => undefined);
  cache.set(key, p);
  p.then((u) => { if (!u) cache.delete(key); });
  while (cache.size > CACHE_MAX) {
    const [old, op] = cache.entries().next().value!;
    cache.delete(old);
    op.then((u) => u && URL.revokeObjectURL(u));
  }
  return p;
}
