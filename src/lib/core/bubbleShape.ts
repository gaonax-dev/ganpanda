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

// ---- 2026-10-18 사용자: "말풍선은 가로3 세로2 비율 유지, 여러 줄, 표시 글자 수 리밋과 말줄임표. 풍선과 꼭지 아웃라인을 이어주고 꼭지의 점은 제거" ----
export const BUBBLE_RATIO = 1.5; // 가로 : 세로 = 3 : 2
export const BUBBLE_MAX_LINES = 4; // 3:2 라 폭이 줄 수에 묶여 3줄이면 20자 남짓 → 4줄까지
export const BUBBLE_MAX_CHARS = 60;

/** 글을 폭에 맞춰 줄로 나눈다 (공백 우선, 없으면 글자 단위). 줄 수를 넘기면 마지막 줄 끝을 … 로 */
export function wrapLines(text: string, fontSize: number, lineW: number, maxLines = BUBBLE_MAX_LINES): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = '';
  const fits = (s: string) => textWidth(s, fontSize) <= lineW;
  const pushChars = (w: string) => { // 한 단어가 한 줄보다 길면 글자 단위
    for (const ch of w) {
      if (fits(cur + ch)) cur += ch;
      else { if (cur) lines.push(cur); cur = ch; }
    }
  };
  for (const w of words) {
    const cand = cur ? `${cur} ${w}` : w;
    if (fits(cand)) cur = cand;
    else if (!cur && !fits(w)) pushChars(w);
    else if (fits(w)) { lines.push(cur); cur = w; }
    else { if (cur) lines.push(cur); cur = ''; pushChars(w); }
  }
  if (cur) lines.push(cur);
  if (lines.length <= maxLines) return lines;
  const kept = lines.slice(0, maxLines);
  let last = kept[maxLines - 1];
  while (last.length && !fits(`${last}…`)) last = last.slice(0, -1);
  kept[maxLines - 1] = `${last}…`;
  return kept;
}

/** 3:2 몸통에 글을 배치: 줄 수를 1→maxLines 로 늘려 가며 들어가는 가장 작은 몸통 */
export function bubbleLayout(text: string, fontSize: number, pad = fontSize * 0.6, lineH = fontSize * 1.25, maxLines = BUBBLE_MAX_LINES): { w: number; h: number; lines: string[] } {
  const t = text.trim();
  const minH = lineH + pad * 2;
  if (!t) return { w: minH * BUBBLE_RATIO, h: minH, lines: [] };
  for (let n = 1; n <= maxLines; n++) {
    const h = n * lineH + pad * 2, w = h * BUBBLE_RATIO, lineW = w - pad * 2;
    const lines = wrapLines(t, fontSize, lineW, maxLines);
    if (lines.length <= n) return { w, h, lines };
  }
  const h = maxLines * lineH + pad * 2, w = h * BUBBLE_RATIO;
  return { w, h, lines: wrapLines(t, fontSize, w - pad * 2, maxLines) };
}

/** 몸통 + 꼬리를 한 획으로: 둥근 상자 둘레를 돌다가 꼬리가 붙는 변에서 밑변→꼭지→밑변으로 꺾어 나간다 (아웃라인이 이어진다) */
export function bubblePath(body: Body, tip: Pt, r: number, half: number): string {
  const x0 = body.cx - body.w / 2, y0 = body.cy - body.h / 2, x1 = body.cx + body.w / 2, y1 = body.cy + body.h / 2;
  const rr = Math.min(r, body.w / 2 - half, body.h / 2 - half);
  const e = edgePoint(body, tip);
  // 꼬리가 붙는 변: 0 위, 1 오른쪽, 2 아래, 3 왼쪽 (둘레를 시계 방향으로 돈다)
  let side = -1, c = 0;
  if (e) {
    const onV = Math.abs(Math.abs(e[0] - body.cx) - body.w / 2) < 1e-6;
    if (onV) { side = e[0] > body.cx ? 1 : 3; c = Math.max(y0 + rr + half, Math.min(y1 - rr - half, e[1])); }
    else { side = e[1] > body.cy ? 2 : 0; c = Math.max(x0 + rr + half, Math.min(x1 - rr - half, e[0])); }
  }
  const f = (n: number) => Math.round(n * 100) / 100;
  const seg = (from: Pt, to: Pt, s: number): string => {
    if (side !== s) return `L${f(to[0])} ${f(to[1])}`;
    // 변 위의 밑변: 진행 방향으로 c-half → 꼭지 → c+half
    const horiz = s === 0 || s === 2;
    const dir = s === 0 || s === 1 ? 1 : -1;
    const b1: Pt = horiz ? [c - half * dir, from[1]] : [from[0], c - half * dir];
    const b2: Pt = horiz ? [c + half * dir, from[1]] : [from[0], c + half * dir];
    return `L${f(b1[0])} ${f(b1[1])} L${f(tip[0])} ${f(tip[1])} L${f(b2[0])} ${f(b2[1])} L${f(to[0])} ${f(to[1])}`;
  };
  return [
    `M${f(x0 + rr)} ${f(y0)}`,
    seg([x0 + rr, y0], [x1 - rr, y0], 0), `Q${f(x1)} ${f(y0)} ${f(x1)} ${f(y0 + rr)}`,
    seg([x1, y0 + rr], [x1, y1 - rr], 1), `Q${f(x1)} ${f(y1)} ${f(x1 - rr)} ${f(y1)}`,
    seg([x1 - rr, y1], [x0 + rr, y1], 2), `Q${f(x0)} ${f(y1)} ${f(x0)} ${f(y1 - rr)}`,
    seg([x0, y1 - rr], [x0, y0 + rr], 3), `Q${f(x0)} ${f(y0)} ${f(x0 + rr)} ${f(y0)}`, 'Z',
  ].join(' ');
}
