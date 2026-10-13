// 분리 마스크(0/1 픽셀) → 다각형 (사진 px, 픽셀 모서리 좌표). SAM 결과를 사인물 윤곽으로 바꿀 때 쓴다.
import type { Pt } from './homography';

export interface Mask { data: Uint8Array | Uint8ClampedArray | Float32Array; width: number; height: number }

/** 가장 큰 연결 조각의 바깥 윤곽 → 다각형. tolerance = 단순화 허용 오차(px) */
export function maskToPolygon(m: Mask, tolerance = 1): Pt[] {
  const comp = largestComponent(m);
  if (!comp) return [];
  const ring = traceOutline(comp, m.width, m.height);
  return simplifyPolygon(dropCollinear(ring), tolerance);
}

export function boundsOf(poly: Pt[]): { x: number; y: number; w: number; h: number } {
  const xs = poly.map((p) => p[0]), ys = poly.map((p) => p[1]);
  const x = Math.min(...xs), y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

/** 가장 큰 4-연결 조각의 픽셀 집합 (비트맵) */
function largestComponent(m: Mask): Uint8Array | null {
  const { width: w, height: h, data } = m;
  const label = new Int32Array(w * h).fill(-1);
  const sizes: number[] = [];
  const stack: number[] = [];
  for (let i = 0; i < w * h; i++) {
    if (!data[i] || label[i] >= 0) continue;
    const id = sizes.length;
    sizes.push(0);
    stack.push(i);
    label[i] = id;
    while (stack.length) {
      const c = stack.pop()!;
      sizes[id]++;
      const x = c % w, y = (c - x) / w;
      for (const n of [x > 0 ? c - 1 : -1, x < w - 1 ? c + 1 : -1, y > 0 ? c - w : -1, y < h - 1 ? c + w : -1]) {
        if (n >= 0 && data[n] && label[n] < 0) { label[n] = id; stack.push(n); }
      }
    }
  }
  if (!sizes.length) return null;
  const best = sizes.indexOf(Math.max(...sizes));
  const out = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) if (label[i] === best) out[i] = 1;
  return out;
}

/**
 * 조각의 바깥 경계를 픽셀 모서리 좌표로 따라간다 (시계 방향, y 아래).
 * 안쪽 픽셀과 바깥 픽셀 사이의 격자 변을 모아 꼭짓점 → 다음 변으로 이어 붙인다.
 */
function traceOutline(inside: Uint8Array, w: number, h: number): Pt[] {
  const at = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && inside[y * w + x] === 1;
  // 변: 시작 꼭짓점 키 → [끝 꼭짓점]
  const edges = new Map<number, number[]>();
  const key = (x: number, y: number) => y * (w + 1) + x;
  const add = (x0: number, y0: number, x1: number, y1: number) => {
    const k = key(x0, y0);
    (edges.get(k) ?? edges.set(k, []).get(k)!).push(key(x1, y1));
  };
  let start = Infinity;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!at(x, y)) continue;
    if (!at(x, y - 1)) { add(x, y, x + 1, y); start = Math.min(start, key(x, y)); }
    if (!at(x + 1, y)) add(x + 1, y, x + 1, y + 1);
    if (!at(x, y + 1)) add(x + 1, y + 1, x, y + 1);
    if (!at(x - 1, y)) add(x, y + 1, x, y);
  }
  const toPt = (k: number): Pt => [k % (w + 1), Math.floor(k / (w + 1))];
  const ring: Pt[] = [];
  let cur = start, prev = -1;
  const guard = edges.size + 2;
  for (let i = 0; i < guard; i++) {
    ring.push(toPt(cur));
    const outs = edges.get(cur);
    if (!outs?.length) break;
    let next = outs[0];
    if (outs.length > 1 && prev >= 0) {
      // 대각선으로 맞닿은 지점: 들어온 방향 기준 오른쪽(바깥쪽)으로 돈다
      const [px, py] = toPt(prev), [cx, cy] = toPt(cur);
      const dx = cx - px, dy = cy - py;
      const right = key(cx + -dy, cy + dx);
      next = outs.includes(right) ? right : outs[0];
    }
    outs.splice(outs.indexOf(next), 1);
    prev = cur; cur = next;
    if (cur === start) break;
  }
  return ring;
}

/** 일직선 위의 중간 점 제거 */
function dropCollinear(ring: Pt[]): Pt[] {
  const n = ring.length;
  if (n < 4) return ring;
  return ring.filter((p, i) => {
    const a = ring[(i + n - 1) % n], b = ring[(i + 1) % n];
    return (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]) !== 0;
  });
}

/** 닫힌 다각형 Douglas–Peucker 단순화 */
export function simplifyPolygon(pts: Pt[], tolerance: number): Pt[] {
  if (pts.length < 4 || tolerance <= 0) return pts;
  // 첫 점에서 가장 먼 점을 두 번째 고정점으로 삼아 두 구간으로 나눈다
  let k = 1, best = -1;
  for (let i = 1; i < pts.length; i++) {
    const d = (pts[i][0] - pts[0][0]) ** 2 + (pts[i][1] - pts[0][1]) ** 2;
    if (d > best) { best = d; k = i; }
  }
  const a = dp(pts.slice(0, k + 1), tolerance);
  const b = dp([...pts.slice(k), pts[0]], tolerance);
  return [...a.slice(0, -1), ...b.slice(0, -1)];
}

function dp(pts: Pt[], tol: number): Pt[] {
  if (pts.length <= 2) return pts;
  const [ax, ay] = pts[0], [bx, by] = pts[pts.length - 1];
  const len = Math.hypot(bx - ax, by - ay);
  let maxD = -1, idx = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const [x, y] = pts[i];
    const d = len === 0 ? Math.hypot(x - ax, y - ay) : Math.abs((bx - ax) * (ay - y) - (ax - x) * (by - ay)) / len;
    if (d > maxD) { maxD = d; idx = i; }
  }
  if (maxD <= tol) return [pts[0], pts[pts.length - 1]];
  return [...dp(pts.slice(0, idx + 1), tol).slice(0, -1), ...dp(pts.slice(idx), tol)];
}

/** 후보 마스크 중 선택: 점수 우선, 단 사진의 90% 이상을 덮거나 비어 있는 것은 간판이 아니므로 제외 (모두 제외되면 점수순) */
export function pickMask(cands: { cover: number; score: number }[]): number {
  let best = -1, bestAny = -1;
  cands.forEach((c, i) => {
    if (bestAny < 0 || c.score > cands[bestAny].score) bestAny = i;
    if (c.cover > 0 && c.cover < 0.9 && (best < 0 || c.score > cands[best].score)) best = i;
  });
  return best >= 0 ? best : bestAny;
}
