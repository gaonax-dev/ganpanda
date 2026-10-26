// 사진 보드 카드 정렬 — 사진과 같은 비율 (2026-10-22 사용자: "재정렬 예전에 똑똑하게 잘된거 같은데 자동정렬은 피봇 기본 위치에 놓는다. 그리고 사진과 같은 비율로 사진과 비슷하게 정렬해준다";
// 2026-10-20 의 그리드(축선·셀 병합)는 대체됨 — gridOf 는 남겨 둔다).
// 결과 좌표는 리스트 배치와 같은 mm (listX/listY, 왼쪽 위 기준, 아래로 +). 정렬은 [재정렬]을 누를 때만 — 그 뒤로 카드는 자유롭게 옮긴다

export interface Box { x0: number; y0: number; x1: number; y1: number }
export interface Span { r0: number; r1: number; c0: number; c1: number }

/** 가까운 값(tol 안)을 하나의 축선(평균)으로 묶는다 — 오름차순 */
export function axisLines(values: number[], tol: number): number[] {
  const out: number[][] = [];
  for (const v of [...values].sort((a, b) => a - b)) {
    const last = out[out.length - 1];
    if (last && v - last[last.length - 1] <= tol) last.push(v); else out.push([v]);
  }
  return out.map((g) => g.reduce((a, b) => a + b, 0) / g.length);
}
const nearest = (lines: number[], v: number) => lines.reduce((bi, l, i) => (Math.abs(l - v) < Math.abs(lines[bi] - v) ? i : bi), 0);
/** 끝 두 값을 축선 번호 범위(시작 ≤ 끝-1)로 — 얇아서 같은 선에 붙으면 한 칸으로 */
function spanOf(lines: number[], a: number, b: number): [number, number] {
  let i = nearest(lines, a), j = nearest(lines, b);
  if (j <= i) { if (i + 1 < lines.length) j = i + 1; else { i = Math.max(0, i - 1); j = i + 1; } }
  return [i, j];
}

/**
 * 사진 한 장(imgW×imgH px)의 사인물 외곽선 범위 → 행·열 셀(병합 범위). 축선 = 좌우·위아래 끝을 사진 크기의 tol(기본 3%) 안에서 묶은 선.
 * 큰 사인물부터 셀을 차지하고, 이미 찬 셀과 겹치는 사인물(판 위 글자 등)은 자기 행 범위 바로 아래 새 행에 같은 열로
 */
export function gridOf(items: { id: string; box: Box }[], imgW: number, imgH: number, tol = 0.03): Map<string, Span> {
  // 허용 오차 = 사진 크기의 tol 과 사인물 크기 중앙값의 25% 중 작은 값 (2026-10-21 핀볼: 큰 사진의 작은 사인물이 한 축선으로 뭉쳐 세로로 쌓였다)
  const median = (v: number[]) => { const a = [...v].sort((p, q) => p - q); return a.length ? a[Math.floor((a.length - 1) / 2)] : 0; };
  const tx = Math.min(imgW * tol, 0.25 * median(items.map((i) => i.box.x1 - i.box.x0)) || imgW * tol);
  const ty = Math.min(imgH * tol, 0.25 * median(items.map((i) => i.box.y1 - i.box.y0)) || imgH * tol);
  const xs = axisLines(items.flatMap((i) => [i.box.x0, i.box.x1]), tx);
  const ys = axisLines(items.flatMap((i) => [i.box.y0, i.box.y1]), ty);
  // 행 키(실수): 새 행을 사이에 끼워 넣을 수 있게
  const raw = items.map((i) => { const [c0, c1] = spanOf(xs, i.box.x0, i.box.x1), [r0, r1] = spanOf(ys, i.box.y0, i.box.y1); return { id: i.id, c0, c1, rows: Array.from({ length: r1 - r0 }, (_, k) => r0 + k), area: (i.box.x1 - i.box.x0) * (i.box.y1 - i.box.y0) }; });
  const used = new Set<string>();
  const key = (r: number, c: number) => `${r}:${c}`;
  for (const it of [...raw].sort((a, b) => b.area - a.area)) {
    const free = (rows: number[]) => rows.every((r) => { for (let c = it.c0; c < it.c1; c++) if (used.has(key(r, c))) return false; return true; });
    if (!free(it.rows)) {
      // 자기 행 범위 바로 아래(다음 행 앞)에 새 행 하나 — 같은 자리에 또 겹치면 그 아래로
      let r = it.rows[it.rows.length - 1] + 0.5;
      while (!free([r])) r += 0.001;
      it.rows = [r];
    }
    for (const r of it.rows) for (let c = it.c0; c < it.c1; c++) used.add(key(r, c));
  }
  const rowKeys = [...new Set(raw.flatMap((i) => i.rows))].sort((a, b) => a - b);
  const ri = new Map(rowKeys.map((r, i) => [r, i]));
  // 아무 사인물도 없는 열·행은 빼고 번호를 다시
  const cols = [...new Set(raw.flatMap((i) => Array.from({ length: i.c1 - i.c0 }, (_, k) => i.c0 + k)))].sort((a, b) => a - b);
  const ci = new Map(cols.map((c, i) => [c, i]));
  const out = new Map<string, Span>();
  for (const it of raw) {
    const rs = it.rows.map((r) => ri.get(r)!), cs = Array.from({ length: it.c1 - it.c0 }, (_, k) => ci.get(it.c0 + k)!);
    out.set(it.id, { r0: Math.min(...rs), r1: Math.max(...rs) + 1, c0: Math.min(...cs), c1: Math.max(...cs) + 1 });
  }
  return out;
}

/** 외곽선(사진 px) 네 모서리가 직각에서 벗어난 최대 각(°) — 작을수록 정면에서 찍힌 것 */
export function cornerSkew(q: [number, number][]): number {
  if (q.length !== 4) return 90;
  return Math.max(...q.map((p, i) => {
    const a = q[(i + 3) % 4], b = q[(i + 1) % 4], u = [a[0] - p[0], a[1] - p[1]], v = [b[0] - p[0], b[1] - p[1]];
    const c = (u[0] * v[0] + u[1] * v[1]) / ((Math.hypot(u[0], u[1]) * Math.hypot(v[0], v[1])) || 1);
    return Math.abs((Math.acos(Math.max(-1, Math.min(1, c))) * 180) / Math.PI - 90);
  }));
}
/**
 * 연결된 사인물(원본 + ⇄ 연결 영역들)의 카드 기준 = 가장 정면인 것 (2026-10-21 사용자: "사인물 정면뷰 카드정렬 문제점과 해결방안" → "1,2만 해줘"):
 * 네 모서리가 직각에 가까운 것(1° 차이 안이면 같다고 보고) → 사진에서 더 크게(넓게) 보이는 것
 */
export function homeOf<T extends { quad: [number, number][] }>(instances: T[]): T {
  const area = (q: [number, number][]) => Math.abs(q.reduce((t, p, i) => t + p[0] * q[(i + 1) % q.length][1] - q[(i + 1) % q.length][0] * p[1], 0)) / 2;
  return [...instances].sort((a, b) => { const d = cornerSkew(a.quad) - cornerSkew(b.quad); return Math.abs(d) > 1 ? d : area(b.quad) - area(a.quad); })[0];
}

/** 보드의 사진 배치(왼쪽 위 x·y, 폭·높이) → 행·열: 위 끝이 높이의 절반 안이면 같은 행, 왼쪽 끝이 폭의 절반 안이면 같은 열 */
export function photoGrid(photos: { x: number; y: number; w: number; h: number }[]): { r: number; c: number }[] {
  if (!photos.length) return [];
  const w = Math.min(...photos.map((p) => p.w)), h = Math.min(...photos.map((p) => p.h));
  const cols = axisLines(photos.map((p) => p.x), w / 2), rows = axisLines(photos.map((p) => p.y), h / 2);
  return photos.map((p) => ({ r: nearest(rows, p.y), c: nearest(cols, p.x) }));
}

interface Rect { x: number; y: number; w: number; h: number }
/**
 * 원하는 자리(x, y)에서 가장 가까운 빈 자리 — 이미 놓인 것들과 간격(gap)까지 겹치지 않게 (2026-10-23 "재정렬하면 마지막 사진에서 겹쳐지고":
 * 전엔 겹친 것 하나씩 덜 움직이는 쪽으로 최대 300번 비켰는데, 좁은 자리에 큰 카드가 몰리면 좌우로 오가다 겹친 채 끝났다).
 * 후보 = 원래 x·y 와 놓인 것들의 옆(오른쪽·왼쪽)·위아래 자리의 모든 조합. 가장 오른쪽 것의 오른쪽은 늘 비어 있어 반드시 찾는다
 */
function freeSpot(placed: Rect[], x: number, y: number, w: number, h: number, gap: number): { x: number; y: number } {
  const free = (cx: number, cy: number) => !placed.some((q) => cx < q.x + q.w + gap && q.x < cx + w + gap && cy < q.y + q.h + gap && q.y < cy + h + gap);
  if (free(x, y)) return { x, y };
  const xs = [x, ...placed.flatMap((q) => [q.x + q.w + gap, q.x - gap - w])];
  const ys = [y, ...placed.flatMap((q) => [q.y + q.h + gap, q.y - gap - h])];
  let best: { x: number; y: number } | null = null, bd = Infinity;
  for (const cx of xs) for (const cy of ys) {
    const d = Math.hypot(cx - x, cy - y);
    if (d < bd && free(cx, cy)) { best = { x: cx, y: cy }; bd = d; }
  }
  return best ?? { x: Math.max(...placed.map((q) => q.x + q.w)) + gap, y };
}
/** 겹칠 때 사진 속 간격을 넓히는 최대 배율 (2026-10-26 현장 5곳 비교: 1.5 가 구성·크기 둘 다 가장 가까웠다 — 2 이상은 카드 사이가 사진보다 너무 벌어짐) */
export const SPREAD_MAX = 1.5;

/**
 * 사진마다 실제 벽 축척 mm / 보드 px (2026-10-26): 그 사진의 치수 있는 사인물(실제 mm ÷ 사진 속 폭) 중앙값, 없으면 전체 중앙값, 아무것도 없으면 fallback.
 * 사진마다 거리가 달라 한 축척으로 옮기면 가까이 찍은 사진의 카드가 사진보다 멀리 흩어졌다(현장 "폴딩시트" 네 장)
 */
export function photoScales(samples: { photo: number; r: number }[], n: number, fallback: number): { all: number; each: number[] } {
  const med = (a: number[]) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
  const all = samples.length ? med(samples.map((x) => x.r)) : fallback;
  return { all, each: Array.from({ length: n }, (_, i) => { const a = samples.filter((x) => x.photo === i).map((x) => x.r); return a.length ? med(a) : all; }) };
}

/**
 * 카드 정렬 = **사진과 같은 비율** (2026-10-22): photos 는 평면 mm(보드 px × 실제 벽 축척 — 호출자가 치수 있는 사인물로 구한다), 카드 가운데 = 그 사진 속 사인물 가운데.
 * 카드는 실제 mm 크기라 사진 속 넓이와 다르므로 겹치면 큰 카드부터 자리를 잡고, 겹친 카드는 오른쪽·왼쪽·아래·위 중 덜 움직이는 쪽으로 간격(gap)을 두고 비킨다(이름 줄 labelMm 도 겹침으로).
 * 사진 묶음은 사진 자리 그대로(행·열) — 묶음끼리 겹치면 오른쪽·아래로. 결과: x 는 가장 왼쪽 사진 기준, 맨 위 = 0 → ✥(카드 묶음 왼쪽 위)가 기본 자리(호출자가 flatOffset 도 0 으로).
 * 사진 없는 카드는 모두의 아래 한 줄
 */
export function arrangeLikePhotos(cards: { id: string; w: number; h: number; photo: number | null; box: Box }[], photos: { x: number; y: number; w: number; h: number; imgW: number; imgH: number }[], gap: number, labelMm: number): Map<string, { x: number; y: number }> {
  const out = new Map<string, { x: number; y: number }>();
  const used = [...new Set(cards.map((c) => c.photo).filter((p): p is number => p !== null && !!photos[p]))];
  const left0 = used.length ? Math.min(...photos.map((p) => p.x)) : 0;
  const groups = new Map<number, (Rect & { id: string })[]>();
  for (const p of used) {
    const ph = photos[p], sx = ph.w / ph.imgW, sy = ph.h / ph.imgH;
    const mine = cards.filter((c) => c.photo === p);
    const cx = (c: (typeof mine)[number]) => ((c.box.x0 + c.box.x1) / 2) * sx, cy = (c: (typeof mine)[number]) => ((c.box.y0 + c.box.y1) / 2) * sy;
    // 넓히기 (2026-10-26): 실제 크기 카드가 사진 속 간격보다 커서 겹치면, 사진 속 가운데 간격을 같은 배율로 넓혀 구성을 그대로 둔다(최대 SPREAD_MAX).
    // 그 배율로도 못 푸는 쌍(안에 든 것·거의 같은 자리)은 배율에 넣지 않고 아래 빈 곳 찾기에 맡긴다
    let f = 1;
    for (let i = 0; i < mine.length; i++) for (let j = i + 1; j < mine.length; j++) {
      const a = mine[i], b = mine[j], dx = Math.abs(cx(a) - cx(b)), dy = Math.abs(cy(a) - cy(b));
      const need = Math.min(dx > 0 ? ((a.w + b.w) / 2 + gap) / dx : Infinity, dy > 0 ? ((a.h + b.h) / 2 + labelMm + gap) / dy : Infinity);
      if (need <= SPREAD_MAX) f = Math.max(f, need);
    }
    const mx = mine.length ? mine.reduce((t, c) => t + cx(c), 0) / mine.length : 0, my = mine.length ? mine.reduce((t, c) => t + cy(c), 0) / mine.length : 0;
    const want = mine.map((c) => ({ c, x: ph.x - left0 + mx + (cx(c) - mx) * f - c.w / 2, y: ph.y + my + (cy(c) - my) * f - c.h / 2 }));
    const placed: (Rect & { id: string })[] = [];
    for (const t of [...want].sort((a, b) => b.c.w * b.c.h - a.c.w * a.c.h || a.x - b.x)) {
      const r = { id: t.c.id, ...freeSpot(placed, t.x, t.y, t.c.w, t.c.h + labelMm, gap), w: t.c.w, h: t.c.h + labelMm };
      placed.push(r);
    }
    groups.set(p, placed);
  }
  // 묶음끼리: 사진 행·열 순서로, 앞 묶음과 겹치면 오른쪽(같은 행)·아래(다음 행)로 간격 두 배
  const pg = photoGrid(photos);
  const bounds = (g: Rect[]) => ({ x0: Math.min(...g.map((q) => q.x)), y0: Math.min(...g.map((q) => q.y)), x1: Math.max(...g.map((q) => q.x + q.w)), y1: Math.max(...g.map((q) => q.y + q.h)) });
  const order = [...used].sort((a, b) => pg[a].r - pg[b].r || photos[a].x - photos[b].x);
  let row = -1, rowTop = -Infinity, prevBottom = -Infinity, right = -Infinity;
  for (const p of order) {
    const g = groups.get(p)!;
    if (pg[p].r !== row) { row = pg[p].r; rowTop = prevBottom === -Infinity ? -Infinity : prevBottom + gap * 2; right = -Infinity; }
    const b = bounds(g);
    const dx = Math.max(0, right === -Infinity ? 0 : right + gap * 2 - b.x0), dy = Math.max(0, rowTop === -Infinity ? 0 : rowTop - b.y0);
    for (const q of g) { q.x += dx; q.y += dy; }
    right = b.x1 + dx; prevBottom = Math.max(prevBottom, b.y1 + dy);
  }
  const all = [...groups.values()].flat();
  const top = all.length ? Math.min(...all.map((q) => q.y)) : 0;
  for (const q of all) out.set(q.id, { x: Math.round(q.x), y: Math.round(q.y - top) });
  let x = 0;
  const y = all.length ? Math.max(...all.map((q) => q.y + q.h)) - top + gap * 2 : 0;
  for (const c of cards.filter((i) => i.photo === null || !photos[i.photo])) { out.set(c.id, { x, y }); x += c.w + gap; }
  return out;
}

/**
 * 축 격자 재정렬 (2026-10-23 사용자: "원근으로 정의된 각축의 격자를 기준으로 정면 판정된 사인물들을 묶어 랩핑하고 축선을 평행하게 그리고 수직하게 그리드화",
 * "가장먼 곳을 기준으로 … 각 사인물의 순서와 배열치 그리고 겹침도 모두 해결", "사인물과 사인물이 겹친경우는 그대로 겹치게 놓는건 좋지않아").
 * 카드 = 사진의 면 묶음(정면 / 왼쪽·오른쪽 옆면 / 아래면) 안의 펴진 상자(box: 정면은 벽 mm 를 아래로 + 로, 펴지 못한 면·원근 없는 사진은 사진 px).
 * 묶음 안: 끝선을 묶어 행·열(gridOf — 겹친 사인물은 같은 열 바로 아래 새 행), 열 너비·행 높이 = 그 칸 카드 중 가장 큰 것 + 간격 → 수평·수직으로 반듯하게, 겹침 없음.
 * 사진 하나 = [왼쪽 옆면][정면][오른쪽 옆면] 위 줄 + 정면 아래 아래면. 사진 묶음은 사진 순서(행·열)대로, 되도록 자기 사진 아래 자리에. 사진 없는 카드는 맨 아래 한 줄
 */
export interface GridCard { id: string; w: number; h: number; photo: number | null; group: 'front' | 'left' | 'right' | 'bottom'; box: Box; /** 사진 속 자리(px) — 줄 묶기는 보이는 사진 기준 (펴진 벽 좌표는 원근 때문에 아래 선반이 갈라졌다, 2026-10-24) */ view?: Box }
interface Block { pos: Map<string, { x: number; y: number }>; w: number; h: number; /** 줄 수 */ rows?: number }

/**
 * 줄 묶기: 사진 속 가운데 높이 순으로, 이웃 가운데 차이가 사인물 높이 중앙값보다 크면 새 줄. 줄 안은 왼쪽 → 오른쪽, 카드는 간격만 두고 촘촘히.
 * 흩어진 사인물이 대각선 계단으로 늘어지지 않고, 위·가운데·아래 선반처럼 높이 순서는 남는다 (2026-10-24)
 */
function rowPack(cards: GridCard[], gap: number, labelMm: number): Block {
  const pos = new Map<string, { x: number; y: number }>();
  const vb = (c: GridCard) => c.view ?? c.box;
  const cy = (c: GridCard) => (vb(c).y0 + vb(c).y1) / 2, cx = (c: GridCard) => (vb(c).x0 + vb(c).x1) / 2;
  const hs = cards.map((c) => vb(c).y1 - vb(c).y0).sort((a, b) => a - b);
  const tol = hs[Math.floor((hs.length - 1) / 2)] || 1;
  const sorted = [...cards].sort((a, b) => cy(a) - cy(b));
  const rows: GridCard[][] = [];
  for (const c of sorted) { const last = rows.at(-1); if (last && cy(c) - cy(last.at(-1)!) <= tol) last.push(c); else rows.push([c]); }
  let y = 0, w = 0;
  for (const r of rows) {
    let x = 0;
    for (const c of r.sort((a, b) => cx(a) - cx(b))) { pos.set(c.id, { x, y }); x += c.w + gap; }
    w = Math.max(w, x - gap);
    y += Math.max(...r.map((c) => c.h + labelMm)) + gap;
  }
  return { pos, w, h: y - gap, rows: rows.length };
}

/**
 * 묶음 배치: 축 격자(끝선 행·열)와 줄 묶기 중 — 흩어진 사인물(실내 선반 등, 끝선이 서로 안 맞음)은 축 격자가 대각선 계단이 된다
 * (2026-10-24 현장 "신하센터": 16장이 세로 58m 계단, 원근에 기준 길이를 넣은 뒤엔 옆면 묶음이 계단). 사진 속에서 겹친 사인물이 없고, 줄 묶기가 줄이 더 적으면서 넓이도 크지 않으면 줄 묶기, 아니면 축 격자
 */
function layoutGroup(cards: GridCard[], gap: number, labelMm: number): Block {
  const grid = gridLayout(cards, gap, labelMm);
  if (cards.length < 2) return grid;
  // 사진 속에서 안에 든 사인물(판 위 글자 등)이 있으면 축 격자 — 그것은 같은 세로줄 바로 아래 새 줄이 맞다
  const vb = (c: GridCard) => c.view ?? c.box;
  const area = (b: Box) => Math.max(0, b.x1 - b.x0) * Math.max(0, b.y1 - b.y0);
  const nested = cards.some((a, i) => cards.some((b, j) => {
    if (j <= i) return false;
    const A = vb(a), B = vb(b), ix = Math.min(A.x1, B.x1) - Math.max(A.x0, B.x0), iy = Math.min(A.y1, B.y1) - Math.max(A.y0, B.y0);
    return ix > 0 && iy > 0 && ix * iy > 0.7 * Math.min(area(A), area(B)); // 한쪽이 다른 쪽 안에 거의 들어감 — 원근으로 이어 그린 옆 사인물(상자 반쯤 겹침)은 아님
  }));
  if (nested) return grid;
  const rows = rowPack(cards, gap, labelMm);
  // 줄이 더 적고 넓이도 크지 않으면 줄 묶기 (대각선 계단 = 줄이 카드 수만큼 늘어난다)
  return (rows.rows ?? 0) < (grid.rows ?? 0) && rows.w * rows.h <= grid.w * grid.h ? rows : grid;
}

function gridLayout(cards: GridCard[], gap: number, labelMm: number): Block {
  const pos = new Map<string, { x: number; y: number }>();
  if (!cards.length) return { pos, w: 0, h: 0 };
  const W = Math.max(1, Math.max(...cards.map((c) => c.box.x1)) - Math.min(...cards.map((c) => c.box.x0)));
  const H = Math.max(1, Math.max(...cards.map((c) => c.box.y1)) - Math.min(...cards.map((c) => c.box.y0)));
  const spans = gridOf(cards.map((c) => ({ id: c.id, box: c.box })), W, H);
  // 칸 겹침 정리: gridOf 가 끼워 넣은 사이 행을 여러 행에 걸친 카드가 덮을 수 있다 → 큰 카드부터 칸을 차지하고, 찬 칸이면 빈 곳까지 아래로
  const taken = new Set<string>();
  for (const c of [...cards].sort((a, b) => b.w * b.h - a.w * a.h)) {
    const sp = spans.get(c.id)!, hs = sp.r1 - sp.r0;
    const busy = (r: number) => { for (let i = r; i < r + hs; i++) for (let k = sp.c0; k < sp.c1; k++) if (taken.has(`${i}:${k}`)) return true; return false; };
    let r = sp.r0;
    while (busy(r)) r++;
    spans.set(c.id, { ...sp, r0: r, r1: r + hs });
    for (let i = r; i < r + hs; i++) for (let k = sp.c0; k < sp.c1; k++) taken.add(`${i}:${k}`);
  }
  const ncols = Math.max(...[...spans.values()].map((s) => s.c1)), nrows = Math.max(...[...spans.values()].map((s) => s.r1));
  const colW = Array<number>(ncols).fill(0), rowH = Array<number>(nrows).fill(0);
  for (const c of cards) {
    const s = spans.get(c.id)!;
    for (let k = s.c0; k < s.c1; k++) colW[k] = Math.max(colW[k], c.w / (s.c1 - s.c0));
    for (let k = s.r0; k < s.r1; k++) rowH[k] = Math.max(rowH[k], (c.h + labelMm) / (s.r1 - s.r0));
  }
  const colX: number[] = [], rowY: number[] = [];
  colW.reduce((x, w, k) => { colX[k] = x; return x + w + gap; }, 0);
  rowH.reduce((y, h, k) => { rowY[k] = y; return y + h + gap; }, 0);
  for (const c of cards) { const s = spans.get(c.id)!; pos.set(c.id, { x: colX[s.c0], y: rowY[s.r0] }); }
  const w = colW.reduce((a, b) => a + b, 0) + gap * (ncols - 1), h = rowH.reduce((a, b) => a + b, 0) + gap * (nrows - 1);
  return { pos, w, h, rows: nrows };
}

export function arrangeByAxisGrid(cards: GridCard[], photos: { x: number; y: number; w: number; h: number }[], gap: number, labelMm: number): Map<string, { x: number; y: number }> {
  const out = new Map<string, { x: number; y: number }>();
  const used = [...new Set(cards.map((c) => c.photo).filter((p): p is number => p !== null && !!photos[p]))];
  // 사진 하나의 묶음 블록
  const blocks = new Map<number, Block>();
  for (const p of used) {
    const of = (g: GridCard['group']) => layoutGroup(cards.filter((c) => c.photo === p && c.group === g), gap, labelMm);
    const L = of('left'), F = of('front'), R = of('right'), B = of('bottom');
    const pos = new Map<string, { x: number; y: number }>();
    let x = 0;
    const put = (b: Block, bx: number, by: number) => { for (const [id, q] of b.pos) pos.set(id, { x: q.x + bx, y: q.y + by }); };
    if (L.pos.size) { put(L, 0, 0); x = L.w + gap * 2; }
    const fx = x;
    if (F.pos.size) { put(F, fx, 0); x = fx + F.w + gap * 2; }
    if (R.pos.size) { put(R, x, 0); x += R.w + gap * 2; }
    const topH = Math.max(L.h, F.h, R.h);
    if (B.pos.size) put(B, fx, topH ? topH + gap * 2 : 0);
    const w = Math.max(x - gap * 2, fx + B.w), h = topH + (B.pos.size ? (topH ? gap * 2 : 0) + B.h : 0);
    blocks.set(p, { pos, w, h });
  }
  // 사진 묶음: 사진 행·열 순서로, 되도록 자기 사진 아래(사진의 왼쪽 위치)에 — 앞 묶음과 겹치면 오른쪽, 사진 행이 바뀌면 아래 줄
  const pg = photoGrid(photos);
  const left0 = photos.length ? Math.min(...photos.map((p) => p.x)) : 0; // 모든 사진 중 가장 왼쪽 = 평면 구역 기준 (카드 없는 사진이 앞에 있어도 자기 사진 아래로)
  const order = [...used].sort((a, b) => pg[a].r - pg[b].r || photos[a].x - photos[b].x);
  let row = -1, rowTop = 0, rowBottom = 0, right = -Infinity, bottom = 0;
  for (const p of order) {
    const b = blocks.get(p)!;
    if (pg[p].r !== row) { if (row !== -1) rowTop = rowBottom + gap * 2; row = pg[p].r; right = -Infinity; }
    const bx = Math.max(photos[p].x - left0, right === -Infinity ? -Infinity : right + gap * 2, 0);
    for (const [id, q] of b.pos) out.set(id, { x: Math.round(q.x + bx), y: Math.round(q.y + rowTop) });
    right = bx + b.w;
    rowBottom = Math.max(rowBottom, rowTop + b.h);
    bottom = Math.max(bottom, rowBottom);
  }
  let x = 0;
  const y = out.size ? bottom + gap * 2 : 0;
  for (const c of cards.filter((i) => i.photo === null || !photos[i.photo])) { out.set(c.id, { x, y }); x += c.w + gap; }
  return out;
}
