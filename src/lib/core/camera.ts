// 사진별 카메라 설정 (사용자 결정 2026-10-14, 사인물과 분리): 축 선 두 쌍(가로 X·세로 Y, 선택 깊이 Z) + 원점 + 기준 길이
// → 소실점 → 초점거리(직교) → 회전 → 위치(기준 길이) → 벽면 평면. 교과서 기하(Caprile & Torre, Hartley & Zisserman)를
// 수식에서 직접 구현했고 외부 코드는 쓰지 않았다. 벽 좌표: X 오른쪽, Y 위, Z 벽 밖(카메라 쪽), 단위 mm.
import type { Calibration, Gray } from './calibration';
import { snapEdge } from './calibration';
import { DEFAULT_FOCAL_RATIO, type CameraPose, type Pt } from './homography';

export interface Line { a: Pt; b: Pt }
export type Axis = 'x' | 'y' | 'z';
export interface CameraSetup {
  x: [Line, Line];
  y: [Line, Line];
  /** 깊이 축(옆면 벽 방향). 있으면 제3 소실점으로 주점을 구할 수 있다 */
  z?: [Line, Line];
  /** 벽 위 (0,0) 이 되는 사진 점 */
  origin: Pt;
  /** 축척: 축을 따라 놓인 선 하나의 실제 길이 */
  ref?: { a: Pt; b: Pt; axis: 'x' | 'y'; mm: number };
  /** 주점: 사진 중앙(기본) / 제3 소실점의 수심 (z 축 필요) */
  principal?: 'center' | 'third';
}
export interface CameraSolution {
  f: number;
  /** 주점 (사진 px) */
  pp: Pt;
  pose: CameraPose;
  /** 벽면(z=0) mm → 사진 px, 그 역 */
  H: number[];
  Hinv: number[];
  /** 소실점 (동차) */
  vx: V3; vy: V3; vz?: V3;
  warnings: string[];
}

type V3 = [number, number, number];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a: V3) => Math.hypot(a[0], a[1], a[2]);
const unit = (a: V3): V3 => { const n = norm(a) || 1; return [a[0] / n, a[1] / n, a[2] / n]; };
const scale = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const lineH = (l: Line): V3 => cross([l.a[0], l.a[1], 1], [l.b[0], l.b[1], 1]);
/** 두 선의 교점(동차). 평행하면 w ≈ 0 (무한원점) */
const meet = (l1: Line, l2: Line): V3 => { const v = cross(lineH(l1), lineH(l2)); const n = norm(v) || 1; return [v[0] / n, v[1] / n, v[2] / n]; };
const dir = (l: Line): Pt => { const d: Pt = [l.b[0] - l.a[0], l.b[1] - l.a[1]]; const n = Math.hypot(d[0], d[1]) || 1; return [d[0] / n, d[1] / n]; };
/** 선 쌍이 거의 평행한가 (fSpy 와 같은 기준 0.99995 는 너무 엄격해 0.9999 사용) */
const nearlyParallel = (p: [Line, Line]) => { const a = dir(p[0]), b = dir(p[1]); return Math.abs(a[0] * b[0] + a[1] * b[1]) > 0.9999; };

function invert3(m: number[]): number[] | null {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
  const det = a * A + b * B + c * C;
  if (Math.abs(det) < 1e-12) return null;
  return [A, -(b * i - c * h), b * f - c * e, B, a * i - c * g, -(a * f - c * d), C, -(a * h - b * g), a * e - b * d].map((v) => v / det);
}

/** 세 점의 수심 (삼각형 높이들의 교점) */
function orthocenter(a: Pt, b: Pt, c: Pt): Pt | null {
  // 높이 1: a 를 지나고 bc 에 수직, 높이 2: b 를 지나고 ac 에 수직
  const d1: Pt = [c[0] - b[0], c[1] - b[1]], d2: Pt = [c[0] - a[0], c[1] - a[1]];
  // (p - a)·d1 = 0, (p - b)·d2 = 0
  const det = d1[0] * d2[1] - d1[1] * d2[0];
  if (Math.abs(det) < 1e-9) return null;
  const r1 = d1[0] * a[0] + d1[1] * a[1], r2 = d2[0] * b[0] + d2[1] * b[1];
  return [(r1 * d2[1] - d1[1] * r2) / det, (d1[0] * r2 - r1 * d2[0]) / det];
}

export function solveCamera(setup: CameraSetup, imgW: number, imgH: number): CameraSolution | null {
  const warnings: string[] = [];
  const vx = meet(setup.x[0], setup.x[1]), vy = meet(setup.y[0], setup.y[1]);
  const vz = setup.z ? meet(setup.z[0], setup.z[1]) : undefined;
  if (nearlyParallel(setup.x)) warnings.push('가로 축 선 두 개가 거의 평행합니다. 멀리 떨어진 두 선을 고르세요.');
  if (nearlyParallel(setup.y)) warnings.push('세로 축 선 두 개가 거의 평행합니다. 멀리 떨어진 두 선을 고르세요.');
  const finite = (v: V3) => Math.abs(v[2]) > 1e-7 * Math.hypot(v[0], v[1]);
  const toPt = (v: V3): Pt => [v[0] / v[2], v[1] / v[2]];

  // 주점
  let pp: Pt = [imgW / 2, imgH / 2];
  if (setup.principal === 'third') {
    if (vz && finite(vx) && finite(vy) && finite(vz)) {
      const oc = orthocenter(toPt(vx), toPt(vy), toPt(vz));
      if (oc) pp = oc; else warnings.push('세 소실점으로 주점을 구할 수 없어 사진 중앙을 씁니다.');
    } else warnings.push('깊이 축 선이 없거나 소실점이 무한원점이라 주점은 사진 중앙으로 둡니다.');
  }
  // 초점거리: 두 소실점 직교. (vx−pp)·(vy−pp) = −f²
  const long = Math.max(imgW, imgH);
  let f = DEFAULT_FOCAL_RATIO * long;
  if (finite(vx) && finite(vy)) {
    const a = toPt(vx), b = toPt(vy);
    const f2 = -((a[0] - pp[0]) * (b[0] - pp[0]) + (a[1] - pp[1]) * (b[1] - pp[1]));
    if (f2 > (0.25 * long) ** 2 && f2 < (5 * long) ** 2) f = Math.sqrt(f2);
    else warnings.push('소실점으로 구한 초점거리가 비정상이라 기본값(장변×0.75)을 씁니다. 축 선을 확인하세요.');
  } else warnings.push('정면에 가까운 사진이라 초점거리를 기본값(장변×0.75)으로 둡니다. 평면 위 치수에는 영향이 없습니다.');

  // 회전: 벽 축의 카메라 좌표 방향 r1 ∥ K⁻¹vx, r2 ∥ K⁻¹vy. 부호: X 는 사진 오른쪽, Y 는 사진 위(−y)
  const Kinv = (v: V3): V3 => [(v[0] - pp[0] * v[2]) / f, (v[1] - pp[1] * v[2]) / f, v[2]];
  let r1 = unit(Kinv(vx)), r2 = unit(Kinv(vy));
  if (r1[0] < 0) r1 = scale(r1, -1);
  if (r2[1] > 0) r2 = scale(r2, -1);
  r2 = unit(sub(r2, scale(r1, dot(r1, r2)))); // 직교화
  const r3 = cross(r1, r2);
  // 위치: 원점은 광선 K⁻¹o 위. 깊이 s 는 기준 길이로
  const o3 = Kinv([setup.origin[0], setup.origin[1], 1]);
  if (o3[2] <= 0) return null;
  const R = [r1[0], r2[0], r3[0], r1[1], r2[1], r3[1], r1[2], r2[2], r3[2]];
  const poseAt = (s: number): CameraPose => ({ f, R, t: scale(o3, s), imgW, imgH, pp });
  const Hof = (pose: CameraPose) => {
    // 벽 z=0: x_img = K [r1 r2 t] [X Y 1]
    const cols = [r1, r2, pose.t];
    const M = [0, 1, 2].map((row) => cols.map((c) => c[row])).flat(); // 3×3 [r1 r2 t]
    const K = [f, 0, pp[0], 0, f, pp[1], 0, 0, 1];
    const H = new Array(9).fill(0);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) for (let k = 0; k < 3; k++) H[i * 3 + j] += K[i * 3 + k] * M[k * 3 + j];
    return H;
  };
  let s = 1000;
  const H1 = Hof(poseAt(1)), H1inv = invert3(H1);
  if (!H1inv) return null;
  if (setup.ref && setup.ref.mm > 0) {
    const toWall = (p: Pt): Pt => { const w = H1inv[6] * p[0] + H1inv[7] * p[1] + H1inv[8]; return [(H1inv[0] * p[0] + H1inv[1] * p[1] + H1inv[2]) / w, (H1inv[3] * p[0] + H1inv[4] * p[1] + H1inv[5]) / w]; };
    const a = toWall(setup.ref.a), b = toWall(setup.ref.b);
    const L1 = setup.ref.axis === 'x' ? Math.abs(b[0] - a[0]) : Math.abs(b[1] - a[1]);
    if (L1 > 1e-9) s = setup.ref.mm / L1; else warnings.push('기준 길이 선이 너무 짧습니다.');
  } else warnings.push('기준 길이가 없어 축척(mm)을 정할 수 없습니다. 축 하나를 따라 실측한 선을 넣으세요.');
  const pose = poseAt(s);
  const H = Hof(pose);
  const Hinv = invert3(H);
  if (!Hinv) return null;
  return { f, pp, pose, H, Hinv, vx, vy, vz, warnings };
}

/** 기존 실측·벽면 코드가 쓰는 Calibration 형태: 사진 px → 벽 mm (축척 포함) */
export function calibrationOf(s: CameraSolution): Calibration {
  return { H: s.Hinv, sx: 1, sy: 1, perRef: [], warnings: s.warnings };
}

// ---------- 자동 제안 (AI): 사진의 강한 직선에서 가로·세로 축 선 후보 ----------

interface Cand { theta: number; rho: number; votes: number }

/**
 * 거친 허프 변환으로 강한 직선을 찾고, 가로에 가까운 선 2개(위·아래로 떨어진)와 세로에 가까운 선 2개(좌·우로 떨어진)를 고른다.
 * 끝점은 그 선을 받치는 에지 픽셀의 범위. 선이 모자라면 null
 */
export function proposeAxisLines(img: Gray, opts: { minSep?: number } = {}): { x: [Line, Line]; y: [Line, Line] } | null {
  const { width: w, height: h, data } = img;
  const step = Math.max(1, Math.round(Math.max(w, h) / 600)); // 큰 사진은 건너뛰며 본다
  // 그라디언트가 큰 픽셀
  const edges: { x: number; y: number; ang: number; m: number }[] = [];
  let sum = 0, n = 0;
  for (let y = step; y < h - step; y += step) for (let x = step; x < w - step; x += step) {
    const gx = data[y * w + x + step] - data[y * w + x - step], gy = data[(y + step) * w + x] - data[(y - step) * w + x];
    const m = Math.hypot(gx, gy);
    sum += m; n++;
    if (m > 0) edges.push({ x, y, ang: Math.atan2(gy, gx), m });
  }
  const mean = sum / Math.max(1, n);
  const thr = Math.max(20, mean * 3);
  const strong = edges.filter((e) => e.m > thr);
  if (strong.length < 20) return null;
  // 허프: theta = 선의 법선 방향 (에지 그라디언트 방향과 같다), 1° 간격
  const T = 180, diag = Math.hypot(w, h), R = Math.ceil(diag);
  const acc = new Float32Array(T * (2 * R + 1));
  const idx = (t: number, r: number) => t * (2 * R + 1) + (r + R);
  for (const e of strong) {
    let tdeg = Math.round((e.ang * 180) / Math.PI);
    if (tdeg < 0) tdeg += 180;
    if (tdeg >= 180) tdeg -= 180;
    const th = (tdeg * Math.PI) / 180;
    const rho = Math.round(e.x * Math.cos(th) + e.y * Math.sin(th));
    for (const dt of [-1, 0, 1]) { const tt = (tdeg + dt + T) % T; acc[idx(tt, Math.max(-R, Math.min(R, rho)))] += dt ? 0.5 : 1; }
  }
  // 지역 최대 후보
  const cands: Cand[] = [];
  for (let t = 0; t < T; t++) for (let r = -R; r <= R; r++) {
    const v = acc[idx(t, r)];
    if (v < 8) continue;
    let best = true;
    for (let dt = -3; dt <= 3 && best; dt++) for (let dr = -6; dr <= 6; dr++) {
      if (!dt && !dr) continue;
      const tt = (t + dt + T) % T, rr = r + dr;
      if (rr < -R || rr > R) continue;
      if (acc[idx(tt, rr)] > v) { best = false; break; }
    }
    if (best) cands.push({ theta: (t * Math.PI) / 180, rho: r, votes: v });
  }
  cands.sort((a, b) => b.votes - a.votes);
  // 법선 각 theta: 가로선은 법선이 세로(≈90°), 세로선은 법선이 가로(≈0°/180°)
  const angTo = (th: number, target: number) => { let d = Math.abs(th - target) % Math.PI; return Math.min(d, Math.PI - d); };
  const hor = cands.filter((c) => angTo(c.theta, Math.PI / 2) < (35 * Math.PI) / 180);
  const ver = cands.filter((c) => angTo(c.theta, 0) < (35 * Math.PI) / 180);
  // 멀리 떨어진 두 선일수록 소실점이 안정 — 먼저 30% 이상 떨어진 쌍을 찾고, 없으면 기준을 절반씩 낮춘다
  const pick = (list: Cand[], along: 'y' | 'x'): [Cand, Cand] | null => {
    const extent = along === 'y' ? h : w;
    const mid = (l: Line) => (along === 'y' ? (l.a[1] + l.b[1]) / 2 : (l.a[0] + l.b[0]) / 2);
    for (let minSep = opts.minSep ?? extent * 0.3; minSep >= extent * 0.05; minSep /= 2) {
      for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
        const a = toSeg(list[i]), b = toSeg(list[j]);
        if (!a || !b) continue;
        if (Math.abs(mid(a) - mid(b)) >= minSep) return [list[i], list[j]];
      }
    }
    return null;
  };
  /** 후보 직선 → 받치는 에지 픽셀의 범위로 선분 */
  function toSeg(c: Cand): Line | null {
    const cs = Math.cos(c.theta), sn = Math.sin(c.theta);
    const ts: number[] = [];
    for (const e of strong) {
      const d = e.x * cs + e.y * sn;
      if (Math.abs(d - c.rho) > 2 * step) continue;
      if (angTo(e.ang, c.theta) > (6 * Math.PI) / 180) continue;
      ts.push(-e.x * sn + e.y * cs); // 선 방향 좌표
    }
    if (ts.length < 8) return null;
    ts.sort((a, b) => a - b);
    const lo = ts[Math.floor(ts.length * 0.05)], hi = ts[Math.floor(ts.length * 0.95)];
    if (hi - lo < Math.min(w, h) * 0.1) return null;
    const base: Pt = [c.rho * cs, c.rho * sn];
    const at = (t: number): Pt => [base[0] - t * sn, base[1] + t * cs];
    return { a: at(lo), b: at(hi) };
  }
  const hp = pick(hor, "y"), vp = pick(ver, "x");
  if (!hp || !vp) return null;
  const x = [toSeg(hp[0])!, toSeg(hp[1])!].sort((a, b) => (a.a[1] + a.b[1]) - (b.a[1] + b.b[1])) as [Line, Line];
  const y = [toSeg(vp[0])!, toSeg(vp[1])!].sort((a, b) => (a.a[0] + a.b[0]) - (b.a[0] + b.b[0])) as [Line, Line];
  return { x, y };
}

/** 축 선·기준 길이 선의 끝점을 사진 모서리에 붙인다 (법선 방향 탐색) */
export function snapSetup(img: Gray, setup: CameraSetup, range = 8): CameraSetup {
  const snapLine = (l: Line): Line => { const r = snapEdge(img, l, range); return { a: r.a, b: r.b }; };
  return {
    ...setup,
    x: [snapLine(setup.x[0]), snapLine(setup.x[1])],
    y: [snapLine(setup.y[0]), snapLine(setup.y[1])],
    ...(setup.z ? { z: [snapLine(setup.z[0]), snapLine(setup.z[1])] as [Line, Line] } : {}),
  };
}
