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
export function gizmoOf(plane: RefPlane, f: Frame) {
  const L = Math.max(f.w, f.h) * 0.35;
  const P = (p: Pt) => applyHomography(plane.H, p);
  const R = L * 0.8;
  const ring = Array.from({ length: 33 }, (_, i) => { const t = (i / 32) * Math.PI * 2; return P(add(f.c, add(mul(f.ex, Math.cos(t) * R), mul(f.ey, -Math.sin(t) * R)))); });
  const ringHandleWall = add(f.c, add(mul(f.ex, Math.cos(Math.PI / 4) * R), mul(f.ey, -Math.sin(Math.PI / 4) * R)));
  let y: Pt | undefined;
  if (plane.pose) {
    // 벽에서 나오는 방향 = 카메라 쪽(깊이가 줄어드는 쪽)
    const { R: Rm, t } = plane.pose;
    const depth = (z: number) => Rm[6] * f.c[0] + Rm[7] * f.c[1] + Rm[8] * z + t[2];
    const z = depth(L) < depth(-L) ? L : -L;
    if (depth(z) > 0) y = projectPoint(plane.pose, [f.c[0], f.c[1], z]);
  }
  return {
    lengthMm: L,
    c: P(f.c), x: P(add(f.c, mul(f.ex, L))), z: P(sub(f.c, mul(f.ey, L))), y,
    ring, ringHandle: P(ringHandleWall), ringHandleWall,
    right: P(add(f.c, mul(f.ex, f.w / 2))), top: P(sub(f.c, mul(f.ey, f.h / 2))),
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
