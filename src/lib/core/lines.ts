// 직선 검출 + 소실점 (AI 축 선 제안용, 외부 라이브러리 없음)
// 1) LSD 식 선분 검출: 그라디언트 방향이 비슷한 픽셀을 영역으로 키워 주성분으로 선분을 만든다
// 2) RANSAC 으로 소실점 두 개(가로·세로)를 찾고, 각 소실점을 받치는 긴 선분 두 개를 축 선으로 고른다
import type { Gray } from './calibration';
import type { Pt } from './homography';

export interface Segment { a: Pt; b: Pt; length: number; /** 평균 그라디언트 크기 */ strength: number }
const dirOf = (s: Segment): Pt => { const d: Pt = [s.b[0] - s.a[0], s.b[1] - s.a[1]]; const n = Math.hypot(d[0], d[1]) || 1; return [d[0] / n, d[1] / n]; };

/** 긴 변이 maxSide 가 되도록 줄인 회색조 (좌표 변환 배율 반환) */
export function downscale(img: Gray, maxSide = 800): { img: Gray; k: number } {
  const k = Math.min(1, maxSide / Math.max(img.width, img.height));
  if (k === 1) return { img, k };
  const w = Math.max(1, Math.round(img.width * k)), h = Math.max(1, Math.round(img.height * k));
  const out = new Uint8ClampedArray(w * h);
  const sx = img.width / w, sy = img.height / h;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    // 상자 평균
    const x0 = Math.floor(x * sx), x1 = Math.max(x0 + 1, Math.floor((x + 1) * sx)), y0 = Math.floor(y * sy), y1 = Math.max(y0 + 1, Math.floor((y + 1) * sy));
    let s = 0, n = 0;
    for (let yy = y0; yy < y1 && yy < img.height; yy++) for (let xx = x0; xx < x1 && xx < img.width; xx++) { s += img.data[yy * img.width + xx]; n++; }
    out[y * w + x] = n ? s / n : 0;
  }
  return { img: { data: out, width: w, height: h }, k };
}

/**
 * 선분 검출 (LSD 의 핵심만): 소벨 그라디언트 → 강한 픽셀을 크기순으로 → 레벨라인 각이 ±tol 안인 이웃으로 영역 성장 →
 * 가중 주성분으로 선분(길이·폭). 폭/길이 비가 크면(덩어리) 버린다. 좌표는 입력 이미지 px.
 */
export function detectSegments(img: Gray, opts: { minLength?: number; tolDeg?: number } = {}): Segment[] {
  const { width: w, height: h } = img;
  const data = blur3(img);
  const tol = ((opts.tolDeg ?? 30) * Math.PI) / 180;
  const minLen = opts.minLength ?? Math.max(w, h) * 0.03;
  const mag = new Float32Array(w * h), ang = new Float32Array(w * h);
  const at = (x: number, y: number) => data[y * w + x];
  let sum = 0;
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const gx = (at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1)) - (at(x - 1, y - 1) + 2 * at(x - 1, y) + at(x - 1, y + 1));
    const gy = (at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1)) - (at(x - 1, y - 1) + 2 * at(x, y - 1) + at(x + 1, y - 1));
    const m = Math.hypot(gx, gy);
    mag[y * w + x] = m; ang[y * w + x] = Math.atan2(gy, gx); // 그라디언트 방향 (선분은 이에 수직)
    sum += m;
  }
  const mean = sum / (w * h);
  const thr = Math.max(40, mean * 2.5);
  const order: number[] = [];
  for (let i = 0; i < w * h; i++) if (mag[i] > thr) order.push(i);
  order.sort((a, b) => mag[b] - mag[a]);
  const used = new Uint8Array(w * h);
  const segs: Segment[] = [];
  const angDiff = (a: number, b: number) => { let d = Math.abs(a - b) % (Math.PI * 2); if (d > Math.PI) d = Math.PI * 2 - d; return d; };
  const stack: number[] = [];
  for (const seed of order) {
    if (used[seed]) continue;
    // 영역 성장
    let sx = Math.cos(ang[seed]), sy = Math.sin(ang[seed]);
    const region: number[] = [];
    stack.length = 0; stack.push(seed); used[seed] = 1;
    while (stack.length) {
      const i = stack.pop()!;
      region.push(i);
      const x = i % w, y = (i - x) / w;
      const ref = Math.atan2(sy, sx);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const xx = x + dx, yy = y + dy;
        if (xx < 1 || yy < 1 || xx >= w - 1 || yy >= h - 1) continue;
        const j = yy * w + xx;
        if (used[j] || mag[j] <= thr) continue;
        if (angDiff(ang[j], ref) > tol) continue;
        used[j] = 1; stack.push(j);
        sx += Math.cos(ang[j]); sy += Math.sin(ang[j]);
      }
    }
    if (region.length < 10) continue;
    // 가중 주성분
    let W = 0, cx = 0, cy = 0;
    for (const i of region) { const m = mag[i], x = i % w, y = (i - x) / w; W += m; cx += m * x; cy += m * y; }
    cx /= W; cy /= W;
    let sxx = 0, syy = 0, sxy = 0;
    for (const i of region) { const m = mag[i], x = i % w - cx, y = (i - (i % w)) / w - cy; sxx += m * x * x; syy += m * y * y; sxy += m * x * y; }
    sxx /= W; syy /= W; sxy /= W;
    const theta = 0.5 * Math.atan2(2 * sxy, sxx - syy); // 주축 방향
    const dx = Math.cos(theta), dy = Math.sin(theta);
    const l1 = (sxx + syy) / 2 + Math.hypot((sxx - syy) / 2, sxy), l2 = (sxx + syy) / 2 - Math.hypot((sxx - syy) / 2, sxy);
    let tmin = Infinity, tmax = -Infinity;
    for (const i of region) { const x = i % w - cx, y = (i - (i % w)) / w - cy; const t = x * dx + y * dy; if (t < tmin) tmin = t; if (t > tmax) tmax = t; }
    const length = tmax - tmin;
    const width = 2 * Math.sqrt(Math.max(0, l2)) * 2; // ≈ 영역 폭
    if (length < minLen || !isFinite(l1) || width / length > 0.15) continue;
    segs.push({ a: [cx + dx * tmin, cy + dy * tmin], b: [cx + dx * tmax, cy + dy * tmax], length, strength: W / region.length });
  }
  return mergeCollinear(segs).sort((p, q) => q.length - p.length);
}

/** 3×3 가우시안 — 계단 모양 에지(앨리어싱)의 방향을 고르게 */
function blur3(img: Gray): Float32Array {
  const { width: w, height: h, data } = img;
  const out = new Float32Array(w * h);
  const k = [1, 2, 1, 2, 4, 2, 1, 2, 1];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let s = 0, n = 0, i = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++, i++) {
      const xx = x + dx, yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
      s += data[yy * w + xx] * k[i]; n += k[i];
    }
    out[y * w + x] = s / n;
  }
  return out;
}

/** 같은 직선 위의 토막난 선분을 잇는다: 각 2° 안, 직선 거리 2px 안, 끝점 간격이 긴 쪽 길이의 50% 안 */
export function mergeCollinear(segs: Segment[], angDeg = 2, dist = 2.5): Segment[] {
  const list = [...segs].sort((p, q) => q.length - p.length);
  const out: Segment[] = [];
  const taken = new Uint8Array(list.length);
  const ang = (s: Segment) => Math.atan2(s.b[1] - s.a[1], s.b[0] - s.a[0]);
  const angDiff = (a: number, b: number) => { const d = Math.abs(a - b) % Math.PI; return Math.min(d, Math.PI - d); };
  for (let i = 0; i < list.length; i++) {
    if (taken[i]) continue;
    let cur = list[i]; taken[i] = 1;
    let grew = true;
    while (grew) {
      grew = false;
      const d = dirOf(cur), n: Pt = [-d[1], d[0]];
      const proj = (p: Pt) => (p[0] - cur.a[0]) * d[0] + (p[1] - cur.a[1]) * d[1];
      const off = (p: Pt) => Math.abs((p[0] - cur.a[0]) * n[0] + (p[1] - cur.a[1]) * n[1]);
      for (let j = 0; j < list.length; j++) {
        if (taken[j]) continue;
        const s = list[j];
        if (angDiff(ang(cur), ang(s)) > (angDeg * Math.PI) / 180) continue;
        if (off(s.a) > dist || off(s.b) > dist) continue;
        const ta = proj(s.a), tb = proj(s.b), lo = Math.min(ta, tb), hi = Math.max(ta, tb);
        const gap = Math.max(0, lo - cur.length, -hi);
        if (gap > cur.length * 0.5) continue;
        const start = Math.min(0, lo), end = Math.max(cur.length, hi);
        cur = { a: [cur.a[0] + d[0] * start, cur.a[1] + d[1] * start], b: [cur.a[0] + d[0] * end, cur.a[1] + d[1] * end], length: end - start, strength: (cur.strength * cur.length + s.strength * s.length) / (cur.length + s.length) };
        taken[j] = 1; grew = true;
      }
    }
    out.push(cur);
  }
  return out;
}

type V3 = [number, number, number];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const lineOf = (s: Segment): V3 => cross([s.a[0], s.a[1], 1], [s.b[0], s.b[1], 1]);
const mid = (s: Segment): Pt => [(s.a[0] + s.b[0]) / 2, (s.a[1] + s.b[1]) / 2];

/** 선분이 소실점 v(동차)를 향하는가: 중점→소실점 방향과 선분 방향의 각이 tol 안 */
export function pointsTo(s: Segment, v: V3, tol: number): boolean {
  const m = mid(s), d = dirOf(s);
  let vx: number, vy: number;
  if (Math.abs(v[2]) < 1e-9 * Math.hypot(v[0], v[1])) { vx = v[0]; vy = v[1]; } // 무한원점 = 방향
  else { vx = v[0] / v[2] - m[0]; vy = v[1] / v[2] - m[1]; }
  const n = Math.hypot(vx, vy) || 1;
  const c = Math.abs((vx * d[0] + vy * d[1]) / n);
  return c > Math.cos(tol);
}

export interface VanishingResult { v: V3; inliers: Segment[]; score: number }

/** RANSAC: 선분 쌍에서 소실점 후보 → 길이 가중 지지도가 최대인 것 */
export function findVanishingPoint(segs: Segment[], opts: { iterations?: number; tolDeg?: number; seed?: number } = {}): VanishingResult | null {
  if (segs.length < 2) return null;
  const tol = ((opts.tolDeg ?? 2) * Math.PI) / 180;
  let state = opts.seed ?? 12345;
  const rnd = () => { state = (state * 1103515245 + 12345) & 0x7fffffff; return state / 0x7fffffff; };
  const total = segs.reduce((a, s) => a + s.length, 0);
  const pickWeighted = () => { let r = rnd() * total; for (const s of segs) { r -= s.length; if (r <= 0) return s; } return segs[segs.length - 1]; };
  let best: VanishingResult | null = null;
  const iters = opts.iterations ?? 300;
  for (let i = 0; i < iters; i++) {
    const s1 = pickWeighted(), s2 = pickWeighted();
    if (s1 === s2) continue;
    const v = cross(lineOf(s1), lineOf(s2));
    const n = Math.hypot(v[0], v[1], v[2]) || 1;
    const vn: V3 = [v[0] / n, v[1] / n, v[2] / n];
    const inliers = segs.filter((s) => pointsTo(s, vn, tol));
    const score = inliers.reduce((a, s) => a + s.length, 0);
    if (!best || score > best.score) best = { v: vn, inliers, score };
  }
  return best;
}

/**
 * 가로·세로 축 선 제안: 선분 검출 → 소실점 1 → 남은 선분에서 소실점 2 → 선분 방향으로 가로/세로 결정 →
 * 각 축에서 서로 멀리 떨어진 긴 선분 두 개. 실패하면 null
 */
export function proposeAxes(img: Gray): { x: [Segment, Segment]; y: [Segment, Segment]; segments: Segment[] } | null {
  const { img: small, k } = downscale(img, 800);
  const segs = detectSegments(small);
  if (segs.length < 4) return null;
  const v1 = findVanishingPoint(segs);
  if (!v1 || v1.inliers.length < 2) return null;
  const rest = segs.filter((s) => !v1.inliers.includes(s));
  const v2 = findVanishingPoint(rest);
  if (!v2 || v2.inliers.length < 2) return null;
  const horizontality = (r: VanishingResult) => r.inliers.reduce((a, s) => a + Math.abs(dirOf(s)[0]) * s.length, 0) / r.score;
  const [hx, vy] = horizontality(v1) >= horizontality(v2) ? [v1, v2] : [v2, v1];
  const pick = (r: VanishingResult, along: 0 | 1, extent: number): [Segment, Segment] | null => {
    const list = [...r.inliers].sort((p, q) => q.length - p.length);
    for (let minSep = extent * 0.3; minSep >= extent * 0.05; minSep /= 2) {
      for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
        if (Math.abs(mid(list[i])[along] - mid(list[j])[along]) >= minSep) return [list[i], list[j]];
      }
    }
    return null;
  };
  const xs = pick(hx, 1, small.height), ys = pick(vy, 0, small.width);
  if (!xs || !ys) return null;
  const up = (s: Segment): Segment => ({ ...s, a: [s.a[0] / k, s.a[1] / k], b: [s.b[0] / k, s.b[1] / k], length: s.length / k });
  const sortBy = (pair: [Segment, Segment], i: 0 | 1): [Segment, Segment] => (mid(pair[0])[i] <= mid(pair[1])[i] ? pair : [pair[1], pair[0]]);
  return { x: sortBy([up(xs[0]), up(xs[1])], 1), y: sortBy([up(ys[0]), up(ys[1])], 0), segments: segs.map(up) };
}
