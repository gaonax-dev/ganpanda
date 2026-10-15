// 실사 합성(5차)용 벽면 좌표계: 사진 px ↔ 벽면 mm (X 오른쪽, Y 위, 원점 = 영역들의 좌하단)
// 기준선 보정이 적용된 사진은 그 보정으로, 아니면 치수를 입력한 첫 영역(실측 판독과 같은 규칙)으로 벽면을 정한다.
import type { Calibration } from './calibration';
import { DEFAULT_FOCAL_RATIO, applyHomography, estimateFocal, projectPoint, recoverPose, solveHomography, type CameraPose, type Pt } from './homography';
import { isValidQuad } from './measure';
import type { SignObject } from './model';
import { SKEW_ALERT, readTurn, skewOf, turnedPlane } from './manipulator';
import { faceFrameOf, type FaceAxis, type FaceFrame } from './faces';
import { localBoxDir, outlineCenter3, towardCamera, worldAxes } from './boxGizmo';

export interface WallPlane {
  /** 벽면 mm → 사진 px */
  H: number[];
  /** 사진 px → 벽면 mm */
  Hinv: number[];
  /** calibration = 원근 설정 / reference = 치수 입력 첫 영역 / drawn = 치수 없이 그린 영역의 비율만 (높이 1000mm 가정) */
  source: 'calibration' | 'reference' | 'drawn';
  /** 카메라 설정의 포즈 (있으면 투영·3D 카메라에 그대로 씀 — 원근 창과 동일) */
  pose?: CameraPose;
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
    return H ? { H, Hinv: calib.H, source: 'calibration', pose: calib.pose } : null;
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
  // 카메라 설정이 있으면 그 포즈 그대로 P = K[r1 r2 r3 t] — 원근 창의 격자·상자와 같은 위치 (2026-10-14 사용자: "원근과 3D 에서 큐브 위치가 다르다")
  if (plane.pose) {
    const { R, t, f } = plane.pose, [cx, cy] = plane.pose.pp ?? [imgW / 2, imgH / 2];
    const K = (col: V3): V3 => [f * col[0] + cx * col[2], f * col[1] + cy * col[2], col[2]];
    const c1 = K([R[0], R[3], R[6]]), c2 = K([R[1], R[4], R[7]]), c3 = K([R[2], R[5], R[8]]), c4 = K(t);
    return [c1[0], c2[0], c3[0], c4[0], c1[1], c2[1], c3[1], c4[1], c1[2], c2[2], c3[2], c4[2]];
  }
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
  if (plane.pose) return plane.pose;
  const wall: Pt[] = [[0, span], [span, span], [span, 0], [0, 0]];
  const img = wall.map((p) => applyHomography(plane.H, p));
  const centered = img.map(([u, v]) => [u - imgW / 2, v - imgH / 2] as Pt);
  const f = estimateFocal(solveHomography(wall, centered), imgW, imgH) ?? DEFAULT_FOCAL_RATIO * Math.max(imgW, imgH);
  return recoverPose(img, span, span, imgW, imgH, f);
}

/**
 * 사인물 하나를 3D 로 그릴 면 (2026-10-15 사용자: "실제 입력 길이로 인해 3D 각도에 영향을 주는 것 같아… 원근 설정되었고 오브젝트를 원근 각도에 맞춘 거면 각도는 이쪽에 우선").
 * 원근 설정(카메라)이 있으면 **세 면** 중 하나(faceOf): 벽면(y)·벽에 직각인 세로면(x)·수평면(z) — 외곽선은 그린 그대로, 3D 만 그 면으로.
 * 벽에서 돌려 세운 사인물은 원근 카메라를 돌린 면. 그 외(원근 없음, 어느 면에도 맞지 않는 외곽선) → 사인물 자신의 면 (그린 자리에 맞물림 우선)
 */
export function signPlaneOf(o: SignObject, cal: WallPlane | null): WallPlane | null {
  return faceOf(o, cal)?.plane ?? wallPlaneOf([o], null);
}

/** 자동으로 x·z 면을 고르는 한계: 바른 직사각형으로 폈을 때 꼭짓점이 대각선의 5% 안 (손 떨림은 봐주고, 엉뚱한 사각형은 면으로 보지 않는다) */
const AUTO_FACE_ERR = 0.05;

/**
 * 사인물의 정면 축과 그 면 (2026-10-15 사용자: "삼면 구조로 진행해줘"; "사인물의 정면을 바꾸자는 의미지 기준을 변경하자는 건 아니다").
 * - 돌려 세운 사인물(turn) → 돌린 면 (45° 넘으면 x)
 * (정면 축 faceAxis·박스 방향 boxDir 은 면을 바꾸지 않는다 — 박스 방향만. 2026-10-15 사용자: "정면을 바꾸면 박스 구조만 변경되고 원 사인물은 형태를 유지해야한다")
 * - 자동: 외곽선이 벽면의 직사각형이면(비틀림 ≤ 3°) y, 아니면 x·z 중 바른 직사각형으로 폈을 때 가장 덜 벗어나는 면(대각선 5% 안). 둘 다 아니면 null
 * 원근 설정이 없으면 null
 */
export function faceOf(o: SignObject, cal: WallPlane | null): { axis: FaceAxis; plane: WallPlane } | null {
  if (!(cal?.source === 'calibration' && cal.pose && isValidQuad(o.quad))) return null;
  if (o.turn) {
    const tf = readTurn(cal, o.quad, o.turn);
    const tp = tf && turnedPlane(cal, tf);
    if (!tf || !tp) return null;
    const rect: Pt[] = [[0, tf.h], [tf.w, tf.h], [tf.w, 0], [0, 0]];
    const proj = rect.map(([x, y]) => projectPoint(tp.pose, [x, y, 0]));
    return { axis: o.turn.deg > 45 ? 'x' : 'y', plane: { H: solveHomography(rect, proj), Hinv: solveHomography(proj, rect), source: 'calibration', pose: tp.pose, referenceId: o.id } };
  }
  const asPlane = (ff: FaceFrame): WallPlane => ({ H: ff.H, Hinv: ff.Hinv, source: 'calibration', pose: ff.pose, referenceId: o.id });
  if (skewOf(cal, o.quad) <= SKEW_ALERT) return { axis: 'y', plane: cal };
  let best: { axis: FaceAxis; ff: FaceFrame } | null = null;
  for (const axis of ['x', 'z'] as const) {
    const ff = faceFrameOf(cal, o.quad, axis);
    if (ff && ff.err <= AUTO_FACE_ERR && (!best || ff.err < best.ff.err)) best = { axis, ff };
  }
  return best ? { axis: best.axis, plane: asPlane(best.ff) } : null;
}

/**
 * 박스 방향 (원근 설정의 벽 좌표 단위 벡터, 카메라 쪽): 회전 고리로 돌린 방향 > 고른 정면 축 > 사인물 면의 법선(자동). 원근 설정이 없으면 null
 * (2026-10-15 사용자: "박스만 회전하고 크기는 외곽선만")
 */
export function boxDirOf(o: SignObject, cal: WallPlane | null): [number, number, number] | null {
  if (!(cal?.source === 'calibration' && cal.pose)) return null;
  const pose = cal.pose, A = worldAxes(pose);
  const face = faceOf(o, cal), at = outlineCenter3(cal, face?.plane ?? cal, o.quad) ?? undefined;
  if (o.boxDir) return towardCamera(pose, o.boxDir, at);
  if (o.faceAxis) return towardCamera(pose, A[o.faceAxis], at);
  const pl = face?.plane.pose;
  if (!pl) return towardCamera(pose, A.y, at);
  // 면의 법선(면 좌표 z)을 벽 좌표로: n_cam = R'·[0,0,1], n = Rᵀ·n_cam
  const nc: [number, number, number] = [pl.R[2], pl.R[5], pl.R[8]], R = pose.R;
  return towardCamera(pose, [R[0] * nc[0] + R[3] * nc[1] + R[6] * nc[2], R[1] * nc[0] + R[4] * nc[1] + R[7] * nc[2], R[2] * nc[0] + R[5] * nc[1] + R[8] * nc[2]], at);
}

/**
 * 박스 방향을 사인물 면 좌표로 (3D 렌더링·상자 가이드): 면 좌표의 z = 면의 법선. 카메라 쪽을 향한다.
 * own = 그 사인물을 그릴 면(signPlaneOf). 원근 설정이 없으면 null (면의 법선으로 그린다)
 */
export function boxLocalDirOf(o: SignObject, own: WallPlane, cal: WallPlane | null, imgW: number, imgH: number): [number, number, number] | null {
  const d = boxDirOf(o, cal);
  if (!d || !cal?.pose) return null;
  const face = { H: own.H, Hinv: own.Hinv, pose: own.pose ?? poseOfPlane(own, imgW, imgH) };
  return localBoxDir(face, cal.pose, d, outlineCenter3(cal, own, o.quad) ?? undefined);
}

/**
 * 3D 로 만들 사인물 자체의 크기(글자·디자인 배치 기준, mm) = 구도로 정한 면에서 잰 크기 (없으면 자신의 면).
 * 정면 축·박스 방향·입력 치수와 무관 (2026-10-15 사용자: "정면을 바꾸면 박스 구조만 변경되고 원 사인물은 형태를 유지해야한다")
 */
export function contentSizeOf(o: SignObject, cal: WallPlane | null): { w: number; h: number } | null {
  const pl = signPlaneOf(o, cal);
  if (!pl) return null;
  const at = placeOnWall(pl, o);
  return { w: at.w, h: at.h };
}
/** 3D 배치(위치는 그 면의 자리)에 사인물 자체 크기를 씌운다 */
export function sizedAt(o: SignObject, at: Placement, cal: WallPlane | null): Placement {
  const cs = contentSizeOf(o, cal);
  return cs ? { ...at, w: cs.w, h: cs.h } : at;
}

/** 벽면(y)이 아닌 면에 놓인 사인물의 크기(mm, 그 면에서 잰 값). 벽면이면 undefined(벽면 측정 그대로), 어느 면도 아니면 null(측정 없음) */
export function faceSizeOf(o: SignObject, cal: WallPlane | null): { widthMm: number; heightMm: number } | null | undefined {
  const f = faceOf(o, cal);
  if (!f) return null;
  if (f.plane === cal) return undefined;
  const at = placeOnWall(f.plane, o);
  return { widthMm: at.w, heightMm: at.h };
}

/** 면 좌표의 +z 가 카메라 쪽이면 1, 반대면 -1 — 원근 설정의 카메라는 축 지정에 따라 벽 안쪽이 +z 일 수 있다. 3D 상자는 이 부호로 뒤집어 앞면이 카메라를 보게 */
export function zTowardCamera(P: number[], at: Pt): 1 | -1 {
  const depth = (z: number) => P[8] * at[0] + P[9] * at[1] + P[10] * z + P[11];
  return depth(1) < depth(0) ? 1 : -1;
}
