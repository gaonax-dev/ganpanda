// 사진별 카메라 설정 (사용자 결정 2026-10-14, 사인물과 분리): 축 선 두 쌍(가로 X·세로 Y, 선택 깊이 Z) + 원점 + 기준 길이
// → 소실점 → 초점거리(직교) → 회전 → 위치(기준 길이) → 벽면 평면. 교과서 기하(Caprile & Torre, Hartley & Zisserman)를
// 수식에서 직접 구현했고 외부 코드는 쓰지 않았다. 벽 좌표: X 오른쪽, Y 위, Z 벽 밖(카메라 쪽), 단위 mm.
import type { Calibration, Gray } from './calibration';
import { snapEdge } from './calibration';
import { proposeAxes } from './lines';
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
  /** fSpy 식 축 지정: 첫 쌍(노랑)·둘째 쌍(파랑)이 월드 축 X/Y/Z 의 어느 방향인가(서로 다른 축). 없으면 자동(첫 쌍 = 사진 오른쪽이 +X, 둘째 쌍 = 사진 위가 +Y).
   *  두 쌍이 이루는 평면이 벽면이 된다 (예: Z + Y = 옆면 벽) */
  axes?: { first: AxisDir; second: AxisDir };
}
export type AxisDir = '+x' | '-x' | '+y' | '-y' | '+z' | '-z';
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
  /** 카메라 위치 (벽면 좌표 mm: u 오른쪽, v 위, n 벽에서 카메라 쪽) */
  cameraPos: V3;
  /** 월드 축(X,Y,Z)의 카메라 좌표 방향 — 열 벡터 3×3 (3D 축 표시용) */
  worldR: number[];
  /** 실제로 쓴 축 지정 (자동이면 +x/+y) */
  axesUsed: { first: AxisDir; second: AxisDir };
  /** 벽면의 u(가로), v(세로)가 어느 월드 축의 어느 방향인가 */
  wallAxes: [AxisDir, AxisDir];
  /** 월드 좌표용 포즈 (R = worldR) — 3D 축 표시·검증 */
  worldPose: CameraPose;
  /** 화각 (도) 가로·세로 */
  fov: { h: number; v: number };
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
  // 선 쌍의 방향(부호 없음) → 정준 부호: 가로에 가까우면 사진 오른쪽, 세로에 가까우면 사진 위(−y)
  const canon = (d: V3): V3 => (Math.abs(d[0]) >= Math.abs(d[1]) ? (d[0] < 0 ? scale(d, -1) : d) : (d[1] > 0 ? scale(d, -1) : d));
  const d1 = canon(unit(Kinv(vx))), d2 = canon(unit(Kinv(vy)));
  // 축 지정: 첫 쌍 → u, 둘째 쌍 → v (벽면 = u,v 평면, n = u×v 는 카메라 쪽). 월드 축 라벨은 지정대로
  let axesUsed: { first: AxisDir; second: AxisDir } = setup.axes ?? { first: '+x', second: '+y' };
  if (axesUsed.first[1] === axesUsed.second[1]) { warnings.push('두 선 쌍이 같은 축으로 지정되었습니다. 서로 다른 축(X·Y·Z)이어야 합니다. 기본(X, Y)으로 풉니다.'); axesUsed = { first: '+x', second: '+y' }; }
  // 월드 축 = 정준 방향(X 오른쪽, Y 위, Z 는 깊이 선의 정준 방향). 부호(−)는 "벽의 축이 월드 축의 반대로 간다"는 뜻
  const sgn = (a: AxisDir) => (a[0] === '-' ? -1 : 1);
  const A = axesUsed.first[1] as 'x' | 'y' | 'z', B = axesUsed.second[1] as 'x' | 'y' | 'z';
  const C = (['x', 'y', 'z'] as const).find((k) => k !== A && k !== B)!;
  const d2o = unit(sub(d2, scale(d1, dot(d1, d2)))); // 직교화
  const cyclic = (A === 'x' && B === 'y') || (A === 'y' && B === 'z') || (A === 'z' && B === 'x');
  const cols: Record<'x' | 'y' | 'z', V3> = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };
  cols[A] = d1; cols[B] = d2o; cols[C] = cyclic ? cross(d1, d2o) : cross(d2o, d1);
  const worldR = [cols.x[0], cols.y[0], cols.z[0], cols.x[1], cols.y[1], cols.z[1], cols.x[2], cols.y[2], cols.z[2]];
  // 벽면 u,v: 첫 쌍·둘째 쌍의 (부호 적용) 방향. 세로(Y)가 첫 쌍이면 가로가 u 가 되게 순서를 바꾼다 (치수 = 가로×세로)
  let r1 = scale(d1, sgn(axesUsed.first)), r2 = scale(d2o, sgn(axesUsed.second));
  let wallAxes: [AxisDir, AxisDir] = [axesUsed.first, axesUsed.second];
  if (A === 'y' && B !== 'y') { [r1, r2] = [r2, r1]; wallAxes = [axesUsed.second, axesUsed.first]; }
  const r3 = cross(r1, r2);
  // 벽 밖(n = u×v)은 카메라 쪽(카메라 좌표 −z)이어야 한다. 아니면 거울상 — 리버스 안내
  if (r3[2] > 0) warnings.push('벽의 바깥쪽(법선)이 벽 안쪽을 향합니다 (축이 거울상). 두 쌍 중 하나를 리버스하세요.');
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
  // 카메라 위치 C = −Rᵀt (벽 좌표), 화각
  const T = pose.t;
  const cameraPos: V3 = [-(R[0] * T[0] + R[3] * T[1] + R[6] * T[2]), -(R[1] * T[0] + R[4] * T[1] + R[7] * T[2]), -(R[2] * T[0] + R[5] * T[1] + R[8] * T[2])];
  const fov = { h: (2 * Math.atan(imgW / 2 / f) * 180) / Math.PI, v: (2 * Math.atan(imgH / 2 / f) * 180) / Math.PI };
  return { f, pp, pose, H, Hinv, vx, vy, vz, cameraPos, fov, worldR, axesUsed, wallAxes, worldPose: { ...pose, R: worldR }, warnings };
}

/** 기존 실측·벽면 코드가 쓰는 Calibration 형태: 사진 px → 벽 mm (축척 포함) */
export function calibrationOf(s: CameraSolution): Calibration {
  return { H: s.Hinv, sx: 1, sy: 1, metric: true, perRef: [], warnings: s.warnings };
}

// ---------- 자동 제안 (AI): 선분 검출 + RANSAC 소실점 (lines.ts) ----------

/**
 * 사진에서 가로·세로 축 선 후보: LSD 식 선분 검출 → 소실점 두 개(RANSAC) → 각 소실점을 받치는, 서로 떨어진 긴 선분 두 개.
 * 뚜렷한 직선이 모자라면 null
 */
export function proposeAxisLines(img: Gray): { x: [Line, Line]; y: [Line, Line] } | null {
  const p = proposeAxes(img);
  if (!p) return null;
  const L = (s: { a: Pt; b: Pt }): Line => ({ a: s.a, b: s.b });
  return { x: [L(p.x[0]), L(p.x[1])], y: [L(p.y[0]), L(p.y[1])] };
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
