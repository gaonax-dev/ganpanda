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

/** 블록(TL,TR,BR,BL)들의 변 → 가로 축 선(위·아래 변)과 높이 축 선(좌·우 변) */
export function blockLines(blocks: Pt[][]): { x: Line[]; y: Line[] } {
  const x: Line[] = [], y: Line[] = [];
  for (const b of blocks) {
    if (b.length !== 4) continue;
    const [tl, tr, br, bl] = b;
    x.push({ a: tl, b: tr }, { a: bl, b: br });
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
