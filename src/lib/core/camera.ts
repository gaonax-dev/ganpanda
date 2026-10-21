// 사진별 카메라 설정 (사용자 결정 2026-10-14, 사인물과 분리): 축 선 두 쌍(가로 X·세로 Y, 선택 깊이 Z) + 원점 + 기준 길이
// → 소실점 → 초점거리(직교) → 회전 → 위치(기준 길이) → 벽면 평면. 교과서 기하(Caprile & Torre, Hartley & Zisserman)를
// 수식에서 직접 구현했고 외부 코드는 쓰지 않았다.
// 월드 축 이름은 가로·세로·높이 관례(2026-10-14 사용자): X = 가로(오른쪽), Y = 세로(깊이, 벽 안쪽이 +), Z = 높이(위) — Blender/fSpy 와 같은 Z-up.
// 내부 벽면 프레임(pose·H)은 u 가로, v 위, n 벽 밖(카메라 쪽), 단위 mm.
import type { Calibration, Gray } from './calibration';
import { measureQuad, snapEdge } from './calibration';
import { proposeAxes } from './lines';
import { applyHomography, DEFAULT_FOCAL_RATIO, type CameraPose, type Pt } from './homography';

export interface Line { a: Pt; b: Pt }
export type Axis = 'x' | 'y' | 'z';
export interface CameraSetup {
  x: [Line, Line];
  y: [Line, Line];
  /** 셋째 쌍(남은 축, 보통 세로 Y = 깊이). 있으면 제3 소실점으로 주점을 구할 수 있다. 키 이름은 호환을 위해 z */
  z?: [Line, Line];
  /** 벽 위 (0,0) 이 되는 사진 점 */
  origin: Pt;
  /**
   * 축척 = 기준 길이 (fSpy 와 같게, 2026-10-14 사용자): **원점을 지나는 축(X 가로 / Y 세로 / Z 높이) 하나**를 고르면
   * 그 축 선 위를 미끄러지는 **핸들 두 개**(from, to — 사진 px, 축 선 위로 붙여 씀)가 생기고, 둘 사이의 실제 거리(mm)를 넣는다.
   * 원점에서 시작할 필요가 없다 (문 왼쪽 틀 → 오른쪽 틀처럼 축 위 아무 구간). (옛 형식 {point} / {line} / {a,b,axis} 도 읽는다)
   */
  ref?: { axis: 'x' | 'y' | 'z'; from: Pt; to: Pt; mm: number } | { axis: 'x' | 'y' | 'z'; point: Pt; mm: number } | { line: RefLineKey; mm: number } | { a: Pt; b: Pt; axis: 'x' | 'y'; mm: number };
  /** 주점: 사진 중앙(기본) / 제3 소실점의 수심 (z 축 필요) */
  principal?: 'center' | 'third';
  /** fSpy 식 축 지정: 첫 쌍(노랑)·둘째 쌍(파랑)이 월드 축 X/Y/Z 의 어느 방향인가(서로 다른 축). 없으면 자동(첫 쌍 = 사진 오른쪽이 +X, 둘째 쌍 = 사진 위가 +Y).
   *  두 쌍이 이루는 평면이 벽면이 된다 (예: 세로 Y + 높이 Z = 옆면 벽). 없으면 자동(첫 쌍 = +X 가로, 둘째 쌍 = +Z 높이) */
  axes?: { first: AxisDir; second: AxisDir };
  /** 초점거리(px) 고정 — 크기를 아는 사각형(실측 사인물)의 가로세로 비율로 찾은 값 (2026-10-20). 있으면 소실점 직교 계산 대신 쓴다 */
  focal?: number;
  /** 자동으로 잡은 설정 (사진 등록 때 AI, 사인물 치수로 길이 반영 — 2026-10-19). 원근 창에서 사람이 적용하면 지워지고, 그때부터는 자동이 손대지 않는다 */
  auto?: boolean;
}
export type AxisDir = '+x' | '-x' | '+y' | '-y' | '+z' | '-z';
/** 월드 축 색 (fSpy 와 같이 X 빨강 · Y 초록 · Z 파랑). 축 선 쌍·원점 축·3D 뷰 모두 같은 색 */
export const AXIS_COLOR: Record<'x' | 'y' | 'z', string> = { x: '#ff4d4d', y: '#3ddc84', z: '#4da3ff' };
/** 기준 길이(축척) 색 — 축 색과 겹치지 않게 자홍 */
export const REF_COLOR = '#ff4dd2';
/** 선 쌍(첫·둘째·셋째)이 어느 월드 축인가 (지정 없으면 가로 X·높이 Z·남은 세로 Y) */
export function pairAxes(setup: Pick<CameraSetup, 'axes'>): ['x' | 'y' | 'z', 'x' | 'y' | 'z', 'x' | 'y' | 'z'] {
  let a = (setup.axes?.first[1] ?? 'x') as 'x' | 'y' | 'z', b = (setup.axes?.second[1] ?? 'z') as 'x' | 'y' | 'z';
  if (a === b) { a = 'x'; b = 'z'; }
  const c = (['x', 'y', 'z'] as const).find((k) => k !== a && k !== b)!;
  return [a, b, c];
}
export type RefLineKey = 'x0' | 'x1' | 'y0' | 'y1';

/** 기준 길이 표시용 선분: 축 형식이면 원점→(축 위로 붙인) 점, 선 형식이면 그 축 선 */
export function refLineOf(setup: CameraSetup, swapped = false, sol?: CameraSolution): { a: Pt; b: Pt; axis: 'x' | 'y' } | null {
  const r = setup.ref;
  if (!r) return null;
  if ('from' in r) {
    const a = sol ? snapToAxis(sol, r.axis, r.from) : r.from, b = sol ? snapToAxis(sol, r.axis, r.to) : r.to;
    return { a, b, axis: r.axis === 'z' ? 'y' : 'x' };
  }
  if ('point' in r) {
    const b = sol ? snapToAxis(sol, r.axis, r.point) : r.point;
    return { a: setup.origin, b, axis: r.axis === 'z' ? 'y' : 'x' };
  }
  if ('line' in r) {
    const pair = r.line[0] === 'x' ? setup.x : setup.y, l = pair[Number(r.line[1])];
    if (!l) return null;
    const firstIsU = !swapped;
    return { a: l.a, b: l.b, axis: (r.line[0] === 'x') === firstIsU ? 'x' : 'y' };
  }
  return { a: r.a, b: r.b, axis: r.axis };
}
/** 사진 점을 원점에서 뻗는 월드 축의 사진 위 직선으로 붙인다 (가장 가까운 점) */
export function snapToAxis(sol: CameraSolution, axis: 'x' | 'y' | 'z', p: Pt): Pt {
  const o = sol.originPx, d = sol.axisImageDir[axis];
  const n = Math.hypot(d[0], d[1]);
  if (n < 1e-9) return p;
  const t = ((p[0] - o[0]) * d[0] + (p[1] - o[1]) * d[1]) / (n * n);
  return [o[0] + d[0] * t, o[1] + d[1] * t];
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
  /** 원점의 사진 위치와, 원점에서 각 월드 축이 사진에서 뻗는 방향 (기준 길이 핸들을 축 위에 붙이는 데) */
  originPx: Pt;
  axisImageDir: Record<'x' | 'y' | 'z', Pt>;
  /** 화각 (도) 가로·세로 */
  fov: { h: number; v: number };
  /** 기준 길이로 축척(mm)을 정했나 — 없으면 단위 미정 (자동 원근 직후) */
  scaled: boolean;
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
  if (setup.focal && setup.focal > 0) f = setup.focal;
  else if (finite(vx) && finite(vy)) {
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
  let axesUsed: { first: AxisDir; second: AxisDir } = setup.axes ?? { first: '+x', second: '+z' };
  if (axesUsed.first[1] === axesUsed.second[1]) { warnings.push('두 선 쌍이 같은 축으로 지정되었습니다. 서로 다른 축(가로 X·세로 Y·높이 Z)이어야 합니다. 기본(가로, 높이)으로 풉니다.'); axesUsed = { first: '+x', second: '+z' }; }
  // 월드 축 = 정준 방향(X 오른쪽, Z 위, Y 는 깊이 선의 정준 방향; 남은 축은 오른손 규칙). 부호(−)는 "벽의 축이 월드 축의 반대로 간다"는 뜻
  const sgn = (a: AxisDir) => (a[0] === '-' ? -1 : 1);
  const A = axesUsed.first[1] as 'x' | 'y' | 'z', B = axesUsed.second[1] as 'x' | 'y' | 'z';
  const C = (['x', 'y', 'z'] as const).find((k) => k !== A && k !== B)!;
  const d2o = unit(sub(d2, scale(d1, dot(d1, d2)))); // 직교화
  const cyclic = (A === 'x' && B === 'y') || (A === 'y' && B === 'z') || (A === 'z' && B === 'x');
  const cols: Record<'x' | 'y' | 'z', V3> = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };
  cols[A] = d1; cols[B] = d2o; cols[C] = cyclic ? cross(d1, d2o) : cross(d2o, d1);
  const worldR = [cols.x[0], cols.y[0], cols.z[0], cols.x[1], cols.y[1], cols.z[1], cols.x[2], cols.y[2], cols.z[2]];
  // 벽면 u,v: 첫 쌍·둘째 쌍의 (부호 적용) 방향. 높이(Z)가 첫 쌍이면 가로가 u 가 되게 순서를 바꾼다 (치수 = 가로×세로)
  let r1 = scale(d1, sgn(axesUsed.first)), r2 = scale(d2o, sgn(axesUsed.second));
  let wallAxes: [AxisDir, AxisDir] = [axesUsed.first, axesUsed.second];
  if (A === 'z' && B !== 'z') { [r1, r2] = [r2, r1]; wallAxes = [axesUsed.second, axesUsed.first]; }
  // 두 쌍에 높이(Z)가 없으면(X·Y = 가로 + 바닥 깊이 선) 두 쌍의 평면은 바닥이다. 사인물(면 판정·교정 버튼·매니퓰레이터·3D)은 이 평면을 정면 벽으로 쓰므로
  // **X·Z 수직 벽**을 내준다: u = 월드 X(지정 부호), v = 월드 Z(위). X·Y 는 수평, Z 는 수직 (2026-10-19 사용자: "교정 버튼이 현재 다른 각도를 보인다. 원근과 사인물에서 축이 다르게 연결되었는지")
  if (A !== 'z' && B !== 'z') {
    const xDir = A === 'x' ? axesUsed.first : axesUsed.second;
    const up = cols.z[1] > 0 ? scale(cols.z, -1) : cols.z; // 카메라 y 는 아래 + — 위를 향하게
    r1 = scale(cols.x, sgn(xDir)); r2 = up; wallAxes = [xDir, '+z'];
  }
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
  let scaled = false;
  const H1 = Hof(poseAt(1)), H1inv = invert3(H1);
  if (!H1inv) return null;
  // 원점에서 각 월드 축이 사진에서 뻗는 방향 (s 와 무관: 소실점 방향)
  const projCam = (X: V3): Pt => [(f * X[0]) / X[2] + pp[0], (f * X[1]) / X[2] + pp[1]];
  const originPx: Pt = projCam(o3);
  const axisDir = (d: V3): Pt => {
    // 원점에서 축 방향으로 조금 간 점의 사진 위치 차이 (카메라 뒤로 가면 반대쪽으로)
    const step = Math.max(1e-3, Math.abs(o3[2]) * 1e-3);
    const q: V3 = [o3[0] + d[0] * step, o3[1] + d[1] * step, o3[2] + d[2] * step];
    const qq = q[2] > 1e-9 ? projCam(q) : projCam([o3[0] - d[0] * step, o3[1] - d[1] * step, o3[2] - d[2] * step]);
    const v: Pt = [qq[0] - originPx[0], qq[1] - originPx[1]];
    const n = Math.hypot(v[0], v[1]) || 1;
    return [v[0] / n, v[1] / n];
  };
  const axisImageDir = { x: axisDir(cols.x), y: axisDir(cols.y), z: axisDir(cols.z) };
  /** 축 위 점 P = o3 + λ·d 가 사진의 p(축 선 위로 붙임)에 투영되도록 λ 를 푼다 (s=1 단위) */
  const lambdaOf = (axis: 'x' | 'y' | 'z', p: Pt): number => {
    const d = cols[axis], dir = axisImageDir[axis];
    const t = (p[0] - originPx[0]) * dir[0] + (p[1] - originPx[1]) * dir[1];
    const target: Pt = [originPx[0] + dir[0] * t, originPx[1] + dir[1] * t];
    const useX = Math.abs(dir[0]) >= Math.abs(dir[1]);
    const u = useX ? target[0] - pp[0] : target[1] - pp[1];
    const oi = useX ? o3[0] : o3[1], di = useX ? d[0] : d[1];
    const den = d[2] * u - f * di;
    return Math.abs(den) > 1e-12 ? (f * oi - o3[2] * u) / den : 0;
  };
  if (setup.ref && ('from' in setup.ref || 'point' in setup.ref) && setup.ref.mm > 0) {
    const r = setup.ref;
    const la = 'from' in r ? lambdaOf(r.axis, r.from) : 0, lb = lambdaOf(r.axis, 'from' in r ? r.to : r.point);
    const L1 = Math.abs(lb - la); // 두 핸들 사이 거리 (s=1 단위) → s = mm / L1
    if (L1 > 1e-9) { s = r.mm / L1; scaled = true; } else warnings.push('기준 길이의 두 핸들이 겹칩니다. 축을 따라 떨어뜨리세요.');
  } else {
    const refL = refLineOf(setup, wallAxes[0] !== axesUsed.first);
    if (refL && setup.ref && setup.ref.mm > 0) {
      const toWall = (p: Pt): Pt => { const w = H1inv[6] * p[0] + H1inv[7] * p[1] + H1inv[8]; return [(H1inv[0] * p[0] + H1inv[1] * p[1] + H1inv[2]) / w, (H1inv[3] * p[0] + H1inv[4] * p[1] + H1inv[5]) / w]; };
      const a = toWall(refL.a), b = toWall(refL.b);
      const L1 = refL.axis === 'x' ? Math.abs(b[0] - a[0]) : Math.abs(b[1] - a[1]);
      if (L1 > 1e-9) { s = setup.ref.mm / L1; scaled = true; } else warnings.push('기준 길이 선이 너무 짧습니다.');
    } else warnings.push('기준 길이가 없어 축척(mm)을 정할 수 없습니다. 원점에서 뻗는 축 하나를 고르고 실측 거리를 넣으세요.');
  }
  const pose = poseAt(s);
  const H = Hof(pose);
  const Hinv = invert3(H);
  if (!Hinv) return null;
  // 카메라 위치 C = −Rᵀt (벽 좌표), 화각
  const T = pose.t;
  const cameraPos: V3 = [-(R[0] * T[0] + R[3] * T[1] + R[6] * T[2]), -(R[1] * T[0] + R[4] * T[1] + R[7] * T[2]), -(R[2] * T[0] + R[5] * T[1] + R[8] * T[2])];
  const fov = { h: (2 * Math.atan(imgW / 2 / f) * 180) / Math.PI, v: (2 * Math.atan(imgH / 2 / f) * 180) / Math.PI };
  return { f, pp, pose, H, Hinv, vx, vy, vz, cameraPos, fov, worldR, axesUsed, wallAxes, worldPose: { ...pose, R: worldR }, originPx, axisImageDir, scaled, warnings };
}

/** 기존 실측·벽면 코드가 쓰는 Calibration 형태: 사진 px → 벽 mm (축척 포함) */
/**
 * 사인물로 원근 자동 매칭 (2026-10-19 사용자: "크기를 지정하고 원근에 맞게 그려진 사인물의 코너에 중심점을 주고 사인물 길이를 사용해 표준 길이도 지정 자동으로 매칭"):
 * 원근에 맞게 그린 사각 사인물(quad = 왼쪽 위·오른쪽 위·오른쪽 아래·왼쪽 아래)과 그 가로 mm 로 설정을 만든다 —
 * 위·아래 변 = 가로(X) 축 선, 좌·우 변 = 높이(Z) 축 선, 원점 = 왼쪽 아래 코너, 기준 길이 = 왼쪽 아래 → 오른쪽 아래 (가로 mm)
 */
export function signCameraSetup(quad: Pt[], widthMm: number): CameraSetup {
  const [tl, tr, br, bl] = quad;
  return {
    x: [{ a: tl, b: tr }, { a: bl, b: br }],
    y: [{ a: bl, b: tl }, { a: br, b: tr }],
    axes: { first: '+x', second: '+z' },
    origin: bl,
    ref: { axis: 'x', from: bl, to: br, mm: widthMm },
    principal: 'center',
  };
}

/**
 * 근사치 판정 (2026-10-19 사용자: "입력된 치수의 정확도는 원근을 통한 가로세로 비례값으로 판정한다" → "라인과 가로세로 비율이 맞으면 조용히 그걸 원근 길이로"):
 * 외곽선을 원근으로 벽에 폈을 때 **라인**(아래·왼쪽 변이 벽 축과 6° 안)과 **가로/세로 비율**(입력 치수와 15% 안)이 맞으면 근사치. 경고는 하지 않는다
 */
export const LENGTH_RATIO_TOL = 0.15;
export const LENGTH_ANGLE_TOL = (6 * Math.PI) / 180;
export function signMatches(sol: CameraSolution, quad: Pt[], widthMm: number, heightMm: number): boolean {
  if (quad.length !== 4 || !(widthMm > 0) || !(heightMm > 0)) return false;
  const [tl, tr, br, bl] = quad.map((p) => applyHomography(sol.Hinv, p));
  const len = (a: Pt, b: Pt) => Math.hypot(b[0] - a[0], b[1] - a[1]);
  const w = (len(tl, tr) + len(bl, br)) / 2, h = (len(tl, bl) + len(tr, br)) / 2;
  if (!(w > 0) || !(h > 0)) return false;
  if (Math.abs(w / h / (widthMm / heightMm) - 1) > LENGTH_RATIO_TOL) return false;
  const off = (a: Pt, b: Pt, along: 0 | 1) => Math.atan2(Math.abs(b[1 - along] - a[1 - along]), Math.abs(b[along] - a[along]));
  return off(bl, br, 0) <= LENGTH_ANGLE_TOL && off(bl, tl, 1) <= LENGTH_ANGLE_TOL;
}
/**
 * 자동 원근에 사인물 길이 반영 (2026-10-19 사용자: "사진이 등록되면 바로 원근 자동으로 잡고 오브젝트에 사이즈 들어오고 원근 근사치면 길이 반영하고 이걸 자동으로"):
 * 근사치(signMatches)면 축 선은 그대로 두고 원점 = 왼쪽 아래 코너, 기준 길이 = 왼쪽 아래 → 오른쪽 아래 = 가로 mm 로 바꾼 설정. 아니면 null (원근을 그대로 둔다)
 */
export function signLengthSetup(setup: CameraSetup, quad: Pt[], widthMm: number, heightMm: number, imgW: number, imgH: number): CameraSetup | null {
  const sol = solveCamera(setup, imgW, imgH);
  if (!sol || !signMatches(sol, quad, widthMm, heightMm)) return null;
  const [, , pbr, pbl] = quad;
  return { ...setup, origin: pbl, ref: { axis: 'x', from: pbl, to: pbr, mm: widthMm }, auto: true };
}
/**
 * 치수를 넣은 사인물로 자동 원근 정하기 (2026-10-19 사용자: "실재 치수를 넣었는데 원근이 완성되지 않는다"):
 * · 원근 없음 → 그 사인물로 잡는다(signCameraSetup)
 * · 자동 원근이고 사인물이 맞음(라인·비율) → 축은 두고 원점·길이를 그 사인물로(signLengthSetup)
 * · 자동 원근인데 안 맞음 → 다른 실측 사인물(others)이 지금 원근을 확인하고 있으면 그대로(null), 아무것도 확인하지 않으면 AI 축이 틀린 것으로 보고 그 사인물로 다시 잡는다
 * · 사람이 맞춘 원근 → null
 */
/**
 * 실측 사인물로 원근 + 화각 (2026-10-20 사용자: "실측을 넣었는데 원근완성이 뜨지 않는다"): 사인물 외곽선으로 원근을 잡고(signCameraSetup),
 * 소실점으로 구한 화각(또는 좌우 변이 거의 평행해 쓴 기본 화각)으로 잰 가로세로 비율이 입력과 맞지 않으면 — 크기를 아는 사각형은 화각도 알려 주므로 —
 * 비율이 맞는 초점거리를 찾아 고정한다(focal, 장변의 0.25~5배). 그래도 안 맞으면 화각 고정 없이
 */
export function signCameraFit(quad: Pt[], widthMm: number, heightMm: number, imgW: number, imgH: number): CameraSetup | null {
  const base: CameraSetup = { ...signCameraSetup(quad, widthMm), auto: true };
  const sol = solveCamera(base, imgW, imgH);
  if (!sol) return null;
  if (signMatches(sol, quad, widthMm, heightMm) || !(heightMm > 0)) return base;
  const target = widthMm / heightMm;
  const err = (f: number) => {
    const so = solveCamera({ ...base, focal: f }, imgW, imgH);
    if (!so) return Infinity;
    const m = measureQuad({ H: so.Hinv, sx: 1, sy: 1, perRef: [], warnings: [] }, quad);
    return m.widthMm > 0 && m.heightMm > 0 ? Math.abs(Math.log(m.widthMm / m.heightMm / target)) : Infinity;
  };
  const L = Math.max(imgW, imgH), N = 80, step = Math.pow(20, 1 / N);
  let best = L, bestE = Infinity;
  for (let i = 0; i <= N; i++) { const f = L * 0.25 * Math.pow(step, i), e = err(f); if (e < bestE) { best = f; bestE = e; } }
  let a = best / step, b = best * step;
  for (let k = 0; k < 40; k++) { const m1 = a + (b - a) * 0.382, m2 = a + (b - a) * 0.618; if (err(m1) < err(m2)) b = m2; else a = m1; }
  const fitted: CameraSetup = { ...base, focal: Math.round((a + b) / 2) };
  const fs = solveCamera(fitted, imgW, imgH);
  return fs && signMatches(fs, quad, widthMm, heightMm) ? fitted : base;
}

export function autoCameraFrom(setup: CameraSetup | undefined, quad: Pt[], widthMm: number, heightMm: number, others: { quad: Pt[]; w: number; h: number }[], imgW: number, imgH: number): CameraSetup | null {
  const fromSign = (): CameraSetup | null => signCameraFit(quad, widthMm, heightMm, imgW, imgH);
  if (!setup) return fromSign();
  if (!setup.auto) return null;
  const fit = signLengthSetup(setup, quad, widthMm, heightMm, imgW, imgH);
  if (fit) return fit;
  const sol = solveCamera(setup, imgW, imgH);
  if (sol && sol.scaled && others.some((o) => signMatches(sol, o.quad, o.w, o.h))) return null;
  return fromSign();
}

/**
 * 원근 완성도 (2026-10-19 사용자: "정확도를 경고하지 마라 … 완성도 표시만해줘"): 축(원근 선을 풀 수 있음) → 길이(기준 길이로 mm 축척) → 확인.
 * 확인 = 사람이 원근 창에서 맞췄거나(자동 아님), 치수 넣은 사인물 두 개 이상이 그 원근과 맞음(라인·비율). level = 앞에서부터 채운 칸 수 (0~3)
 */
export interface CameraLevel { axes: boolean; length: boolean; check: boolean; level: 0 | 1 | 2 | 3 }
export function cameraLevel(setup: CameraSetup | undefined, sized: { quad: Pt[]; w: number; h: number }[], imgW: number, imgH: number): CameraLevel {
  const sol = setup ? solveCamera(setup, imgW, imgH) : null;
  if (!setup || !sol) return { axes: false, length: false, check: false, level: 0 };
  const length = sol.scaled;
  // 확인: 사람이 맞춘 원근, 또는 실측 사인물 하나라도 원근과 맞음(라인·비율) — AI 축과 실측이 서로 확인 (2026-10-19 "실재 치수를 넣었는데 원근이 완성되지 않는다")
  const check = length && (!setup.auto || sized.some((s) => signMatches(sol, s.quad, s.w, s.h)));
  return { axes: true, length, check, level: (1 + (length ? 1 : 0) + (check ? 1 : 0)) as 1 | 2 | 3 };
}

export function calibrationOf(s: CameraSolution): Calibration {
  return { H: s.Hinv, sx: 1, sy: 1, metric: true, pose: s.pose, perRef: [], warnings: s.warnings, ...(s.scaled ? {} : { unscaled: true }) };
}

// ---------- 자동 제안 (AI): 선분 검출 + RANSAC 소실점 (lines.ts) ----------

/**
 * 사진에서 가로·세로 축 선 후보: LSD 식 선분 검출 → 소실점 두 개(RANSAC) → 각 소실점을 받치는, 서로 떨어진 긴 선분 두 개.
 * 뚜렷한 직선이 모자라면 null
 */
export function proposeAxisLines(img: Gray, opts: { second?: 'y' | 'z' } = {}): { x: [Line, Line]; y: [Line, Line]; second: '+y' | '+z' } | null {
  const p = proposeAxes(img, opts);
  if (!p) return null;
  const L = (s: { a: Pt; b: Pt }): Line => ({ a: s.a, b: s.b });
  return { x: [L(p.x[0]), L(p.x[1])], y: [L(p.y[0]), L(p.y[1])], second: p.second };
}

/**
 * AI 가 찾은 둘째 선 쌍이 높이(Z)인지 깊이(Y)인지 (2026-10-21 사용자: "원근의 x,z 와 x,y 을 선택이 정면에 가까우면 x,z 가 잘되고 45도에 가까우면 x,y 가 잘 추적하는 것 같아"):
 * 정면 사진에서는 둘째 쌍이 벽의 수직선(높이 Z)이고, 비스듬한(45°) 사진에서는 깊이로 물러나는 대각선(Y — 차양·바닥선·옆벽)이 잡힌다.
 * 두 선이 모두 세로에 가까우면(세로에서 VERTICAL_TOL 안) Z, 아니면 Y. 깊이선이 사진에서 세로로 보이는 경우는 드물다
 */
export const VERTICAL_TOL = (30 * Math.PI) / 180;
export function classifySecondAxis(pair: [Line, Line]): '+z' | '+y' {
  const fromVertical = (l: Line) => { const dx = Math.abs(l.b[0] - l.a[0]), dy = Math.abs(l.b[1] - l.a[1]); return Math.atan2(dx, dy); };
  return pair.every((l) => fromVertical(l) <= VERTICAL_TOL) ? '+z' : '+y';
}
/** AI 제안 선 쌍에 붙일 축: 첫 쌍은 가로 X, 둘째 쌍은 제안이 말한 축(깊이 Y / 높이 Z), 없으면 기울기로 */
export const axesForProposal = (found: { x: [Line, Line]; y: [Line, Line]; second?: '+y' | '+z' }): { first: AxisDir; second: AxisDir } => ({ first: '+x', second: found.second ?? classifySecondAxis(found.y) });

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
