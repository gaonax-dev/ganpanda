// 4점 원근 보정: 호모그래피 계산 → 핀홀 카메라 포즈 복원 (AI 없이 순수 기하학)

export type Pt = [number, number];

/** 사진 기본 초점거리 추정치 (스마트폰 메인 카메라 26mm 환산 ≈ 장변 × 0.75) */
export const DEFAULT_FOCAL_RATIO = 0.75;

function gaussSolve(A: number[][], b: number[]): number[] {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-12) throw new Error('singular');
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const k = M[r][c] / M[c][c];
      for (let j = c; j <= n; j++) M[r][j] -= k * M[c][j];
    }
  }
  return M.map((row, i) => row[n] / row[i]);
}

/** src → dst 로 보내는 3x3 호모그래피 (row-major, h33 = 1) */
export function solveHomography(src: Pt[], dst: Pt[]): number[] {
  const A: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i];
    const [u, v] = dst[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    b.push(v);
  }
  return [...gaussSolve(A, b), 1];
}

export function applyHomography(H: number[], [x, y]: Pt): Pt {
  const w = H[6] * x + H[7] * y + H[8];
  return [(H[0] * x + H[1] * y + H[2]) / w, (H[3] * x + H[4] * y + H[5]) / w];
}

type V3 = [number, number, number];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a: V3) => Math.hypot(a[0], a[1], a[2]);
const scale = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: V3, b: V3): V3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

/** 이미지 좌표의 코너(TL,TR,BR,BL) → 벽 좌표(mm, X 오른쪽 / Y 위, 원점 = 좌하단) */
function wallCorners(w: number, h: number): Pt[] {
  return [[0, h], [w, h], [w, 0], [0, 0]];
}

function centered(pts: Pt[], imgW: number, imgH: number): Pt[] {
  return pts.map(([u, v]) => [u - imgW / 2, v - imgH / 2]);
}

/** 두 직교 제약으로 초점거리(px) 추정. 정면에 가까운 사진처럼 불안정하면 null */
export function estimateFocal(H: number[], imgW: number, imgH: number): number | null {
  const h1: V3 = [H[0], H[3], H[6]];
  const h2: V3 = [H[1], H[4], H[7]];
  const cands: number[] = [];
  const den1 = h1[2] * h2[2];
  if (Math.abs(den1) > 1e-18) cands.push(-(h1[0] * h2[0] + h1[1] * h2[1]) / den1);
  const den2 = h1[2] ** 2 - h2[2] ** 2;
  if (Math.abs(den2) > 1e-18) cands.push((h2[0] ** 2 + h2[1] ** 2 - h1[0] ** 2 - h1[1] ** 2) / den2);
  const long = Math.max(imgW, imgH);
  const valid = cands.filter((f2) => f2 > 0).map(Math.sqrt).filter((f) => f > 0.3 * long && f < 4 * long);
  if (!valid.length) return null;
  return valid.reduce((a, b) => a + b) / valid.length;
}

/** 벽 세로 길이를 모를 때: 가로 길이와 초점거리로 세로(mm) 추정 */
export function estimateWallHeight(imgPts: Pt[], wallW: number, f: number, imgW: number, imgH: number): number {
  const H = solveHomography(wallCorners(1, 1), centered(imgPts, imgW, imgH));
  const m1: V3 = [H[0] / f, H[3] / f, H[6]];
  const m2: V3 = [H[1] / f, H[4] / f, H[7]];
  return (wallW * norm(m2)) / norm(m1);
}

export interface CameraPose {
  /** 초점거리(px) */
  f: number;
  /** world → camera(OpenCV: x 오른쪽, y 아래, z 앞) 회전, row-major 3x3 */
  R: number[];
  t: V3;
  imgW: number;
  imgH: number;
  /** 주점 (사진 px). 없으면 사진 중앙 */
  pp?: Pt;
}

export function recoverPose(
  imgPts: Pt[], wallW: number, wallH: number, imgW: number, imgH: number, f: number,
): CameraPose {
  const H = solveHomography(wallCorners(wallW, wallH), centered(imgPts, imgW, imgH));
  const m1: V3 = [H[0] / f, H[3] / f, H[6]];
  const m2: V3 = [H[1] / f, H[4] / f, H[7]];
  const m3: V3 = [H[2] / f, H[5] / f, H[8]];
  let lambda = 2 / (norm(m1) + norm(m2));
  if (m3[2] * lambda < 0) lambda = -lambda; // 벽이 카메라 앞(z>0)에 있어야 함
  let r1 = scale(m1, lambda);
  let r2 = scale(m2, lambda);
  const t = scale(m3, lambda);
  // Gram-Schmidt 로 직교화
  r1 = scale(r1, 1 / norm(r1));
  r2 = sub(r2, scale(r1, dot(r1, r2)));
  r2 = scale(r2, 1 / norm(r2));
  const r3 = cross(r1, r2);
  const R = [r1[0], r2[0], r3[0], r1[1], r2[1], r3[1], r1[2], r2[2], r3[2]];
  return { f, R, t, imgW, imgH };
}

/** 벽 좌표 → 이미지 픽셀, 카메라 뒤(깊이 ≤ 0)면 null — 3D 오버레이용 */
export function projectVisible(pose: CameraPose, p: V3): Pt | null {
  const { R, t } = pose;
  const z = R[6] * p[0] + R[7] * p[1] + R[8] * p[2] + t[2];
  if (z <= 1e-6) return null;
  return projectPoint(pose, p);
}

/** 검증/테스트용: 벽 좌표(mm, z=벽에서 튀어나온 거리) → 이미지 픽셀 */
export function projectPoint(pose: CameraPose, p: V3): Pt {
  const { R, t, f, imgW, imgH } = pose;
  const [cx, cy] = pose.pp ?? [imgW / 2, imgH / 2];
  const x = R[0] * p[0] + R[1] * p[1] + R[2] * p[2] + t[0];
  const y = R[3] * p[0] + R[4] * p[1] + R[5] * p[2] + t[1];
  const z = R[6] * p[0] + R[7] * p[1] + R[8] * p[2] + t[2];
  return [(f * x) / z + cx, (f * y) / z + cy];
}
