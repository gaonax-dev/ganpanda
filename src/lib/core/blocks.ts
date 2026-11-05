// 치수 블록 (2026-11-03 사용자: "같은 크기 사각형으로 나머지 사인물 대략 크기를 정확도 높게 … 모서리 대각으로 같은크기 블록을 넣는거야",
// "일반 사인물처럼 네모를 그리면 설정이 하나인 사각이 두개가 되고", "치수블록은 핫핑크라인으로", "길이블록으로 정확도가 향상된면 보라색으로"):
// 치수를 넣은 사인물에 **같은 크기**의 사각(블록)을 더 그린다 — 설정(치수)은 하나, 사각은 여러 개. 블록은 견적에 들어가지 않는다.
// 블록의 변은 그 사인물의 변과 함께 원근 풀이의 축 선이 되어(camera.ts extra) 소실점이 건물 전체로 퍼진 선들로 정해지고,
// 멀리(2층) 있는 영역의 추정 외삽 오차가 줄어든다. 지금 원근으로 잰 블록 크기가 사인물 치수와 맞으면(허용 오차 안) "정확도 향상" = 보라.
import { applyHomography, type Pt } from './homography';
import type { CameraSolution, Line } from './camera';

/** 블록 선 색 — 형광 초록 (2026-11-04 "형광색으로 블록을 변경해주고"; 처음엔 핫핑크) */
export const BLOCK_COLOR = '#39ff14';
/** 정확도를 올린(사인물 치수와 맞는) 블록 — 보라 */
export const BLOCK_FIT_COLOR = '#a855f7';
/** 맞음 판정 허용 오차 (가로·세로 각각) */
export const BLOCK_FIT_TOL = 0.1;

/** 블록의 임시 id (판독 결과 키, 조작 손잡이의 가짜 사인물 id): `<사인물 id>#b<번호>` */
export const blockIdOf = (id: string, i: number) => `${id}#b${i}`;
export function parseBlockId(id: string | null | undefined): { id: string; i: number } | null {
  const m = id ? /^(.+)#b(\d+)$/.exec(id) : null;
  return m ? { id: m[1], i: Number(m[2]) } : null;
}

/**
 * 블록 축 (2026-11-04 "블록은 여러 축에 사용되고"): 블록이 놓인 면 — y 벽면, x 벽에 직각인 세로면(옆면), z 수평면. 사인물의 정면 축(faceAxis)과 같은 이름.
 * 없으면 자동(외곽선으로 면 판정, wallPlane.faceOf)
 */
export type BlockAxis = 'x' | 'y' | 'z';
export interface SizeBlock { q: Pt[]; axis?: BlockAxis }
/**
 * 사진의 치수 블록 (2026-11-04 사용자: "블록 치수는 사용자가 입력한 값을 사용하고 추정치는 여기에 없다. 블록은 입력한 값만 나오고 여러 값과 방향을 지원한다.
 * 블록이 있으면 사인물들의 예상 크기는 블록이 기준이 된다"): 외곽선 q(사진 px, TL,TR,BR,BL) + 입력한 가로·세로(mm, 없으면 아직 입력 전) + 축(면).
 * 사인물과 따로 사진(Photo.blocks)에 둔다 — 블록마다 크기·방향이 다르다
 */
export interface PhotoBlock { q: Pt[]; w?: number; h?: number; axis?: BlockAxis }
/** 사진의 블록 목록 = Photo.blocks + 옛 데이터(2026-11-03~04 사인물에 붙인 블록 — 그 사인물의 치수로). 편집하면 이 목록 그대로 Photo.blocks 로 옮겨 쓴다 */
export function photoBlocksOf(
  photo: { id: string; blocks?: PhotoBlock[] },
  signs: { photoId: string; widthMm?: number; heightMm?: number; blocks?: Pt[][]; blockAxes?: (BlockAxis | null)[] }[],
): PhotoBlock[] {
  const legacy = signs.filter((o) => o.photoId === photo.id && o.blocks?.length).flatMap((o) => asBlocks(o.blocks, o.blockAxes).map((b): PhotoBlock => ({ q: b.q, w: o.widthMm, h: o.heightMm, axis: b.axis })));
  return [...(photo.blocks ?? []).map((b) => ({ ...b })), ...legacy];
}
/** 치수(길이) 있는 블록 — 가로·세로 중 하나만 있어도 길이를 제시한다 (2026-11-04 "블록은 길이만 제시한다") */
export const isSized = (b: PhotoBlock): boolean => !!((b.w && b.w > 0) || (b.h && b.h > 0));
/** 사인물의 blocks(사각)·blockAxes(축)를 묶어 읽는다 */
export function asBlocks(blocks: Pt[][] | undefined, axes: (BlockAxis | null)[] | undefined): SizeBlock[] {
  return (blocks ?? []).map((q, i) => ({ q, axis: axes?.[i] ?? undefined }));
}
const toBlock = (b: Pt[] | SizeBlock): SizeBlock => (Array.isArray(b) ? { q: b } : b);

/**
 * 블록들의 변 → 원근 풀이의 축 선: 가로(X) 축 선 x, 높이(Z) 축 선 y.
 * 벽면(y)·자동 블록은 위·아래 변 = X, 좌·우 변 = Z. 옆면(x) 블록은 좌·우 변(수직)만 Z — 위·아래 변은 깊이 방향. 수평(z) 블록은 넣지 않는다
 */
export function blockLines(blocks: (Pt[] | SizeBlock)[]): { x: Line[]; y: Line[] } {
  const x: Line[] = [], y: Line[] = [];
  for (const raw of blocks) {
    const { q: b, axis } = toBlock(raw);
    if (b.length !== 4 || axis === 'z') continue;
    const [tl, tr, br, bl] = b;
    if (axis !== 'x') x.push({ a: tl, b: tr }, { a: bl, b: br });
    y.push({ a: bl, b: tl }, { a: br, b: tr });
  }
  return { x, y };
}

/** 지금 원근으로 잰 블록 크기가 사인물 치수와 허용 오차 안인가 (가로·세로 모두) */
export function blockFits(est: { widthMm: number; heightMm: number } | undefined, size: { w: number; h: number }, tol = BLOCK_FIT_TOL): boolean {
  if (!est || !(size.w > 0) || !(size.h > 0)) return false;
  return Math.abs(est.widthMm / size.w - 1) <= tol && Math.abs(est.heightMm / size.h - 1) <= tol;
}

/** 그리기 시작점이 꼭짓점 가까이(반경 r 안)면 가장 가까운 꼭짓점 — 모서리를 맞대고 대각으로 이어 가기 */
export function snapStart(p: Pt, corners: Pt[], r: number): { corner: Pt; index: number } | null {
  let best: { corner: Pt; index: number } | null = null, bestD = r;
  corners.forEach((c, index) => {
    const d = Math.hypot(c[0] - p[0], c[1] - p[1]);
    if (d <= bestD) { bestD = d; best = { corner: c, index }; }
  });
  return best;
}

/**
 * 대각 예측: 기준 사각(사인물 또는 블록)의 꼭짓점 cornerIndex 에서 end 쪽으로 끌어 놓으면, 벽 위에서 그 꼭짓점에 모서리를 맞댄 **같은 크기** 블록을
 * 끌어간 방향(가로 ±, 세로 ±)으로 놓고 사진에 투영한다. 크기는 기준 사각을 벽에 폈을 때의 가로·세로 폭. 사진 순서 TL,TR,BR,BL
 */
export function predictBlock(sol: CameraSolution, base: Pt[], cornerIndex: number, end: Pt): Pt[] | null {
  if (base.length !== 4) return null;
  const W = base.map((p) => applyHomography(sol.Hinv, p));
  if (W.some((p) => !isFinite(p[0]) || !isFinite(p[1]))) return null;
  const us = W.map((p) => p[0]), vs = W.map((p) => p[1]);
  const w = Math.max(...us) - Math.min(...us), h = Math.max(...vs) - Math.min(...vs);
  if (!(w > 0) || !(h > 0)) return null;
  const c = W[cornerIndex], e = applyHomography(sol.Hinv, end);
  const du = Math.sign(e[0] - c[0]) || 1, dv = Math.sign(e[1] - c[1]) || 1;
  const u0 = Math.min(c[0], c[0] + du * w), u1 = Math.max(c[0], c[0] + du * w);
  const v0 = Math.min(c[1], c[1] + dv * h), v1 = Math.max(c[1], c[1] + dv * h);
  const img = ([[u0, v1], [u1, v1], [u1, v0], [u0, v0]] as Pt[]).map((p) => applyHomography(sol.H, p));
  if (img.some((p) => !isFinite(p[0]) || !isFinite(p[1]))) return null;
  // 사진 순서로: 위 두 점(작은 y) 왼→오 = TL,TR, 아래 두 점 왼→오 = BL,BR
  const byY = [...img].sort((a, b) => a[1] - b[1]);
  const top = byY.slice(0, 2).sort((a, b) => a[0] - b[0]), bottom = byY.slice(2).sort((a, b) => a[0] - b[0]);
  return [top[0], top[1], bottom[1], bottom[0]];
}

/** 원근 면(사진 px ↔ 면 좌표 mm) */
export interface BlockPlane { H: number[]; Hinv: number[] }
const proj = (H: number[], p: Pt) => applyHomography(H, p);
/** 블록 네 변의 면 좌표 (꼭짓점 평균): 왼쪽 변 u·오른쪽 변 u·위 변 v·아래 변 v — 꼭짓점 자리(왼쪽 위·오른쪽 위·오른쪽 아래·왼쪽 아래)를 그대로 따른다 */
function blockSides(pl: BlockPlane, q: Pt[]): { uL: number; uR: number; vT: number; vB: number } | null {
  if (q.length !== 4) return null;
  const [tl, tr, br, bl] = q.map((p) => proj(pl.Hinv, p));
  if ([tl, tr, br, bl].some((p) => !isFinite(p[0]) || !isFinite(p[1]))) return null;
  return { uL: (tl[0] + bl[0]) / 2, uR: (tr[0] + br[0]) / 2, vT: (tl[1] + tr[1]) / 2, vB: (bl[1] + br[1]) / 2 };
}
/** 블록의 면 좌표 사각 (작은 값·큰 값) */
function blockRect(pl: BlockPlane, q: Pt[]): { u0: number; u1: number; v0: number; v1: number } | null {
  const s = blockSides(pl, q);
  if (!s) return null;
  const u0 = Math.min(s.uL, s.uR), u1 = Math.max(s.uL, s.uR), v0 = Math.min(s.vT, s.vB), v1 = Math.max(s.vT, s.vB);
  return u1 - u0 > 0 && v1 - v0 > 0 ? { u0, u1, v0, v1 } : null;
}
/** 볼록한 사각형인가 (꼭짓점 순서대로 같은 방향으로 꺾임) */
function isConvexQuad(q: Pt[]): boolean {
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const a = q[i], b = q[(i + 1) % 4], c = q[(i + 2) % 4];
    const z = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
    if (!isFinite(z) || Math.abs(z) < 1e-9) return false;
    if (sign && Math.sign(z) !== sign) return false;
    sign = Math.sign(z);
  }
  return true;
}
/**
 * 블록은 원근을 따른다 (2026-11-04 "블록은 원근의 구도를 따른다"): 손으로 그린 네모를 그 축 면의 직사각형으로 맞춘다 — 각 꼭짓점은 제 자리(왼쪽 위는 왼쪽 위)를 지킨다
 * (같은 날 "블록이 클릭하면 갑자기 사라진다": 사진 위 높이로 꼭짓점을 다시 정하던 방식이 원근이 강한 곳에서 꼭짓점을 뒤섞었고, 클릭 = 아주 작은 끌기 = 다시 맞추기에서 한 점으로 접혔다).
 * 맞춘 결과가 볼록한 사각형이 아니면(지평선 너머 등) null — 호출자는 그린 그대로 둔다
 */
/** 원근에 맞출 때 꼭짓점이 움직일 수 있는 한도 (대각선 대비) — 넘으면 그 면이 그 자리에 맞지 않는 것으로 보고 그린 그대로 */
export const ALIGN_MAX_SHIFT = 0.35;
export function alignBlock(pl: BlockPlane, q: Pt[]): Pt[] | null {
  const s = blockSides(pl, q);
  if (!s || Math.abs(s.uR - s.uL) < 1e-6 || Math.abs(s.vT - s.vB) < 1e-6) return null;
  const out = ([[s.uL, s.vT], [s.uR, s.vT], [s.uR, s.vB], [s.uL, s.vB]] as Pt[]).map((p) => proj(pl.H, p));
  if (out.some((p) => !isFinite(p[0]) || !isFinite(p[1])) || !isConvexQuad(out)) return null;
  // 그린 모양과 너무 다르면(이 면이 그 자리에 맞지 않음) 맞추지 않는다: 꼭짓점이 대각선의 35% 넘게 움직이면 그대로
  const diag = Math.max(Math.hypot(q[2][0] - q[0][0], q[2][1] - q[0][1]), Math.hypot(q[3][0] - q[1][0], q[3][1] - q[1][1]));
  if (out.some((p, i) => Math.hypot(p[0] - q[i][0], p[1] - q[i][1]) > ALIGN_MAX_SHIFT * diag)) return null;
  // 변 방향이 ALIGN_MAX_TURN 넘게 돌면 맞추지 않는다 (2026-11-05 안전장치: 원근이 그 자리와 안 맞으면 블록이 크게 돌아가 버렸다)
  for (let i = 0; i < 4; i++) {
    const a = q[i], b = q[(i + 1) % 4], c = out[i], d = out[(i + 1) % 4];
    let t = Math.abs(Math.atan2(d[1] - c[1], d[0] - c[0]) - Math.atan2(b[1] - a[1], b[0] - a[0]));
    if (t > Math.PI) t = 2 * Math.PI - t;
    if ((t * 180) / Math.PI > ALIGN_MAX_TURN) return null;
  }
  return out;
}
/** 원근에 맞출 때 블록 변이 돌 수 있는 한도 (°) — 넘으면 그린 그대로 (2026-11-05 사용자: "두 가지 안전장치 모두 적용해줘") */
export const ALIGN_MAX_TURN = 30;
/** 원근과 안 맞음 판정 허용치 — 입력한 가로÷세로와 원근으로 펼친 가로÷세로가 이 비율(30%) 넘게 다르면 */
export const BLOCK_MISMATCH_TOL = 0.3;
/**
 * 블록이 지금 원근과 안 맞는가 (2026-11-05 안전장치): 가로·세로를 모두 넣은 블록만 — 펼친 비율(raw)과 입력 비율이 30% 넘게 다르면
 * 원근이 그 자리와 맞지 않거나 치수를 바꿔 넣은 것. 이런 블록은 치수 추정의 기준에서 빠지고(measureByBlocks), 화면에 "원근과 안 맞음"
 */
export function blockMismatch(raw: { widthMm: number; heightMm: number } | null | undefined, w: number | undefined, h: number | undefined, tol = BLOCK_MISMATCH_TOL): boolean {
  if (!raw || !(raw.widthMm > 0) || !(raw.heightMm > 0) || !(w && w > 0) || !(h && h > 0)) return false;
  return Math.abs(Math.log((w / h) / (raw.widthMm / raw.heightMm))) > Math.log(1 + tol);
}
/**
 * 블록 길이 그리드 (2026-11-04 "이 길이를 해당 축에 그리드로 넣고 이걸로 사인물 길이를 추론한다" → "블록이 여러게 있다면 해당 블록으로 축의 면을 크게 만든다 …
 * 커다란 블록이 하나면 이걸로 그리드를 만들고"): 같은 축의 블록들(q + others)을 모두 덮는 면을 n 칸 넓혀 **축 면**(face, 사진 외곽선)으로 하고,
 * 그 면에 블록 q 의 폭·높이 간격으로 선을 긋는다. u = 세로선(가로 길이 눈금), v = 가로선(세로 길이 눈금). 사진 px 선분
 */
export function blockGrid(pl: BlockPlane, q: Pt[], n = 6, others: Pt[][] = []): { u: Line[]; v: Line[]; face: Pt[] } | null {
  const r = blockRect(pl, q);
  if (!r) return null;
  const du = r.u1 - r.u0, dv = r.v1 - r.v0;
  const all = [r, ...others.map((o) => blockRect(pl, o)).filter((x): x is NonNullable<typeof x> => !!x)];
  const U0 = Math.min(...all.map((a) => a.u0)) - n * du, U1 = Math.max(...all.map((a) => a.u1)) + n * du;
  const V0 = Math.min(...all.map((a) => a.v0)) - n * dv, V1 = Math.max(...all.map((a) => a.v1)) + n * dv;
  // 지평선 자르기 (2026-11-04 "치수 블록 1 선택하면 그리드 에러"): 면 → 사진의 동차 좌표 w 가 블록 쪽과 같은 부호이고 블록 가운데 값의 GRID_HORIZON 배 이상인 곳만 —
  // 원근이 강한 사진에서 그리드가 지평선을 넘으면 선이 사진 반대쪽·수십만 px 밖으로 튀었다
  const H = pl.H, wOf = (p: Pt) => H[6] * p[0] + H[7] * p[1] + H[8];
  const wc = wOf([(r.u0 + r.u1) / 2, (r.v0 + r.v1) / 2]);
  if (!(Math.abs(wc) > 0)) return null;
  const minW = Math.abs(wc) * GRID_HORIZON, sgn = Math.sign(wc);
  const ok = (p: Pt) => sgn * wOf(p) >= minW;
  /** 면 좌표 선분 a→b 에서 앞쪽(ok)만 남긴다 (w 는 선을 따라 1차라 한 번만 자른다) */
  const clipSeg = (a: Pt, b: Pt): [Pt, Pt] | null => {
    const wa = sgn * wOf(a) - minW, wb = sgn * wOf(b) - minW;
    if (wa < 0 && wb < 0) return null;
    if (wa >= 0 && wb >= 0) return [a, b];
    const t = wa / (wa - wb), m: Pt = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    return wa >= 0 ? [a, m] : [m, b];
  };
  const seg = (a: Pt, b: Pt): Line | null => {
    const c = clipSeg(a, b);
    if (!c) return null;
    const A = proj(pl.H, c[0]), B = proj(pl.H, c[1]);
    return [A, B].every((p) => isFinite(p[0]) && isFinite(p[1])) ? { a: A, b: B } : null;
  };
  const u: Line[] = [], v: Line[] = [];
  const eps = 1e-6;
  for (let k = Math.ceil((U0 - r.u0) / du - eps); r.u0 + k * du <= U1 + eps; k++) { const x = r.u0 + k * du, s = seg([x, V0], [x, V1]); if (s) u.push(s); }
  for (let k = Math.ceil((V0 - r.v0) / dv - eps); r.v0 + k * dv <= V1 + eps; k++) { const y = r.v0 + k * dv, s = seg([U0, y], [U1, y]); if (s) v.push(s); }
  // 면 외곽선도 같은 반평면으로 자른다 (Sutherland–Hodgman, 변 하나)
  const poly = [[U0, V1], [U1, V1], [U1, V0], [U0, V0]] as Pt[], clipped: Pt[] = [];
  for (let k = 0; k < poly.length; k++) {
    const a = poly[k], b = poly[(k + 1) % poly.length];
    if (ok(a)) clipped.push(a);
    if (ok(a) !== ok(b)) { const c = clipSeg(a, b); if (c) clipped.push(ok(a) ? c[1] : c[0]); }
  }
  const face = clipped.map((p) => proj(pl.H, p));
  return { u, v, face };
}
/** 그리드를 지평선 쪽으로 얼마나 그릴지 — 면→사진 동차 w 가 블록 가운데 값의 이 배 이상인 곳까지 (작을수록 멀리, 0 이면 지평선까지) */
export const GRID_HORIZON = 0.25;

/**
 * 축 면 랩핑 (2026-11-04 사용자: "블록이 여러게 있다면 해당 블록으로 축의 면을 크게 만든다. 이걸로 사인물들을 랩핑해 펼쳐 길이를 추론하다. 커다란 블록이 하나면 이걸로 그리드를 만들고 랩핑하는 거야"
 * → "두 블록의 가로 비율이 서로 다르게 나온다 … 블록 길이와 위치에대한 계산없이 원근의 그리드로 길이를 유추하고 있다"):
 * 원근(구도)은 그대로 두고, 블록마다 그 축 면에 펼친 길이(raw)와 입력 길이(w·h, 하나만 있으면 그 축척을 둘 다에)로 축척을 얻는다.
 * - **벽면(y)에서 자리(at — 벽 좌표)를 아는 블록·사인물**: 축척을 **자리에 따라 변하는 면**(s = a + b·u + c·v, 최소제곱 — 블록 셋까지는 각 블록 자리에서 정확히 그 블록의 축척)으로.
 *   원근이 조금 틀려 블록마다 축척이 다르게 나와도 가까운 블록을 따르고 사이는 이어진다. 블록 바깥은 블록들의 축척 범위로 막는다
 * - 그 밖(옆면·수평면, 자리 모름): 그 축 면 블록들의 중앙값, 그 면에 블록이 없으면 모든 블록의 중앙값
 * raw = 원근 면에서 잰 길이(원근의 단위), axis 없음 = 벽면 y
 */
/** 다른 블록과 안 맞음 판정 허용치 — 같은 축 면 블록이 셋 이상일 때, 축척이 가운데 값과 25% 넘게 다르면 (2026-11-05) */
export const BLOCK_OUTLIER_TOL = 0.25;
/**
 * 다른 블록과 안 맞는 블록 (2026-11-05 사용자: "3번째 사진의 사인물 예상 크기 … 사인물 14와 사인물 18의 세로가 많이 차이난다"):
 * 같은 축 면(axis)의 치수 있는 블록이 셋 이상이면 블록마다 축척(입력 ÷ 펼친 길이)을 가로·세로 따로 가운데 값과 비교해 어느 하나라도 25% 넘게 다른 것.
 * 깊이가 다른 면(튀어나온 기둥 등)에 그렸거나 치수를 잘못 넣은 블록 — 위치로 축척을 이으면 같은 줄의 사인물이 기울어진다. 둘이면 어느 쪽인지 몰라 판단하지 않는다
 */
export function blockOutliers(blocks: { raw: { widthMm: number; heightMm: number } | null | undefined; w?: number; h?: number; axis?: BlockAxis }[]): Set<number> {
  const out = new Set<number>();
  // 가로·세로 축척을 따로 (현장: 가로는 같고 세로만 크게 달랐다 — 섞으면 묽어진다)
  const scaleOf = (b: (typeof blocks)[number]) => {
    if (!b.raw || !(b.raw.widthMm > 0) || !(b.raw.heightMm > 0) || blockMismatch(b.raw, b.w, b.h)) return null;
    const sx = b.w && b.w > 0 ? b.w / b.raw.widthMm : undefined, sy = b.h && b.h > 0 ? b.h / b.raw.heightMm : undefined;
    return sx || sy ? { sx, sy } : null;
  };
  const median = (v: number[]) => { const a = [...v].sort((x, y) => x - y), n = a.length; return n % 2 ? a[(n - 1) / 2] : (a[n / 2 - 1] + a[n / 2]) / 2; };
  const far = (s: number, m: number) => Math.abs(Math.log(s / m)) > Math.log(1 + BLOCK_OUTLIER_TOL);
  const byAxis = new Map<BlockAxis, { i: number; sx?: number; sy?: number }[]>();
  blocks.forEach((b, i) => { const s = scaleOf(b); if (s) byAxis.set(b.axis ?? 'y', [...(byAxis.get(b.axis ?? 'y') ?? []), { i, ...s }]); });
  for (const g of byAxis.values()) {
    if (g.length < 3) continue;
    for (const k of ['sx', 'sy'] as const) {
      const have = g.filter((x) => x[k]);
      if (have.length < 3) continue;
      const m = median(have.map((x) => x[k]!));
      for (const x of have) if (far(x[k]!, m)) out.add(x.i);
    }
  }
  return out;
}

export function measureByBlocks(
  blocks: { raw: { widthMm: number; heightMm: number } | null | undefined; w?: number; h?: number; axis?: BlockAxis; at?: Pt }[],
  signs: { id: string; raw: { widthMm: number; heightMm: number } | null | undefined; axis?: BlockAxis; at?: Pt }[],
): Map<string, { widthMm: number; heightMm: number }> {
  const scales: { axis: BlockAxis; sx: number; sy: number; at?: Pt }[] = [];
  const outliers = blockOutliers(blocks); // 다른 블록과 안 맞는 블록은 기준에서 뺀다 (2026-11-05)
  for (const [bi, b] of blocks.entries()) {
    if (outliers.has(bi)) continue;
    if (!b.raw || !(b.raw.widthMm > 0) || !(b.raw.heightMm > 0)) continue;
    if (blockMismatch(b.raw, b.w, b.h)) continue; // 원근과 안 맞는 블록은 기준에서 뺀다 (2026-11-05)
    const sx = b.w && b.w > 0 ? b.w / b.raw.widthMm : undefined, sy = b.h && b.h > 0 ? b.h / b.raw.heightMm : undefined;
    if (sx === undefined && sy === undefined) continue;
    scales.push({ axis: b.axis ?? 'y', sx: sx ?? sy!, sy: sy ?? sx!, at: b.at });
  }
  const out = new Map<string, { widthMm: number; heightMm: number }>();
  if (!scales.length) return out;
  const median = (xs: number[]) => { const a = [...xs].sort((p, q) => p - q); return a.length % 2 ? a[(a.length - 1) / 2] : (a[a.length / 2 - 1] + a[a.length / 2]) / 2; };
  const scaleOf = (axis: BlockAxis) => { const on = scales.filter((s) => s.axis === axis), use = on.length ? on : scales; return { sx: median(use.map((s) => s.sx)), sy: median(use.map((s) => s.sy)) }; };
  const wall = scales.filter((s): s is typeof s & { at: Pt } => s.axis === 'y' && !!s.at && isFinite(s.at[0]) && isFinite(s.at[1]));
  const fx = wall.length ? scaleField(wall.map((s) => ({ at: s.at, v: s.sx }))) : null;
  const fy = wall.length ? scaleField(wall.map((s) => ({ at: s.at, v: s.sy }))) : null;
  for (const s of signs) {
    if (!s.raw || !(s.raw.widthMm > 0) || !(s.raw.heightMm > 0)) continue;
    const ax = s.axis ?? 'y';
    const k = ax === 'y' && s.at && fx && fy ? { sx: fx(s.at), sy: fy(s.at) } : scaleOf(ax);
    out.set(s.id, { widthMm: s.raw.widthMm * k.sx, heightMm: s.raw.heightMm * k.sy });
  }
  return out;
}

/** 자리(벽 좌표)에 따라 변하는 축척 s(u,v) = a + b·u + c·v — 기울기에 아주 작은 능선(ridge)을 두어 블록 하나면 상수, 둘이면 그 방향으로만 기운다. 값은 블록들의 범위로 막는다 */
function scaleField(pts: { at: Pt; v: number }[]): (p: Pt) => number {
  const lo = Math.min(...pts.map((p) => p.v)), hi = Math.max(...pts.map((p) => p.v));
  const cu = pts.reduce((a, p) => a + p.at[0], 0) / pts.length, cv = pts.reduce((a, p) => a + p.at[1], 0) / pts.length;
  const L = Math.max(1, ...pts.map((p) => Math.hypot(p.at[0] - cu, p.at[1] - cv)));
  const rows = pts.map((p) => [1, (p.at[0] - cu) / L, (p.at[1] - cv) / L]);
  const M = [0, 1, 2].map((i) => [0, 1, 2].map((j) => rows.reduce((a, r) => a + r[i] * r[j], 0) + (i === j && i > 0 ? 1e-9 : 0)));
  const y = [0, 1, 2].map((i) => rows.reduce((a, r, k) => a + r[i] * pts[k].v, 0));
  const c = solve3(M, y) ?? [pts.reduce((a, p) => a + p.v, 0) / pts.length, 0, 0];
  return (p) => Math.min(hi, Math.max(lo, c[0] + (c[1] * (p[0] - cu)) / L + (c[2] * (p[1] - cv)) / L));
}
function solve3(M: number[][], y: number[]): number[] | null {
  const A = M.map((r, i) => [...r, y[i]]);
  for (let c = 0; c < 3; c++) {
    let p = c;
    for (let r = c + 1; r < 3; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    if (Math.abs(A[p][c]) < 1e-15) return null;
    [A[c], A[p]] = [A[p], A[c]];
    for (let r = 0; r < 3; r++) if (r !== c) { const f = A[r][c] / A[c][c]; for (let k = c; k < 4; k++) A[r][k] -= f * A[c][k]; }
  }
  return [0, 1, 2].map((i) => A[i][3] / A[i][i]);
}
