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
    const want = cards.filter((c) => c.photo === p).map((c) => ({ c, x: ph.x - left0 + ((c.box.x0 + c.box.x1) / 2) * sx - c.w / 2, y: ph.y + ((c.box.y0 + c.box.y1) / 2) * sy - c.h / 2 }));
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
