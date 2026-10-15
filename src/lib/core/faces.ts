// 세 면 구조 (2026-10-15 사용자: "오직 한쪽면만 기준으로 잡고 있다. 삼면을 구현하지 못한건가?" → "삼면 구조로 진행해줘").
// 원근 설정(카메라)의 벽 좌표: x = 벽 가로, y = 높이, 벽 밖 = z·n. 사인물 정면 축(매니퓰레이터 축 이름):
//   y = 벽 밖을 봄 → 벽면 그대로 / x = 벽을 따라 봄 → 벽에 직각인 세로면 (x = c) / z = 위·아래를 봄 → 수평면 (높이 = c)
// 면의 자리 c 는 외곽선에서 **벽에 닿는 변**으로 정한다: 각 꼭짓점의 시선이 벽과 만나는 점의 그 축 값 중, 그 면에 놓았을 때
// 나머지 꼭짓점이 모두 벽 앞(벽 밖)에 오는 값. 그다음 네 꼭짓점의 시선이 그 면과 만나는 점 = 사인물의 실제 자리.
import { applyHomography, projectPoint, solveHomography, type CameraPose, type Pt } from './homography';

type V3 = [number, number, number];
export type FaceAxis = 'x' | 'y' | 'z';
/** 면 계산에 필요한 것: 벽면 호모그래피(사진 px → 벽 mm)와 카메라 */
export interface FaceRef { H: number[]; Hinv: number[]; pose?: CameraPose }
export interface FaceFrame {
  /** 면 좌표(mm, 왼쪽 아래 원점, 가로 → 오른쪽, 세로 → 위) → 사진 px, 그 역 */
  H: number[]; Hinv: number[];
  /** 면 좌표계로 옮긴 카메라 (3D 는 이 포즈로 그린다) */
  pose: CameraPose;
  /**
   * 이 면의 사인물로 보기 어려운 정도: 외곽선을 면 위 바른 직사각형(가로·세로가 면의 축)으로 펴서 사진에 다시 그렸을 때
   * 꼭짓점이 벗어난 평균 거리 ÷ 외곽선 대각선. 각도 대신 사진 px 로 재서 비스듬히(가늘게) 보이는 면에서도 손 떨림에 흔들리지 않는다
   */
  err: number;
}

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/** 벽에서 카메라 쪽(밖)의 z 부호 */
export function outSign(pose: CameraPose): 1 | -1 {
  return pose.R[8] * 1 + pose.t[2] < pose.t[2] ? 1 : -1;
}
/** 사진 px → 카메라에서 나가는 반직선 (벽 좌표) */
function rayOf(pose: CameraPose, px: Pt): { o: V3; d: V3 } {
  const { R, t, f, imgW, imgH } = pose;
  const [cx, cy] = pose.pp ?? [imgW / 2, imgH / 2];
  const dc: V3 = [(px[0] - cx) / f, (px[1] - cy) / f, 1];
  const Rt = (v: V3): V3 => [R[0] * v[0] + R[3] * v[1] + R[6] * v[2], R[1] * v[0] + R[4] * v[1] + R[7] * v[2], R[2] * v[0] + R[5] * v[1] + R[8] * v[2]];
  const o = Rt(t as V3);
  return { o: [-o[0], -o[1], -o[2]], d: Rt(dc) };
}

/** 벽 좌표의 3D 면(원점 O, 가로 e1, 세로 e2) → 면 좌표 카메라·호모그래피 */
function frameFrom(pose: CameraPose, O: V3, e1: V3, e2: V3, w: number, h: number): { H: number[]; Hinv: number[]; pose: CameraPose } {
  const e3 = cross(e1, e2);
  const { R, t } = pose;
  const col = (v: V3): V3 => [R[0] * v[0] + R[1] * v[1] + R[2] * v[2], R[3] * v[0] + R[4] * v[1] + R[5] * v[2], R[6] * v[0] + R[7] * v[1] + R[8] * v[2]];
  const c1 = col(e1), c2 = col(e2), c3 = col(e3), o = col(O);
  const p: CameraPose = { ...pose, R: [c1[0], c2[0], c3[0], c1[1], c2[1], c3[1], c1[2], c2[2], c3[2]], t: [o[0] + t[0], o[1] + t[1], o[2] + t[2]] };
  const rect: Pt[] = [[0, h], [w, h], [w, 0], [0, 0]];
  const img = rect.map(([x, y]) => projectPoint(p, [x, y, 0]));
  return { H: solveHomography(rect, img), Hinv: solveHomography(img, rect), pose: p };
}

/**
 * 외곽선(사진 TL,TR,BR,BL)을 x(벽에 직각인 세로면) 또는 z(수평면) 면에 놓는다. 그 면의 사진일 수 없으면 null
 * (예: 정면으로 그린 벽면 직사각형은 벽에 직각인 면의 사진일 수 없다 — 시선이 그 면과 벽 앞에서 만나지 않는다)
 */
export function faceFrameOf(ref: FaceRef, quad: Pt[], axis: 'x' | 'z'): FaceFrame | null {
  const pose = ref.pose;
  if (!pose) return null;
  const k = axis === 'x' ? 0 : 1;
  const n = outSign(pose);
  const rays = quad.map((p) => rayOf(pose, p));
  const onWall = quad.map((p) => applyHomography(ref.Hinv, p));
  let best: { pts: V3[]; minOut: number } | null = null;
  for (const c of onWall.map((p) => p[k])) {
    const pts: V3[] = [];
    let ok = true;
    for (const r of rays) {
      if (Math.abs(r.d[k]) < 1e-12) { ok = false; break; }
      const s = (c - r.o[k]) / r.d[k];
      if (!(s > 0)) { ok = false; break; }
      pts.push(add(r.o, mul(r.d, s)));
    }
    if (!ok) continue;
    const outs = pts.map((p) => p[2] * n);
    const minOut = Math.min(...outs), maxOut = Math.max(...outs);
    // 나머지 꼭짓점이 벽 뒤로 가면 안 된다 (손 떨림만큼은 봐줌), 벽에서 실제로 나와 있어야 한다
    if (maxOut <= 1 || minOut < -0.15 * maxOut) continue;
    if (!best || minOut > best.minOut) best = { pts, minOut };
  }
  if (!best) return null;
  // 면 안의 두 축: 벽 밖(out)과, x 면이면 높이 / z 면이면 벽 가로. 외곽선의 가로(TL→TR)에 더 가까운 것이 사인물 가로, 다른 것이 세로(BL→TL 쪽이 +).
  // 사진의 오른쪽이 아니라 외곽선 순서를 따른다 — 돌려 세운 사인물은 경첩 쪽이 TL 이라 사진에서 거울상일 수 있다(그때 3D 는 뒤집어 그림)
  const out: V3 = [0, 0, n], other: V3 = axis === 'x' ? [0, 1, 0] : [1, 0, 0];
  const C = mul(best.pts.reduce((a, p) => add(a, p), [0, 0, 0] as V3), 0.25);
  const [tl, tr, br, bl] = best.pts;
  const across = add(sub(tr, tl), sub(br, bl)), upward = add(sub(tl, bl), sub(tr, br));
  const outIsAcross = Math.abs(dot(across, out)) >= Math.abs(dot(across, other));
  let e1 = outIsAcross ? out : other, e2 = outIsAcross ? other : out;
  if (dot(across, e1) < 0) e1 = mul(e1, -1);
  if (dot(upward, e2) < 0) e2 = mul(e2, -1);
  const q2: Pt[] = best.pts.map((p) => [dot(sub(p, C), e1), dot(sub(p, C), e2)]);
  const minX = Math.min(...q2.map((p) => p[0])), minY = Math.min(...q2.map((p) => p[1]));
  const w = Math.max(1, Math.max(...q2.map((p) => p[0])) - minX), h = Math.max(1, Math.max(...q2.map((p) => p[1])) - minY);
  const O = add(C, add(mul(e1, minX), mul(e2, minY)));
  const fr = frameFrom(pose, O, e1, e2, w, h);
  // 바른 직사각형: 왼쪽 = TL·BL 평균, 오른쪽 = TR·BR, 위 = TL·TR, 아래 = BL·BR (면 좌표, 가로 → 오른쪽, 세로 → 위)
  const z = q2.map(([x, y]) => [x - minX, y - minY] as Pt);
  const l = (z[0][0] + z[3][0]) / 2, r = (z[1][0] + z[2][0]) / 2, top = (z[0][1] + z[1][1]) / 2, bot = (z[3][1] + z[2][1]) / 2;
  const diag = Math.hypot(quad[0][0] - quad[2][0], quad[0][1] - quad[2][1]) || 1;
  const rect: Pt[] = [[l, top], [r, top], [r, bot], [l, bot]].map((p) => applyHomography(fr.H, p as Pt));
  const err = r <= l || top <= bot ? Infinity : rect.reduce((a, p, i) => a + Math.hypot(p[0] - quad[i][0], p[1] - quad[i][1]), 0) / 4 / diag;
  return { ...fr, err };
}
