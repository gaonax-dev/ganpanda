// 박스 매니퓰레이터 (2026-10-15 사용자: "메니폴레이터는 원근의 값을 기준으로 작동해야한다", "사인물사각툴은 3d가 아니다. 그런척하는 거지
// 실제가 아니다. 여기에 따라다니는 박스만 3d이다", "박스만 회전하고 크기는 외곽선만").
// 축 = 원근 설정의 벽 좌표 (x 벽 가로, y 벽 밖(카메라 쪽), z 위). 외곽선은 사진 위 2D — 이동은 원근 축을 따라 외곽선을 옮기고,
// 회전은 박스 방향(상자가 외곽선에서 뻗는 방향)만 돌린다.
import { applyHomography, projectPoint, type CameraPose, type Pt } from './homography';
import { frameFrom, outSign, rayOf } from './faces';
import { quadCenter } from './manipulator';

export type V3 = [number, number, number];
export type Axis = 'x' | 'y' | 'z';
/** 면: 사진 px ↔ 면 mm 와 그 면 좌표의 카메라 (원근 설정의 벽면이면 그 카메라) */
export interface PosedPlane { H: number[]; Hinv: number[]; pose?: CameraPose }

const add = (a: V3, b: V3, k = 1): V3 => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a: V3): V3 => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const Rv = (R: number[], v: V3): V3 => [R[0] * v[0] + R[1] * v[1] + R[2] * v[2], R[3] * v[0] + R[4] * v[1] + R[5] * v[2], R[6] * v[0] + R[7] * v[1] + R[8] * v[2]];
const RTv = (R: number[], v: V3): V3 => [R[0] * v[0] + R[3] * v[1] + R[6] * v[2], R[1] * v[0] + R[4] * v[1] + R[7] * v[2], R[2] * v[0] + R[5] * v[1] + R[8] * v[2]];

/** 매니퓰레이터 축의 벽 좌표 방향 (y = 벽 밖, 카메라 쪽) */
export function worldAxes(pose: CameraPose): Record<Axis, V3> {
  return { x: [1, 0, 0], y: [0, 0, outSign(pose)], z: [0, 1, 0] };
}
/** 면 좌표(mm, z=0) → 벽 좌표 */
function toWorld(pose: CameraPose, plane: PosedPlane, p: Pt): V3 {
  const pp = plane.pose ?? pose;
  const cam = add(Rv(pp.R, [p[0], p[1], 0]), pp.t as V3);
  return RTv(pose.R, sub(cam, pose.t as V3));
}
/** 외곽선 꼭짓점의 3D 자리 (사인물 면 위) */
export function outlinePoints3(cal: PosedPlane & { pose?: CameraPose }, face: PosedPlane, quad: Pt[]): V3[] | null {
  if (!cal.pose) return null;
  return quad.map((q) => toWorld(cal.pose!, face, applyHomography(face.Hinv, q)));
}
/** 매니퓰레이터 중심(3D): 외곽선 대각선 교점의 시선이 사인물 면과 만나는 점 */
export function outlineCenter3(cal: PosedPlane, face: PosedPlane, quad: Pt[]): V3 | null {
  if (!cal.pose) return null;
  return toWorld(cal.pose, face, applyHomography(face.Hinv, quadCenter(quad)));
}

/**
 * 매니퓰레이터 자리와 외곽선을 읽을 면 (2026-10-15 사용자: "메니폴레이터가 나타나지 않는 사인물이 있다. 핀볼에서 확인해줘").
 * 외곽선의 시선이 사인물 면(어느 면도 아니면 원근 설정의 기준 면)과 카메라 앞에서 만나면 그 면. 기준 면이 바닥(축 X·Y)이고 사인물이
 * 그 지평선 위에 있으면 시선이 카메라 뒤에서 만나 자리가 없었다 → 그때는 원점과 같은 깊이에서 카메라를 보는 면(대각선 교점을 지남).
 * 축 방향은 깊이와 무관하게 원근대로이고, 옮기기도 그 면의 3D 자리에서 원근대로 된다
 */
export function anchorOf(cal: PosedPlane, face: PosedPlane, quad: Pt[]): { c3: V3; plane: PosedPlane } | null {
  const pose = cal.pose;
  if (!pose) return null;
  const pts = quad.map((q) => toWorld(pose, face, applyHomography(face.Hinv, q)));
  const c3 = toWorld(pose, face, applyHomography(face.Hinv, quadCenter(quad)));
  if (depthOf(pose, c3) > 0 && pts.every((p) => depthOf(pose, p) > 0)) return { c3, plane: face };
  const D = Math.max(1000, depthOf(pose, [0, 0, 0]));
  const { f, imgW, imgH } = pose, [cx, cy] = pose.pp ?? [imgW / 2, imgH / 2], q = quadCenter(quad);
  const cam: V3 = [((q[0] - cx) / f) * D, ((q[1] - cy) / f) * D, D];
  const at = RTv(pose.R, sub(cam, pose.t as V3));
  const e1 = RTv(pose.R, [1, 0, 0]), e2 = RTv(pose.R, [0, -1, 0]);
  const fr = frameFrom(pose, at, e1, e2, 1000, 1000);
  return { c3: at, plane: { H: fr.H, Hinv: fr.Hinv, pose: fr.pose } };
}

/** 직선(c + dir·t) 위에서 반직선과 가장 가까운 점의 t */
function lineParam(pose: CameraPose, c: V3, dir: V3, px: Pt): number {
  const r = rayOf(pose, px);
  const w0 = sub(c, r.o as V3), b = dot(dir, r.d as V3), cc = dot(r.d as V3, r.d as V3), dd = dot(dir, w0), e = dot(r.d as V3, w0);
  const den = dot(dir, dir) * cc - b * b;
  return Math.abs(den) < 1e-12 ? 0 : (b * e - cc * dd) / den;
}
const depthOf = (pose: CameraPose, p: V3) => pose.R[6] * p[0] + pose.R[7] * p[1] + pose.R[8] * p[2] + pose.t[2];

/** 화살표 끌기: 외곽선을 원근 축(axis)을 따라 옮긴다 — 3D 로 옮긴 꼭짓점을 다시 사진에 (멀어지면 작아짐). 카메라 뒤로 가면 null */
export function moveOutline(pose: CameraPose, face: PosedPlane, quad: Pt[], axis: V3, from: Pt, to: Pt): Pt[] | null {
  const pts = quad.map((q) => toWorld(pose, face, applyHomography(face.Hinv, q)));
  const c = toWorld(pose, face, applyHomography(face.Hinv, quadCenter(quad)));
  const t = lineParam(pose, c, axis, to) - lineParam(pose, c, axis, from);
  const moved = pts.map((p) => add(p, axis, t));
  return moved.every((p) => depthOf(pose, p) > 0) ? moved.map((p) => projectPoint(pose, p)) : null;
}

/** v 를 단위축 k 둘레로 th 만큼 (로드리게스) */
function rot(v: V3, k: V3, th: number): V3 {
  const c = Math.cos(th), s = Math.sin(th), kv = cross(k, v), d = dot(k, v);
  return [v[0] * c + kv[0] * s + k[0] * d * (1 - c), v[1] * c + kv[1] * s + k[1] * d * (1 - c), v[2] * c + kv[2] * s + k[2] * d * (1 - c)];
}
function hitPlane(pose: CameraPose, px: Pt, at: V3, nrm: V3): V3 | null {
  const r = rayOf(pose, px);
  const den = dot(r.d as V3, nrm);
  if (Math.abs(den) < 1e-12) return null;
  const s = dot(sub(at, r.o as V3), nrm) / den;
  return s > 0 ? add(r.o as V3, r.d as V3, s) : null;
}
/**
 * 고리 끌기: 박스 방향 d 를 중심 c 를 지나는 축 둘레로 from → to 만큼 돌린다 (외곽선은 그대로).
 * 고리를 옆에서 봐 선으로 보이면 화면에서 잰 각. 결과가 원근 축에서 2° 안이면 그 축에 붙인다
 */
export function rotateDir(pose: CameraPose, c: V3, d: V3, axis: V3, from: Pt, to: Pt): V3 {
  const k = unit(axis);
  const camK = Rv(pose.R, k), camC = add(Rv(pose.R, c), pose.t as V3);
  const edgeOn = Math.abs(dot(unit(camC), camK)) < 0.05;
  const a = edgeOn ? null : hitPlane(pose, from, c, k), b = edgeOn ? null : hitPlane(pose, to, c, k);
  let th: number;
  if (a && b) { const va = sub(a, c), vb = sub(b, c); th = Math.atan2(dot(cross(va, vb), k), dot(va, vb)); }
  else {
    const cp = projectPoint(pose, c), u = [from[0] - cp[0], from[1] - cp[1]], v = [to[0] - cp[0], to[1] - cp[1]];
    th = Math.atan2(u[0] * v[1] - u[1] * v[0], u[0] * v[0] + u[1] * v[1]) * (camK[2] > 0 ? 1 : -1);
  }
  let r = unit(rot(d, k, th));
  for (const ax of Object.values(worldAxes(pose))) for (const s of [1, -1]) {
    const e: V3 = [ax[0] * s, ax[1] * s, ax[2] * s];
    if (dot(r, e) > Math.cos((2 * Math.PI) / 180)) r = e;
  }
  return r;
}
/** 박스 방향을 카메라 쪽으로: at(벽 좌표)에서 카메라를 향하는 쪽. at 이 없으면 깊이가 줄어드는 쪽 */
export function towardCamera(pose: CameraPose, d: V3, at?: V3): V3 {
  const dc = Rv(pose.R, d);
  const away = at ? dot(dc, add(Rv(pose.R, at), pose.t as V3)) > 0 : dc[2] > 0;
  return away ? [-d[0], -d[1], -d[2]] : d;
}
/** 벽 좌표의 박스 방향 → 사인물 면 좌표(3D·상자 가이드가 쓰는 값). 면 좌표의 z 는 면의 법선 */
export function localBoxDir(face: PosedPlane, pose: CameraPose, d: V3, at?: V3): V3 {
  const pp = face.pose ?? pose;
  return unit(RTv(pp.R, Rv(pose.R, towardCamera(pose, d, at))));
}
/** 박스 방향이 가장 가까운 원근 축 (2° 안일 때만, 아니면 null) */
export function axisOfDir(pose: CameraPose, d: V3): Axis | null {
  const A = worldAxes(pose);
  for (const k of ['x', 'y', 'z'] as const) if (Math.abs(dot(unit(d), A[k])) > Math.cos((2 * Math.PI) / 180)) return k;
  return null;
}

/** 매니퓰레이터 그리기용 사진 px: 화살표(중심→끝) 3, 고리 3(+손잡이), 평면 판 3 (판 이름 = 법선 = 고르면 박스 방향이 되는 축) */
export function boxGizmoOf(pose: CameraPose, c: V3, L: number) {
  if (depthOf(pose, c) <= 0) return null;
  const A = worldAxes(pose), P = (q: V3) => projectPoint(pose, q);
  const others: Record<Axis, [V3, V3]> = { x: [A.y, A.z], y: [A.x, A.z], z: [A.x, A.y] };
  const R = L * 0.8, a0 = L * 0.3, a1 = L * 0.6;
  const ring = (k: Axis) => Array.from({ length: 49 }, (_, i) => { const t = (i / 48) * Math.PI * 2; return P(add(add(c, others[k][0], Math.cos(t) * R), others[k][1], Math.sin(t) * R)); });
  const ringAt = (k: Axis) => P(add(add(c, others[k][0], Math.cos(Math.PI / 4) * R), others[k][1], Math.sin(Math.PI / 4) * R));
  const plate = (k: Axis) => [[a0, a0], [a1, a0], [a1, a1], [a0, a1]].map(([s, t]) => P(add(add(c, others[k][0], s), others[k][1], t)));
  return {
    c: P(c),
    arrows: { x: [P(c), P(add(c, A.x, L))], y: [P(c), P(add(c, A.y, L))], z: [P(c), P(add(c, A.z, L))] } as Record<Axis, [Pt, Pt]>,
    rings: { x: ring('x'), y: ring('y'), z: ring('z') } as Record<Axis, Pt[]>,
    ringHandles: { x: ringAt('x'), y: ringAt('y'), z: ringAt('z') } as Record<Axis, Pt>,
    planes: { x: plate('x'), y: plate('y'), z: plate('z') } as Record<Axis, Pt[]>,
  };
}
