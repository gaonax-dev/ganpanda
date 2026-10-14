// 실사 합성(5차)용 벽면 좌표계: 사진 px ↔ 벽면 mm (X 오른쪽, Y 위, 원점 = 영역들의 좌하단)
// 기준선 보정이 적용된 사진은 그 보정으로, 아니면 치수를 입력한 첫 영역(실측 판독과 같은 규칙)으로 벽면을 정한다.
import type { Calibration } from './calibration';
import { DEFAULT_FOCAL_RATIO, applyHomography, estimateFocal, recoverPose, solveHomography, type CameraPose, type Pt } from './homography';
import { isValidQuad } from './measure';
import type { SignObject } from './model';

export interface WallPlane {
  /** 벽면 mm → 사진 px */
  H: number[];
  /** 사진 px → 벽면 mm */
  Hinv: number[];
  /** calibration = 원근 설정 / reference = 치수 입력 첫 영역 / drawn = 치수 없이 그린 영역의 비율만 (높이 1000mm 가정) */
  source: 'calibration' | 'reference' | 'drawn';
  referenceId?: string;
}

/** 벽면 위 영역의 위치·크기 (mm, 중심 기준) */
export interface Placement { cx: number; cy: number; w: number; h: number }

const mul3 = (a: number[], b: number[]) => {
  const r = new Array(9).fill(0);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) for (let k = 0; k < 3; k++) r[i * 3 + j] += a[i * 3 + k] * b[k * 3 + j];
  return r;
};
function invert3(m: number[]): number[] | null {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
  const det = a * A + b * B + c * C;
  if (Math.abs(det) < 1e-12) return null;
  const inv = [A, -(b * i - c * h), b * f - c * e, B, a * i - c * g, -(a * f - c * d), C, -(a * h - b * g), a * e - b * d];
  return inv.map((v) => v / det);
}
const len = (p: Pt, q: Pt) => Math.hypot(p[0] - q[0], p[1] - q[1]);
const sized = (o: SignObject) => !!(o.widthMm && o.heightMm && isValidQuad(o.quad));

export function wallPlaneOf(objs: SignObject[], calib?: Calibration | null): WallPlane | null {
  // 카메라 설정: 사진 px → 벽 mm 가 이미 원점·방향까지 맞다 → 사인물이 없어도 벽면이 있다
  if (calib?.metric) {
    const H = invert3(calib.H);
    return H ? { H, Hinv: calib.H, source: 'calibration' } : null;
  }
  if (calib) {
    // px → 정면 보정(c.H) → mm 축척 → 영역들의 좌하단을 원점으로.
    // 소실점 부호에 따라 보정 축 방향이 뒤집힐 수 있으므로 첫 영역의 TL→TR 이 +x, BL→TL 이 +y 가 되게 맞춘다
    const valid = objs.filter((o) => isValidQuad(o.quad));
    if (!valid.length) return null;
    const [tl, tr, , bl] = valid[0].quad.map((p) => applyHomography(calib.H, p));
    const sgnX = tr[0] - tl[0] >= 0 ? 1 : -1, sgnY = tl[1] - bl[1] >= 0 ? 1 : -1;
    const S = [sgnX * calib.sx, 0, 0, 0, sgnY * calib.sy, 0, 0, 0, 1];
    const toMm = mul3(S, calib.H);
    const pts = valid.flatMap((o) => o.quad.map((p) => applyHomography(toMm, p)));
    const minX = Math.min(...pts.map((p) => p[0])), minY = Math.min(...pts.map((p) => p[1]));
    const Hinv = mul3([1, 0, -minX, 0, 1, -minY, 0, 0, 1], toMm);
    const H = invert3(Hinv);
    return H ? { H, Hinv, source: 'calibration' } : null;
  }
  const ref = objs.find(sized);
  if (ref) {
    const w = ref.widthMm!, h = ref.heightMm!;
    const H = solveHomography([[0, h], [w, h], [w, 0], [0, 0]], ref.quad);
    const Hinv = invert3(H);
    return Hinv ? { H, Hinv, source: 'reference', referenceId: ref.id } : null;
  }
  // 치수도 원근도 없으면: 사용자가 그린 영역을 그대로 벽면으로 (2026-10-14 사용자: "사진 위의 사인물 크기는 그린 사인물에 맞물리면 된다").
  // 실제 mm 는 모르니 높이 1000mm 로 두고 가로는 영역의 비율로 — 3D 는 그려진 자리에 그 비율대로 놓인다
  const drawn = objs.find((o) => isValidQuad(o.quad));
  if (!drawn) return null;
  const [tl, tr, br, bl] = drawn.quad;
  const pw = (len(tl, tr) + len(bl, br)) / 2, ph = (len(tl, bl) + len(tr, br)) / 2;
  if (!(pw > 0 && ph > 0)) return null;
  const h = 1000, w = (1000 * pw) / ph;
  const H = solveHomography([[0, h], [w, h], [w, 0], [0, 0]], drawn.quad);
  const Hinv = invert3(H);
  return Hinv ? { H, Hinv, source: 'drawn', referenceId: drawn.id } : null;
}

/** 사진 위 사각 영역의 네 꼭짓점(TL,TR,BR,BL) → 벽면 mm (일반 사각형 그대로 — 사인물을 그린 자리에 정확히 맞출 때) */
export function quadOnWall(plane: WallPlane, o: { quad: Pt[] }): Pt[] {
  return o.quad.map((p) => applyHomography(plane.Hinv, p));
}

/** 사진 위 사각 영역 → 벽면 mm 위치·크기 (위·아래 변 평균 = 가로, 좌·우 변 평균 = 세로) */
export function placeOnWall(plane: WallPlane, o: { quad: Pt[] }): Placement {
  const [tl, tr, br, bl] = o.quad.map((p) => applyHomography(plane.Hinv, p));
  return {
    cx: (tl[0] + tr[0] + br[0] + bl[0]) / 4,
    cy: (tl[1] + tr[1] + br[1] + bl[1]) / 4,
    w: (len(tl, tr) + len(bl, br)) / 2,
    h: (len(tl, bl) + len(tr, br)) / 2,
  };
}

/**
 * 벽면 호모그래피에 **정확히** 맞는 3×4 투영 행렬 (row-major 12개): 사진 px(동차) = P · [X Y Z 1].
 * 핀홀 카메라로 분해하면(poseOfPlane) 손으로 그린 영역처럼 핀홀과 맞지 않는 H 에서는 멀리 있는 사인물이 제자리에서 벗어난다.
 * 그래서 X·Y·평행이동 열은 H 그대로 쓰고(z=0 평면은 오차 0), Z 열만 추정 카메라(K)로 만든 r₃ 로 채운다 (AR 마커 방식).
 * 2026-10-14 사용자: "사진 위의 사인물 크기는 사용자가 그린 사인물에 맞물리면 된다"
 */
export function projectionFromPlane(plane: WallPlane, imgW: number, imgH: number): number[] {
  const H = plane.H;
  const pose = poseOfPlane(plane, imgW, imgH);
  const f = pose.f, cx = imgW / 2, cy = imgH / 2;
  const h1: V3 = [H[0], H[3], H[6]], h2: V3 = [H[1], H[4], H[7]], h3: V3 = [H[2], H[5], H[8]];
  const Kinv = (v: V3): V3 => [(v[0] - cx * v[2]) / f, (v[1] - cy * v[2]) / f, v[2]];
  const r1 = Kinv(h1), r2 = Kinv(h2);
  const n1 = Math.hypot(...r1) || 1, n2 = Math.hypot(...r2) || 1;
  const lambda = (n1 + n2) / 2;
  const u1: V3 = [r1[0] / n1, r1[1] / n1, r1[2] / n1], u2: V3 = [r2[0] / n2, r2[1] / n2, r2[2] / n2];
  let r3: V3 = [(u1[1] * u2[2] - u1[2] * u2[1]) * lambda, (u1[2] * u2[0] - u1[0] * u2[2]) * lambda, (u1[0] * u2[1] - u1[1] * u2[0]) * lambda];
  // +Z 는 벽 밖(카메라 쪽): 깊이(3행)가 Z 와 함께 줄어야 한다. 원점의 깊이 h3[2] 와 같은 부호를 기준으로
  if (r3[2] * h3[2] > 0) r3 = [-r3[0], -r3[1], -r3[2]];
  const p3: V3 = [f * r3[0] + cx * r3[2], f * r3[1] + cy * r3[2], r3[2]];
  return [h1[0], h2[0], p3[0], h3[0], h1[1], h2[1], p3[1], h3[1], h1[2], h2[2], p3[2], h3[2]];
}
type V3 = [number, number, number];

/** 3×4 투영으로 점을 사진 px 로 (검증용). 깊이가 0 이하면 null */
export function projectP(P: number[], p: [number, number, number]): Pt | null {
  const w = P[8] * p[0] + P[9] * p[1] + P[10] * p[2] + P[11];
  if (!(w > 1e-9)) return null;
  return [(P[0] * p[0] + P[1] * p[1] + P[2] * p[2] + P[3]) / w, (P[4] * p[0] + P[5] * p[1] + P[6] * p[2] + P[7]) / w];
}

/** 벽면 → 핀홀 카메라 포즈 (벽면 mm 좌표가 그대로 월드 좌표) */
export function poseOfPlane(plane: WallPlane, imgW: number, imgH: number, span = 4000): CameraPose {
  const wall: Pt[] = [[0, span], [span, span], [span, 0], [0, 0]];
  const img = wall.map((p) => applyHomography(plane.H, p));
  const centered = img.map(([u, v]) => [u - imgW / 2, v - imgH / 2] as Pt);
  const f = estimateFocal(solveHomography(wall, centered), imgW, imgH) ?? DEFAULT_FOCAL_RATIO * Math.max(imgW, imgH);
  return recoverPose(img, span, span, imgW, imgH, f);
}
