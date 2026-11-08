// 닫힌 경로 = 꼭짓점 + 꼭짓점마다 베지어 곡선 손잡이(없으면 직선 모서리). 다각형 사인물(SignObject.polygon·curves)과 앞가림 마스크(Photo.masks)가 쓴다.
// 존의 작동 원리(변 가운데 □ → 꼭짓점 추가, 꼭짓점 끌기, 골라서 지우기 — 최소 3개)를 그대로 옮기고 곡선 손잡이를 더했다
// (2026-11-08 "존의 작동 원리를 다각형에 적용한다. 존을 폐지하고 존의 작동원리에 베지어곡선 컨트롤러를 추가하고 마스크를 추가한다"). → docs/features/photo-board.md
import { applyHomography, solveHomography, type Pt } from './homography';

/** 꼭짓점의 곡선 손잡이 (사진 px). in = 앞 변 쪽, out = 다음 변 쪽 */
export interface Curve { in: Pt; out: Pt }
export interface Path { pts: Pt[]; curves?: (Curve | null)[] }

export const PATH_MIN_VERTICES = 3;

const curveAt = (p: Path, i: number): Curve | null => p.curves?.[i] ?? null;
const lerp = (a: Pt, b: Pt, t: number): Pt => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const round = (p: Pt): Pt => [Math.round(p[0] * 100) / 100, Math.round(p[1] * 100) / 100];
/** 손잡이가 하나도 없으면 curves 를 뺀다 (저장·비교가 간단하게) */
const tidy = (pts: Pt[], curves: (Curve | null)[]): Path => (curves.some(Boolean) ? { pts, curves } : { pts });

/** 변 i(꼭짓점 i → i+1)의 베지어 네 점. 직선 변은 손잡이 = 끝점 */
function segment(p: Path, i: number): [Pt, Pt, Pt, Pt] {
  const j = (i + 1) % p.pts.length;
  const a = p.pts[i], b = p.pts[j];
  return [a, curveAt(p, i)?.out ?? a, curveAt(p, j)?.in ?? b, b];
}
const isStraight = (p: Path, i: number) => !curveAt(p, i) && !curveAt(p, (i + 1) % p.pts.length);

function bezier([a, c1, c2, b]: [Pt, Pt, Pt, Pt], t: number): Pt {
  const m = 1 - t;
  return [m * m * m * a[0] + 3 * m * m * t * c1[0] + 3 * m * t * t * c2[0] + t * t * t * b[0], m * m * m * a[1] + 3 * m * m * t * c1[1] + 3 * m * t * t * c2[1] + t * t * t * b[1]];
}

/** 변의 가운데 (곡선 변은 곡선 위 t = 0.5) — 누르면 꼭짓점 추가 */
export function midpoints(p: Path): Pt[] {
  return p.pts.map((_, i) => bezier(segment(p, i), 0.5));
}

/** 변 edge 의 가운데에 꼭짓점을 넣는다. 곡선 변은 드 카스텔조로 둘로 나눠 모양이 그대로 */
export function insertVertex(p: Path, edge: number): Path {
  const n = p.pts.length, j = (edge + 1) % n;
  const [a, c1, c2, b] = segment(p, edge);
  const curves = p.pts.map((_, i) => curveAt(p, i));
  const pts = p.pts.slice();
  if (isStraight(p, edge)) {
    pts.splice(edge + 1, 0, round(lerp(a, b, 0.5)));
    curves.splice(edge + 1, 0, null);
    return tidy(pts, curves);
  }
  const ab = lerp(a, c1, 0.5), bc = lerp(c1, c2, 0.5), cd = lerp(c2, b, 0.5);
  const abc = lerp(ab, bc, 0.5), bcd = lerp(bc, cd, 0.5), m = lerp(abc, bcd, 0.5);
  // 양 끝 손잡이는 짧아진다 (곡선 손잡이가 없던 끝은 그대로 없음)
  if (curves[edge]) curves[edge] = { in: curves[edge]!.in, out: round(ab) };
  if (curves[j]) curves[j] = { in: round(cd), out: curves[j]!.out };
  pts.splice(edge + 1, 0, round(m));
  curves.splice(edge + 1, 0, { in: round(abc), out: round(bcd) });
  return tidy(pts, curves);
}

/** 꼭짓점 지우기 (3개 미만이면 그대로 — 같은 객체) */
export function removeVertex(p: Path, index: number): Path {
  if (p.pts.length <= PATH_MIN_VERTICES) return p;
  return tidy(p.pts.filter((_, i) => i !== index), p.pts.map((_, i) => curveAt(p, i)).filter((_, i) => i !== index));
}

/** 꼭짓점 옮기기 — 그 곡선 손잡이도 같이 */
export function moveVertex(p: Path, index: number, to: Pt): Path {
  const v = p.pts[index], dx = to[0] - v[0], dy = to[1] - v[1];
  const curves = p.pts.map((_, i) => curveAt(p, i));
  const c = curves[index];
  if (c) curves[index] = { in: [c.in[0] + dx, c.in[1] + dy], out: [c.out[0] + dx, c.out[1] + dy] };
  return tidy(p.pts.map((q, i) => (i === index ? to : q)), curves);
}

/** 꼭짓점 두 번 누르기: 직선 모서리 → 매끈한 곡선(이웃을 잇는 방향, 변 길이의 1/3) → 다시 직선 */
export function toggleCurve(p: Path, index: number): Path {
  const n = p.pts.length;
  const curves = p.pts.map((_, i) => curveAt(p, i));
  if (curves[index]) { curves[index] = null; return tidy(p.pts, curves); }
  const v = p.pts[index], prev = p.pts[(index - 1 + n) % n], next = p.pts[(index + 1) % n];
  const dx = next[0] - prev[0], dy = next[1] - prev[1], len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len;
  const lp = Math.hypot(v[0] - prev[0], v[1] - prev[1]) / 3, ln = Math.hypot(next[0] - v[0], next[1] - v[1]) / 3;
  curves[index] = { in: round([v[0] - ux * lp, v[1] - uy * lp]), out: round([v[0] + ux * ln, v[1] + uy * ln]) };
  return tidy(p.pts, curves);
}

/** 곡선 손잡이 끌기 — 반대쪽은 꼭짓점을 중심으로 대칭, free(Alt)면 그쪽만 */
export function moveHandle(p: Path, index: number, which: 'in' | 'out', to: Pt, free = false): Path {
  const c = curveAt(p, index);
  if (!c) return p;
  const v = p.pts[index];
  const other: Pt = free ? c[which === 'in' ? 'out' : 'in'] : [2 * v[0] - to[0], 2 * v[1] - to[1]];
  const curves = p.pts.map((_, i) => curveAt(p, i));
  curves[index] = which === 'in' ? { in: to, out: other } : { in: other, out: to };
  return tidy(p.pts, curves);
}

/** 꼭짓점·손잡이를 모두 같은 변환으로 (옮기기·크기·사진 크롭) */
export function mapPath(p: Path, f: (q: Pt) => Pt): Path {
  return tidy(p.pts.map(f), p.pts.map((_, i) => { const c = curveAt(p, i); return c ? { in: f(c.in), out: f(c.out) } : null; }));
}

/** 펼친 점 — 곡선 변은 steps 개로 나눈다. 평면 그림(clip-path)·면적·3D·말풍선 등 점 목록이 필요한 곳 */
export function flattenPath(p: Path, steps = 16): Pt[] {
  if (!p.curves?.some(Boolean)) return p.pts;
  const out: Pt[] = [];
  for (let i = 0; i < p.pts.length; i++) {
    out.push(p.pts[i]);
    if (isStraight(p, i)) continue;
    const seg = segment(p, i);
    for (let k = 1; k < steps; k++) out.push(bezier(seg, k / steps));
  }
  return out;
}

/** SVG 경로 d (사진 px) — 곡선 변은 C */
export function pathD(p: Path, k = 1): string {
  const f = (q: Pt) => `${Math.round(q[0] * k * 100) / 100} ${Math.round(q[1] * k * 100) / 100}`;
  let d = `M${f(p.pts[0])}`;
  for (let i = 0; i < p.pts.length; i++) {
    const [, c1, c2, b] = segment(p, i);
    if (i === p.pts.length - 1 && isStraight(p, i)) break; // 마지막 직선 변은 Z 가 닫는다
    d += isStraight(p, i) ? `L${f(b)}` : `C${f(c1)} ${f(c2)} ${f(b)}`;
  }
  return d + 'Z';
}

/** 바운드 박스 (곡선은 펼친 점 기준) */
export function pathBounds(p: Path): { x: number; y: number; w: number; h: number } {
  const pts = flattenPath(p, 24);
  const xs = pts.map((q) => q[0]), ys = pts.map((q) => q[1]);
  const x = Math.min(...xs), y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

/** 다각형 사인물의 윤곽 점 (곡선은 펼친 점). 다각형이 아니면 undefined */
export function polygonPts(o: { shape?: string; polygon?: Pt[]; curves?: (Curve | null)[] }, steps = 16): Pt[] | undefined {
  return o.shape === 'polygon' && o.polygon?.length ? flattenPath({ pts: o.polygon, curves: o.curves }, steps) : undefined;
}

/** 외곽 사각(quad)을 옮기거나 늘리면 다각형·손잡이도 같은 원근 변환으로 따라간다 */
export function followQuad(o: { polygon?: Pt[]; curves?: (Curve | null)[] }, from: Pt[], to: Pt[]): { polygon?: Pt[]; curves?: (Curve | null)[] } {
  if (!o.polygon?.length || from.length !== 4 || to.length !== 4) return {};
  const H = solveHomography(from, to);
  const m = mapPath({ pts: o.polygon, curves: o.curves }, (q) => round(applyHomography(H, q)));
  return { polygon: m.pts, curves: m.curves };
}

/** 경로의 바운드 박스 사각형 (TL,TR,BR,BL) — 다각형 사인물의 quad */
export function boundsQuad(p: Path): Pt[] {
  const b = pathBounds(p);
  const r = (v: number) => Math.round(v);
  return [[r(b.x), r(b.y)], [r(b.x + b.w), r(b.y)], [r(b.x + b.w), r(b.y + b.h)], [r(b.x), r(b.y + b.h)]];
}
