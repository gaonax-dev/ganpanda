// 말풍선 모양 (2026-10-18 사용자: "말풍선에 대략의 내용을 표시하고 꼭지를 따로 지정할 수 있게", "꼭지 위치는 자연스럽게 풍선과 연결되어야한다",
// "말풍선의 변을 클릭드래그하면 풍선만 이동, 꼭지점은 같은 자리 유지. 말풍선 내부를 클릭드래그 전체 이동").
// 풍선 = 둥근 상자(몸통, 안에 마지막 상태 요약) + 꼭지(몸통에서 지점으로 뻗는 삼각 꼬리). 꼬리 밑변은 몸통 중심→지점 방향이 만나는 몸통 변 위에 놓인다
import type { Pt } from './homography';

export interface Body { cx: number; cy: number; w: number; h: number }

/** 글 폭 어림: 한글·한자·전각 1em, 그 밖 0.56em */
export function textWidth(label: string, fontSize: number): number {
  let w = 0;
  for (const ch of label) w += (ch.codePointAt(0)! > 0x2e80 ? 1 : 0.56) * fontSize;
  return w;
}

/** 몸통 크기: 글 폭 + 여백, 최소 폭 */
export function bodySize(label: string, fontSize: number, pad = fontSize * 0.7, minW = fontSize * 2.4, maxW = fontSize * 20): { w: number; h: number } {
  const tw = Math.min(maxW, textWidth(label, fontSize));
  return { w: Math.max(minW, tw + pad * 2), h: fontSize * 2.1 };
}

/** 중심에서 지점 방향으로 나간 선이 몸통 변과 만나는 점. 지점이 몸통 안이면 null (꼬리 없음) */
export function edgePoint(body: Body, tip: Pt): Pt | null {
  const dx = tip[0] - body.cx, dy = tip[1] - body.cy;
  const hw = body.w / 2, hh = body.h / 2;
  if (Math.abs(dx) <= hw && Math.abs(dy) <= hh) return null;
  // 어느 변을 먼저 지나는가: x 방향 t 와 y 방향 t 중 작은 쪽
  const tx = dx === 0 ? Infinity : hw / Math.abs(dx), ty = dy === 0 ? Infinity : hh / Math.abs(dy);
  const t = Math.min(tx, ty);
  return [body.cx + dx * t, body.cy + dy * t];
}

/** 꼬리 삼각형: 밑변은 변 위의 교점에서 변을 따라 ±half, 밑변을 몸통 안쪽으로 inset 만큼 넣어 몸통이 이음새를 덮게 한다 */
export function tailTriangle(body: Body, tip: Pt, half: number, inset: number): [Pt, Pt, Pt] | null {
  const e = edgePoint(body, tip);
  if (!e) return null;
  const hw = body.w / 2, hh = body.h / 2;
  const onVertical = Math.abs(Math.abs(e[0] - body.cx) - hw) < 1e-6; // 좌·우 변
  // 변을 따라가는 방향과 안쪽 방향
  const along: Pt = onVertical ? [0, 1] : [1, 0];
  const inward: Pt = onVertical ? [e[0] > body.cx ? -1 : 1, 0] : [0, e[1] > body.cy ? -1 : 1];
  // 밑변이 변 밖으로 나가지 않게 (모서리 근처)
  const limit = (onVertical ? hh : hw) - half * 0.5;
  const c = onVertical ? Math.max(body.cy - limit, Math.min(body.cy + limit, e[1])) : Math.max(body.cx - limit, Math.min(body.cx + limit, e[0]));
  const center: Pt = onVertical ? [e[0], c] : [c, e[1]];
  const base = (s: number): Pt => [center[0] + along[0] * half * s + inward[0] * inset, center[1] + along[1] * half * s + inward[1] * inset];
  return [base(-1), tip, base(1)];
}

export function roundedRectPath(b: Body, r: number): string {
  const x0 = b.cx - b.w / 2, y0 = b.cy - b.h / 2, x1 = b.cx + b.w / 2, y1 = b.cy + b.h / 2;
  const rr = Math.min(r, b.w / 2, b.h / 2);
  return `M${x0 + rr} ${y0} H${x1 - rr} Q${x1} ${y0} ${x1} ${y0 + rr} V${y1 - rr} Q${x1} ${y1} ${x1 - rr} ${y1} H${x0 + rr} Q${x0} ${y1} ${x0} ${y1 - rr} V${y0 + rr} Q${x0} ${y0} ${x0 + rr} ${y0} Z`;
}

export const UNIT_RECT: Pt[] = [[0, 0], [1, 0], [1, 1], [0, 1]];
/** 사인물 말풍선 기본 자리: 꼭지 = 오른쪽 위 꼭짓점(사인물 좌표 1,0) */
export const DEFAULT_TIP: Pt = [1, 0];
