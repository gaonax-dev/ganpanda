// 입체 매니퓰레이터 (2026-10-15 사용자: "사인물의 아웃라인으로 위치나 각도를 판정하는데 설정한 원근의 각도를 지정… 입체적 매니퓰레이터를 사용해
// 외곽 바운더리를 변경하면 매니퓰레이터가 위치나 방향을 변경하고 원근 매니퓰레이터도 나타나 해당 방향으로 각도를 맞추게").
// 사인물의 외곽선(사진 px)을 기준 면(카메라 설정의 벽면, 없으면 사인물 자신의 면) 위의 "틀"(중심·가로·세로·방향, mm)로 읽고,
// 틀을 옮기고·돌리고·늘린 뒤 다시 사진 px 외곽선으로 그린다. 외곽선이 기준 면의 직사각형에서 얼마나 비틀렸는지(원근 어긋남)도 잰다.
import { applyHomography, projectPoint, type CameraPose, type Pt } from './homography';

/** 기준 면: H = 면 mm → 사진 px, Hinv = 사진 px → 면 mm, pose = 카메라(있으면 벽에서 나오는 방향도 그린다) */
export interface RefPlane { H: number[]; Hinv: number[]; pose?: CameraPose }
/** 면 위 틀 (mm): c = 중심, ex = 사인물 가로 방향(TL→TR) 단위, ey = 사인물 세로 아래 방향(TL→BL) 단위, w·h = 크기 */
export interface Frame { c: Pt; ex: Pt; ey: Pt; w: number; h: number }

const add = (a: Pt, b: Pt): Pt => [a[0] + b[0], a[1] + b[1]];
const sub = (a: Pt, b: Pt): Pt => [a[0] - b[0], a[1] - b[1]];
const mul = (a: Pt, k: number): Pt => [a[0] * k, a[1] * k];
const dot = (a: Pt, b: Pt) => a[0] * b[0] + a[1] * b[1];
const cross = (a: Pt, b: Pt) => a[0] * b[1] - a[1] * b[0];
const unit = (a: Pt): Pt => { const l = Math.hypot(a[0], a[1]) || 1; return [a[0] / l, a[1] / l]; };
const rot = (a: Pt, t: number): Pt => [a[0] * Math.cos(t) - a[1] * Math.sin(t), a[0] * Math.sin(t) + a[1] * Math.cos(t)];

/** 사진 영역(TL,TR,BR,BL) → 면 위 틀 */
export function frameOf(plane: RefPlane, quad: Pt[]): Frame {
  const [tl, tr, br, bl] = quad.map((p) => applyHomography(plane.Hinv, p));
  const ex = unit(add(sub(tr, tl), sub(br, bl)));
  const down = add(sub(bl, tl), sub(br, tr));
  let ey: Pt = [-ex[1], ex[0]];
  if (dot(ey, down) < 0) ey = mul(ey, -1);
  const c = mul(add(add(tl, tr), add(br, bl)), 0.25);
  const w = (dot(sub(tr, tl), ex) + dot(sub(br, bl), ex)) / 2;
  const h = (dot(sub(bl, tl), ey) + dot(sub(br, tr), ey)) / 2;
  return { c, ex, ey, w: Math.abs(w), h: Math.abs(h) };
}

/** 틀의 네 꼭짓점 (면 mm, TL,TR,BR,BL) */
export function cornersOf(f: Frame): Pt[] {
  const hx = mul(f.ex, f.w / 2), hy = mul(f.ey, f.h / 2);
  return [sub(sub(f.c, hx), hy), sub(add(f.c, hx), hy), add(add(f.c, hx), hy), add(sub(f.c, hx), hy)];
}

/** 틀 → 사진 영역 (원근 그대로) */
export const quadOf = (plane: RefPlane, f: Frame): Pt[] => cornersOf(f).map((p) => applyHomography(plane.H, p));

/** 옮기기: d = 면 위 이동(mm). x = 사인물 가로로만, z = 사인물 세로(위아래)로만, free = 그대로 */
export function moveFrame(f: Frame, d: Pt, axis: 'x' | 'z' | 'free'): Frame {
  const m = axis === 'x' ? mul(f.ex, dot(d, f.ex)) : axis === 'z' ? mul(f.ey, dot(d, f.ey)) : d;
  return { ...f, c: add(f.c, m) };
}

/** 면 안에서 돌리기: 중심에서 from → to 로 끈 각도만큼 */
export function rotateFrame(f: Frame, from: Pt, to: Pt): Frame {
  const a = sub(from, f.c), b = sub(to, f.c);
  const t = Math.atan2(cross(a, b), dot(a, b));
  return { ...f, ex: rot(f.ex, t), ey: rot(f.ey, t) };
}

/** 크기: 오른쪽 변(가로) 또는 위 변(세로)을 to(면 mm)까지, 반대쪽 변은 그대로 */
export function resizeFrame(f: Frame, edge: 'right' | 'top', to: Pt): Frame {
  if (edge === 'right') {
    const left = sub(f.c, mul(f.ex, f.w / 2));
    const w = Math.max(10, dot(sub(to, left), f.ex));
    return { ...f, w, c: add(left, mul(f.ex, w / 2)) };
  }
  const bottom = add(f.c, mul(f.ey, f.h / 2));
  const h = Math.max(10, dot(sub(to, bottom), mul(f.ey, -1)));
  return { ...f, h, c: sub(bottom, mul(f.ey, h / 2)) };
}

/**
 * 크기 손잡이 (2026-10-15 사용자: "크기는 각면 중앙과 꼭지에 있어야 한다", "크기는 외곽선만"): sx·sy ∈ −1·0·1 (sx = 1 오른쪽, sy = 1 위).
 * 변 가운데(한쪽만 0)는 그 방향만, 꼭짓점은 비율 유지. 반대쪽 변·꼭짓점은 그대로. to = 면 mm
 */
export function resizeFrameAt(f: Frame, sx: number, sy: number, to: Pt): Frame {
  const up = mul(f.ey, -1);
  const d = sub(to, f.c), u = dot(d, f.ex), v = dot(d, up);
  let w = f.w, h = f.h, cu = 0, cv = 0;
  if (sx && sy) {
    const F = [(-sx * f.w) / 2, (-sy * f.h) / 2], G = [(sx * f.w) / 2, (sy * f.h) / 2], gf = [G[0] - F[0], G[1] - F[1]];
    const k = Math.max(0.05, ((u - F[0]) * gf[0] + (v - F[1]) * gf[1]) / (gf[0] ** 2 + gf[1] ** 2));
    w = f.w * k; h = f.h * k; cu = F[0] + (sx * w) / 2; cv = F[1] + (sy * h) / 2;
  } else if (sx) {
    const e = (-sx * f.w) / 2;
    w = Math.max(10, sx * (u - e)); cu = e + (sx * w) / 2;
  } else if (sy) {
    const e = (-sy * f.h) / 2;
    h = Math.max(10, sy * (v - e)); cv = e + (sy * h) / 2;
  }
  return { ...f, w, h, c: add(add(f.c, mul(f.ex, cu)), mul(up, cv)) };
}
/** 크기 손잡이 8개의 면 위 자리 (네 변 가운데 + 네 꼭짓점) */
export function sizeHandlesOf(f: Frame): { sx: number; sy: number; at: Pt }[] {
  const up = mul(f.ey, -1), out: { sx: number; sy: number; at: Pt }[] = [];
  for (const sx of [-1, 0, 1]) for (const sy of [-1, 0, 1]) if (sx || sy) out.push({ sx, sy, at: add(add(f.c, mul(f.ex, (sx * f.w) / 2)), mul(up, (sy * f.h) / 2)) });
  return out;
}
/**
 * 외곽선(사진)의 원근 중심 = 두 대각선의 교점 (2026-10-15 사용자: "새로 생성하는 사인물툴의 메니폴레이터가 엉뚱한곳에 나타나").
 * 평면 직사각형의 중심은 어느 면에 있든 사진에서 대각선 교점이다 — 벽면으로 옮긴 꼭짓점의 평균은 외곽선이 벽면이 아니거나
 * 벽의 지평선 가까이면 엉뚱한 곳이 된다
 */
export function quadCenter(q: Pt[]): Pt {
  const [a, b, c, d] = q;
  const r = sub(c, a), s = sub(d, b), den = cross(r, s);
  if (Math.abs(den) < 1e-9) return mul(add(add(a, b), add(c, d)), 0.25);
  const t = cross(sub(b, a), s) / den;
  return add(a, mul(r, t));
}

/** 원근 어긋남(도): 외곽선을 면 위로 옮겼을 때 네 모서리 각이 90°에서 가장 많이 벗어난 정도 */
export function skewOf(plane: RefPlane, quad: Pt[]): number {
  const w = quad.map((p) => applyHomography(plane.Hinv, p));
  let worst = 0;
  for (let i = 0; i < 4; i++) {
    const a = sub(w[(i + 3) % 4], w[i]), b = sub(w[(i + 1) % 4], w[i]);
    const ang = (Math.acos(Math.max(-1, Math.min(1, dot(unit(a), unit(b))))) * 180) / Math.PI;
    worst = Math.max(worst, Math.abs(ang - 90));
  }
  return worst;
}
/** 원근에 맞추기: 외곽선을 같은 위치·크기·방향의 면 위 직사각형으로 */
export const alignQuad = (plane: RefPlane, quad: Pt[]): Pt[] => quadOf(plane, frameOf(plane, quad));
/** 이 정도 넘게 비틀리면 원근 매니퓰레이터를 보여 준다 */
export const SKEW_ALERT = 3;

/** 매니퓰레이터 그리기용 사진 px 점들: 중심, X·Z(·Y) 화살표 끝, 회전 고리(+손잡이), 크기 손잡이(오른쪽·위 변 가운데) */
export function gizmoOf(plane: RefPlane, f: Frame, lengthMm?: number) {
  const L = lengthMm ?? Math.max(f.w, f.h) * 0.35;
  const P = (p: Pt) => applyHomography(plane.H, p);
  const R = L * 0.8;
  const ring = Array.from({ length: 33 }, (_, i) => { const t = (i / 32) * Math.PI * 2; return P(add(f.c, add(mul(f.ex, Math.cos(t) * R), mul(f.ey, -Math.sin(t) * R)))); });
  const ringHandleWall = add(f.c, add(mul(f.ex, Math.cos(Math.PI / 4) * R), mul(f.ey, -Math.sin(Math.PI / 4) * R)));
  let y: Pt | undefined;
  /** 평면 판 (2026-10-15 사용자: "이동 xyz 끝은 화살표 센터에 투명한 사각형… 사각 판을 선택하면 그걸 사인물의 정면으로"): 이름 = 판의 법선 = 고르면 정면이 되는 축.
   *  y = X·Z 사이(벽면), x = Y·Z 사이(벽에 직각인 세로면), z = X·Y 사이(수평면). 두 화살표 방향으로 길이의 0.3~0.6 */
  let planes: { x: Pt[]; y: Pt[]; z: Pt[] } | undefined;
  if (plane.pose) {
    // 벽에서 나오는 방향 = 카메라 쪽(깊이가 줄어드는 쪽)
    const pose = plane.pose, { R: Rm, t } = pose;
    const depth = (x: number, yy: number, z: number) => Rm[6] * x + Rm[7] * yy + Rm[8] * z + t[2];
    const z = depth(f.c[0], f.c[1], L) < depth(f.c[0], f.c[1], -L) ? L : -L;
    if (depth(f.c[0], f.c[1], z) > 0) y = projectPoint(pose, [f.c[0], f.c[1], z]);
    const out = Math.sign(z), up = mul(f.ey, -1), A = L * 0.3, B = L * 0.6;
    const sq = (at: (u: number, v: number) => [number, number, number]) => {
      const pts = [[A, A], [B, A], [B, B], [A, B]].map(([u, v]) => at(u, v));
      return pts.every((p) => depth(...p) > 0) ? pts.map((p) => projectPoint(pose, p)) : null;
    };
    const wy = sq((u, v) => { const p = add(f.c, add(mul(f.ex, u), mul(up, v))); return [p[0], p[1], 0]; });
    const wx = sq((u, v) => { const p = add(f.c, mul(up, v)); return [p[0], p[1], out * u]; });
    const wz = sq((u, v) => { const p = add(f.c, mul(f.ex, u)); return [p[0], p[1], out * v]; });
    if (wx && wy && wz) planes = { x: wx, y: wy, z: wz };
  }
  return {
    lengthMm: L,
    c: P(f.c), x: P(add(f.c, mul(f.ex, L))), z: P(sub(f.c, mul(f.ey, L))), y, planes,
    ring, ringHandle: P(ringHandleWall), ringHandleWall,
    right: P(add(f.c, mul(f.ex, f.w / 2))), top: P(sub(f.c, mul(f.ey, f.h / 2))),
    corner: P(sub(add(f.c, mul(f.ex, f.w / 2)), mul(f.ey, f.h / 2))),
  };
}

/** 틀의 가로 방향이 면의 가장 가까운 축(±X·±Y)에서 기운 각(도) */
export function tiltOf(f: Frame): number {
  const a = (Math.atan2(f.ex[1], f.ex[0]) * 180) / Math.PI;
  const m = ((a % 90) + 90) % 90;
  return Math.min(m, 90 - m);
}
/** 원근 방향으로 맞추기: 기운 각이 limit(°) 안이면 가장 가까운 축으로 돌린다 (크게 기운 것은 의도로 보고 그대로) */
export function snapFrame(f: Frame, limit = 10): Frame {
  const t = tiltOf(f);
  if (t === 0 || t > limit) return f;
  const a = Math.atan2(f.ex[1], f.ex[0]);
  const target = Math.round(a / (Math.PI / 2)) * (Math.PI / 2);
  const d = target - a;
  return { ...f, ex: rot(f.ex, d), ey: rot(f.ey, d) };
}

// ---------- 3단계: 벽에서 돌려 세우기 (2026-10-15 사용자: "3단계도 진행해줘") ----------
// 한쪽 변(경첩)을 벽에 붙인 채 수직축으로 돌린다. 0° = 벽에 붙음, 90° = 벽에 직각(돌출 간판). 카메라(원근 설정)가 있어야 한다.
type V3 = [number, number, number];
export type Hinge = 'left' | 'right';
/** 돌린 사인물: hinge = 경첩 변의 아래 끝(벽 mm), up = 벽 위 방향, dir = 0° 일 때 사인물이 뻗는 벽 방향, w·h, deg, side = 경첩 쪽 */
export interface TurnFrame { hinge: Pt; up: Pt; dir: Pt; w: number; h: number; deg: number; side: Hinge }

/** 벽에서 카메라 쪽(나오는 방향)의 z 부호 */
export function outOfWall(plane: RefPlane): 1 | -1 {
  const p = plane.pose!;
  const depth = (z: number) => p.R[6] * 0 + p.R[7] * 0 + p.R[8] * z + p.t[2];
  return depth(1) < depth(0) ? 1 : -1;
}

/** 벽 위 틀 → 경첩 틀 (0°) */
export function turnFrameOf(f: Frame, side: Hinge): TurnFrame {
  const up = mul(f.ey, -1);
  const hinge = side === 'left' ? add(sub(f.c, mul(f.ex, f.w / 2)), mul(f.ey, f.h / 2)) : add(add(f.c, mul(f.ex, f.w / 2)), mul(f.ey, f.h / 2));
  return { hinge, up, dir: side === 'left' ? f.ex : mul(f.ex, -1), w: f.w, h: f.h, deg: 0, side };
}

function corners3(plane: RefPlane, tf: TurnFrame): { T0: V3; T1: V3; B0: V3; B1: V3 } {
  const n = outOfWall(plane);
  const r = (tf.deg * Math.PI) / 180;
  const F: V3 = [Math.cos(r) * tf.dir[0], Math.cos(r) * tf.dir[1], Math.sin(r) * n];
  const B0: V3 = [tf.hinge[0], tf.hinge[1], 0];
  const T0: V3 = [tf.hinge[0] + tf.up[0] * tf.h, tf.hinge[1] + tf.up[1] * tf.h, 0];
  const far = (p: V3): V3 => [p[0] + F[0] * tf.w, p[1] + F[1] * tf.w, p[2] + F[2] * tf.w];
  return { T0, T1: far(T0), B0, B1: far(B0) };
}

/** 돌린 사인물의 사진 외곽선 (TL,TR,BR,BL) */
export function turnedQuad(plane: RefPlane, tf: TurnFrame): Pt[] {
  const { T0, T1, B0, B1 } = corners3(plane, tf);
  const P = (p: V3) => projectPoint(plane.pose!, p);
  return tf.side === 'left' ? [P(T0), P(T1), P(B1), P(B0)] : [P(T1), P(T0), P(B0), P(B1)];
}

/** 사진 px → 카메라에서 나가는 반직선 (벽 좌표) */
function rayOf(pose: CameraPose, px: Pt): { o: V3; d: V3 } {
  const { R, t, f, imgW, imgH } = pose;
  const [cx, cy] = pose.pp ?? [imgW / 2, imgH / 2];
  const dc: V3 = [(px[0] - cx) / f, (px[1] - cy) / f, 1];
  const Rt = (v: V3): V3 => [R[0] * v[0] + R[3] * v[1] + R[6] * v[2], R[1] * v[0] + R[4] * v[1] + R[7] * v[2], R[2] * v[0] + R[5] * v[1] + R[8] * v[2]];
  const o = Rt(t);
  return { o: [-o[0], -o[1], -o[2]], d: Rt(dc) };
}
const d3 = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub3 = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross3 = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
/** 반직선과 평면(점 p, 법선 nrm)의 만나는 점 */
function hit(ray: { o: V3; d: V3 }, p: V3, nrm: V3): V3 | null {
  const den = d3(ray.d, nrm);
  if (Math.abs(den) < 1e-12) return null;
  const s = d3(sub3(p, ray.o), nrm) / den;
  return [ray.o[0] + ray.d[0] * s, ray.o[1] + ray.d[1] * s, ray.o[2] + ray.d[2] * s];
}

/** 돌린 외곽선에서 경첩 틀을 다시 읽는다: 경첩 변은 벽 위(면 투영), 먼 변은 돌린 면과 시선의 교점 */
export function readTurn(plane: RefPlane, quad: Pt[], turn: { deg: number; hinge: Hinge }): TurnFrame | null {
  if (!plane.pose) return null;
  const [top, bottom, farTop] = turn.hinge === 'left' ? [quad[0], quad[3], quad[1]] : [quad[1], quad[2], quad[0]];
  const B0 = applyHomography(plane.Hinv, bottom), T0 = applyHomography(plane.Hinv, top);
  const h = Math.hypot(T0[0] - B0[0], T0[1] - B0[1]);
  const up = unit(sub(T0, B0));
  const right: Pt = [up[1], -up[0]];
  const dir = turn.hinge === 'left' ? right : mul(right, -1);
  const n = outOfWall(plane);
  const r = (turn.deg * Math.PI) / 180;
  const F: V3 = [Math.cos(r) * dir[0], Math.cos(r) * dir[1], Math.sin(r) * n];
  const up3: V3 = [up[0], up[1], 0];
  const T03: V3 = [T0[0], T0[1], 0];
  const X = hit(rayOf(plane.pose, farTop), T03, cross3(up3, F));
  if (!X) return null;
  return { hinge: B0, up, dir, w: Math.max(10, d3(sub3(X, T03), F)), h, deg: turn.deg, side: turn.hinge };
}

/** 포인터(사진 px) → 돌린 각도(°, 0~90): 경첩 가운데 높이의 수평면에서 경첩 기준 방향 */
export function turnAngleAt(plane: RefPlane, tf: TurnFrame, px: Pt): number {
  if (!plane.pose) return tf.deg;
  const n = outOfWall(plane);
  const M: V3 = [tf.hinge[0] + tf.up[0] * tf.h / 2, tf.hinge[1] + tf.up[1] * tf.h / 2, 0];
  const X = hit(rayOf(plane.pose, px), M, [tf.up[0], tf.up[1], 0]);
  if (!X) return tf.deg;
  const v = sub3(X, M);
  const a = (Math.atan2(v[2] * n, d3(v, [tf.dir[0], tf.dir[1], 0])) * 180) / Math.PI;
  return Math.max(0, Math.min(90, a));
}

/** 돌린 사인물의 매니퓰레이터 점들: 경첩 가운데, 위, 벽 가로(경첩 이동), 돌리기 손잡이(먼 변 가운데) */
export function turnGizmoOf(plane: RefPlane, tf: TurnFrame, lengthMm?: number) {
  const { T0, T1, B0, B1 } = corners3(plane, tf);
  const P = (p: V3) => projectPoint(plane.pose!, p);
  const L = lengthMm ?? Math.max(tf.w, tf.h) * 0.35;
  const M: V3 = [(T0[0] + B0[0]) / 2, (T0[1] + B0[1]) / 2, 0];
  return {
    c: P(M),
    z: P([M[0] + tf.up[0] * L, M[1] + tf.up[1] * L, 0]),
    x: P([M[0] + tf.dir[0] * L * (tf.side === 'left' ? -1 : 1) * -1, M[1] + tf.dir[1] * L * (tf.side === 'left' ? -1 : 1) * -1, 0]),
    turn: P([(T1[0] + B1[0]) / 2, (T1[1] + B1[1]) / 2, (T1[2] + B1[2]) / 2]),
  };
}

/** 크기 모드: 왼쪽 아래 꼭짓점을 고정하고 to(면 mm)까지의 거리 비율로 가로·세로를 같이 (비율 유지) */
export function scaleFrame(f: Frame, to: Pt): Frame {
  const anchor = add(sub(f.c, mul(f.ex, f.w / 2)), mul(f.ey, f.h / 2));
  const corner = sub(add(f.c, mul(f.ex, f.w / 2)), mul(f.ey, f.h / 2));
  const k = Math.max(0.05, Math.hypot(to[0] - anchor[0], to[1] - anchor[1]) / (Math.hypot(corner[0] - anchor[0], corner[1] - anchor[1]) || 1));
  const w = f.w * k, h = f.h * k;
  return { ...f, w, h, c: sub(add(anchor, mul(f.ex, w / 2)), mul(f.ey, h / 2)) };
}

/** 돌려 세운 사인물의 면 좌표계 (3D): 원점 = 사인물 왼쪽 아래, e1 = 사인물 가로(왼→오), e2 = 위. 카메라를 이 면으로 옮긴 포즈와 함께 */
export function turnedPlane(plane: RefPlane, tf: TurnFrame): { origin: V3; e1: V3; e2: V3; pose: CameraPose } | null {
  if (!plane.pose) return null;
  const { T0: _t0, B0, B1 } = corners3(plane, tf);
  void _t0;
  const n = outOfWall(plane);
  const r = (tf.deg * Math.PI) / 180;
  const F: V3 = [Math.cos(r) * tf.dir[0], Math.cos(r) * tf.dir[1], Math.sin(r) * n];
  // 왼쪽 경첩: 경첩에서 먼 변으로가 사인물 가로. 오른쪽 경첩: 먼 변(왼쪽)에서 경첩으로
  const origin = tf.side === 'left' ? B0 : B1;
  const e1: V3 = tf.side === 'left' ? F : [-F[0], -F[1], -F[2]];
  const e2: V3 = [tf.up[0], tf.up[1], 0];
  const e3 = cross3(e1, e2);
  const { R, t } = plane.pose;
  const col = (v: V3): V3 => [R[0] * v[0] + R[1] * v[1] + R[2] * v[2], R[3] * v[0] + R[4] * v[1] + R[5] * v[2], R[6] * v[0] + R[7] * v[1] + R[8] * v[2]];
  const c1 = col(e1), c2 = col(e2), c3 = col(e3), o = col(origin);
  return { origin, e1, e2, pose: { ...plane.pose, R: [c1[0], c2[0], c3[0], c1[1], c2[1], c3[1], c1[2], c2[2], c3[2]], t: [o[0] + t[0], o[1] + t[1], o[2] + t[2]] } };
}

// ---------- 상자 가이드 (2026-10-15 사용자: "원근 문제 격자도 어렵다. 정육면체로 가이드를 줄 수 있나? 두께가 있는 것만 문제") ----------
/** P(3×4, 면 mm → 사진 px)로 면 위 네 꼭짓점과, 그것을 카메라 쪽으로 depth 만큼 밀어낸 네 점을 투영. 어느 점이 카메라 뒤면 null */
export function boxGuideOf(P: number[], base: Pt[], depth: number, dir?: [number, number, number]): { back: Pt[]; front: Pt[] } | null {
  const proj = (x: number, y: number, z: number): Pt | null => {
    const w = P[8] * x + P[9] * y + P[10] * z + P[11];
    if (!(w > 1e-9)) return null;
    return [(P[0] * x + P[1] * y + P[2] * z + P[3]) / w, (P[4] * x + P[5] * y + P[6] * z + P[7]) / w];
  };
  // 카메라 쪽 = 깊이(3행)가 줄어드는 z 방향
  const c = mul(add(add(base[0], base[1]), add(base[2], base[3])), 0.25);
  const dz = P[8] * c[0] + P[9] * c[1] + P[10] * depth + P[11] < P[8] * c[0] + P[9] * c[1] + P[11] ? depth : -depth;
  // 박스 방향(면 좌표, 2026-10-15 "박스만 회전"): 있으면 그 방향으로 깊이만큼, 없으면 면의 법선(카메라 쪽)
  const back = base.map(([x, y]) => proj(x, y, 0));
  const front = dir ? base.map(([x, y]) => proj(x + dir[0] * depth, y + dir[1] * depth, dir[2] * depth)) : base.map(([x, y]) => proj(x, y, dz));
  if (back.some((p) => !p) || front.some((p) => !p)) return null;
  return { back: back as Pt[], front: front as Pt[] };
}
