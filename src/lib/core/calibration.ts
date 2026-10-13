// 실측 기준선 (사용자 결정 2026-10-13): 실측한 사인물의 변을 기준선으로 삼아
// 가로선 → 가로 축척, 세로선 → 세로 축척을 따로 정하고, 소실점으로 벽면을 정면 보정한다.
import type { Pt } from './homography';
import type { SignObject } from './model';

export interface RefLine { objectId: string; edge: 'top' | 'bottom' | 'left' | 'right'; kind: 'h' | 'v'; a: Pt; b: Pt; mm: number }
export interface Calibration {
  /** 사진 px → 정면 보정 좌표 (축척 전) */
  H: number[];
  sx: number; sy: number;
  /** 기준선별 축척 편차 (평균 대비, +0.1 = 10% 큼) */
  perRef: { objectId: string; edge: RefLine['edge']; kind: RefLine['kind']; deviation: number }[];
  warnings: string[];
}
export const REF_TOLERANCE = 0.1;

type V3 = [number, number, number];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const lineOf = (p: Pt, q: Pt): V3 => cross([p[0], p[1], 1], [q[0], q[1], 1]);
const norm3 = (v: V3): V3 => { const n = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / n, v[1] / n, v[2] / n]; };

/** 사인물 → 기준선: 가로 기준은 위·아래 변(가로 mm), 세로 기준은 좌·우 변(세로 mm) */
export function refsFromObjects(objs: SignObject[]): RefLine[] {
  const out: RefLine[] = [];
  for (const o of objs) {
    const [tl, tr, br, bl] = o.quad;
    if (o.refH && o.widthMm) {
      out.push({ objectId: o.id, edge: 'top', kind: 'h', a: tl, b: tr, mm: o.widthMm });
      out.push({ objectId: o.id, edge: 'bottom', kind: 'h', a: bl, b: br, mm: o.widthMm });
    }
    if (o.refV && o.heightMm) {
      out.push({ objectId: o.id, edge: 'left', kind: 'v', a: tl, b: bl, mm: o.heightMm });
      out.push({ objectId: o.id, edge: 'right', kind: 'v', a: tr, b: br, mm: o.heightMm });
    }
  }
  return out;
}

/** 3×3 대칭 행렬의 최소 고유벡터 (야코비 회전) */
function smallestEigenvector(M: number[]): V3 {
  const a = M.slice();
  let V = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  for (let iter = 0; iter < 50; iter++) {
    let p = 0, q = 1, max = Math.abs(a[1]);
    if (Math.abs(a[2]) > max) { p = 0; q = 2; max = Math.abs(a[2]); }
    if (Math.abs(a[5]) > max) { p = 1; q = 2; max = Math.abs(a[5]); }
    if (max < 1e-12) break;
    const app = a[p * 3 + p], aqq = a[q * 3 + q], apq = a[p * 3 + q];
    const th = 0.5 * Math.atan2(2 * apq, aqq - app);
    const c = Math.cos(th), s = Math.sin(th);
    const R = [1, 0, 0, 0, 1, 0, 0, 0, 1];
    R[p * 3 + p] = c; R[p * 3 + q] = s; R[q * 3 + p] = -s; R[q * 3 + q] = c;
    const mul = (x: number[], y: number[]) => { const r = new Array(9).fill(0); for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) for (let k = 0; k < 3; k++) r[i * 3 + j] += x[i * 3 + k] * y[k * 3 + j]; return r; };
    const Rt = [R[0], R[3], R[6], R[1], R[4], R[7], R[2], R[5], R[8]];
    const next = mul(mul(Rt, a), R);
    for (let i = 0; i < 9; i++) a[i] = next[i];
    V = mul(V, R);
  }
  const ev = [a[0], a[4], a[8]];
  const k = ev.indexOf(Math.min(...ev));
  return norm3([V[k], V[3 + k], V[6 + k]]);
}

/** 선들의 소실점 (동차). 평행하면 무한원점(방향)이 나온다 */
function vanishing(lines: V3[]): V3 {
  const M = new Array(9).fill(0);
  for (const l of lines) { const n = norm3(l); for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) M[i * 3 + j] += n[i] * n[j]; }
  return smallestEigenvector(M);
}

function invert3(m: number[]): number[] | null {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
  const det = a * A + b * B + c * C;
  if (Math.abs(det) < 1e-12) return null;
  return [A, -(b * i - c * h), b * f - c * e, B, a * i - c * g, -(a * f - c * d), C, -(a * h - b * g), a * e - b * d].map((v) => v / det);
}
const applyH = (H: number[], [x, y]: Pt): Pt => {
  const w = H[6] * x + H[7] * y + H[8];
  return [(H[0] * x + H[1] * y + H[2]) / w, (H[3] * x + H[4] * y + H[5]) / w];
};
const len = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);

export function calibrate(refs: RefLine[]): Calibration | null {
  const hs = refs.filter((r) => r.kind === 'h'), vs = refs.filter((r) => r.kind === 'v');
  if (!hs.length && !vs.length) return null;
  const warnings: string[] = [];
  // 소실점: 가로선·세로선 각각. 한 축이 없으면 사진 축 방향(무한원점)으로 가정
  const vx = hs.length ? vanishing(hs.map((r) => lineOf(r.a, r.b))) : ([1, 0, 0] as V3);
  const vy = vs.length ? vanishing(vs.map((r) => lineOf(r.a, r.b))) : ([0, 1, 0] as V3);
  // 기준 원점: 기준선 끝점들의 평균 (유한점)
  const pts = refs.flatMap((r) => [r.a, r.b]);
  const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length, cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  // 정면 보정: 소실점 vx→x축 무한원점, vy→y축 무한원점, 원점 c→원점.  H⁻¹ = [vx vy c]
  const Hinv = [vx[0], vy[0], cx, vx[1], vy[1], cy, vx[2], vy[2], 1];
  const H = invert3(Hinv);
  if (!H) return null;
  const scaleOf = (r: RefLine) => r.mm / Math.max(1e-9, len(applyH(H, r.a), applyH(H, r.b)));
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const sx = hs.length ? mean(hs.map(scaleOf)) : NaN;
  const sy = vs.length ? mean(vs.map(scaleOf)) : NaN;
  if (!hs.length) warnings.push('가로 기준이 없어 세로 축척을 가로에도 씁니다.');
  if (!vs.length) warnings.push('세로 기준이 없어 가로 축척을 세로에도 씁니다.');
  const SX = isNaN(sx) ? sy : sx, SY = isNaN(sy) ? sx : sy;
  const perRef = refs.map((r) => ({ objectId: r.objectId, edge: r.edge, kind: r.kind, deviation: scaleOf(r) / (r.kind === 'h' ? SX : SY) - 1 }));
  for (const r of perRef) if (Math.abs(r.deviation) > REF_TOLERANCE) warnings.push(`${r.objectId} 의 ${r.kind === 'h' ? '가로' : '세로'} 기준이 다른 기준과 ${Math.round(Math.abs(r.deviation) * 100)}% 어긋납니다.`);
  return { H, sx: SX, sy: SY, perRef, warnings };
}

/** 사각 영역의 실제 크기: 위·아래 변 평균 × 가로 축척, 좌·우 변 평균 × 세로 축척 */
export function measureQuad(c: Calibration, quad: Pt[]): { widthMm: number; heightMm: number } {
  const [tl, tr, br, bl] = quad.map((p) => applyH(c.H, p));
  return { widthMm: ((len(tl, tr) + len(bl, br)) / 2) * c.sx, heightMm: ((len(tl, bl) + len(tr, br)) / 2) * c.sy };
}

// ---------- 모서리 보정 (AI 평가) ----------
export interface Gray { data: Uint8Array | Uint8ClampedArray; width: number; height: number }

/**
 * 기준선을 법선 방향으로 ±range px 옮겨 보며 밝기 변화가 가장 큰 위치에 붙인다.
 * confidence = (최대 변화 − 평균 변화) / 최대 변화 (0~1). 모서리가 없으면 낮다
 */
export function snapEdge(img: Gray, line: RefLine, range = 8): { a: Pt; b: Pt; offset: number; confidence: number } {
  const dx = line.b[0] - line.a[0], dy = line.b[1] - line.a[1];
  const L = Math.hypot(dx, dy) || 1;
  const nx = -dy / L, ny = dx / L; // 법선
  const samples = Math.max(8, Math.min(64, Math.round(L / 4)));
  const at = (x: number, y: number) => {
    const xi = Math.round(x), yi = Math.round(y);
    if (xi < 0 || yi < 0 || xi >= img.width || yi >= img.height) return 0;
    return img.data[yi * img.width + xi];
  };
  // 법선 방향 밝기 변화(그라디언트)를 선 전체에서 평균
  const grad = (d: number) => {
    let s = 0;
    for (let i = 0; i <= samples; i++) {
      const t = (i / samples) * 0.8 + 0.1; // 끝점 근처는 제외
      const x = line.a[0] + dx * t + nx * d, y = line.a[1] + dy * t + ny * d;
      s += Math.abs(at(x + nx, y + ny) - at(x - nx, y - ny));
    }
    return s / (samples + 1);
  };
  let best = 0, bestG = -1, sum = 0, n = 0;
  for (let d = -range; d <= range; d++) {
    const g = grad(d);
    sum += g; n++;
    if (g > bestG) { bestG = g; best = d; }
  }
  const mean = sum / n;
  const confidence = bestG > 0 ? Math.max(0, (bestG - mean) / bestG) : 0;
  if (confidence < 0.2) return { a: line.a, b: line.b, offset: 0, confidence };
  return { a: [line.a[0] + nx * best, line.a[1] + ny * best], b: [line.b[0] + nx * best, line.b[1] + ny * best], offset: best, confidence };
}
