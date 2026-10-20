// 사진 보드 카드 정렬 — 그리드 (2026-10-20 사용자: "엑셀의 그리드로 설명하면 구조의 최대 블록을 생성하고 해당 그림의 위치를 다시 그리는데 차지하는 면적에 따라 병합한 위치에 사진을 둘수 있다.
// 축들이 완성되면 축 덩어리를 나열하고 다시 사진 단위로 배치한다. 사진이 2열이면 정면도 카드 사진그룹도 2열로 배열한다." → "그리드 방식으로 진행해줘").
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
  const xs = axisLines(items.flatMap((i) => [i.box.x0, i.box.x1]), imgW * tol);
  const ys = axisLines(items.flatMap((i) => [i.box.y0, i.box.y1]), imgH * tol);
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

/** 보드의 사진 배치(왼쪽 위 x·y, 폭·높이) → 행·열: 위 끝이 높이의 절반 안이면 같은 행, 왼쪽 끝이 폭의 절반 안이면 같은 열 */
export function photoGrid(photos: { x: number; y: number; w: number; h: number }[]): { r: number; c: number }[] {
  if (!photos.length) return [];
  const w = Math.min(...photos.map((p) => p.w)), h = Math.min(...photos.map((p) => p.h));
  const cols = axisLines(photos.map((p) => p.x), w / 2), rows = axisLines(photos.map((p) => p.y), h / 2);
  return photos.map((p) => ({ r: nearest(rows, p.y), c: nearest(cols, p.x) }));
}

/** 줄(열·행)마다 크기: 한 칸짜리의 최대, 병합 카드가 더 크면 모자란 만큼 그 칸들에 고르게 */
function trackSizes(n: number, spans: { a: number; b: number; size: number }[], gap: number): number[] {
  const out = new Array(n).fill(0);
  for (const s of spans) if (s.b - s.a === 1) out[s.a] = Math.max(out[s.a], s.size);
  for (const s of [...spans].filter((x) => x.b - x.a > 1).sort((p, q) => p.b - p.a - (q.b - q.a))) {
    const have = out.slice(s.a, s.b).reduce((t, v) => t + v, 0) + gap * (s.b - s.a - 1);
    if (have < s.size) { const add = (s.size - have) / (s.b - s.a); for (let k = s.a; k < s.b; k++) out[k] += add; }
  }
  return out;
}
const starts = (sizes: number[], gap: number) => sizes.reduce<number[]>((acc, _s, i) => [...acc, i ? acc[i - 1] + sizes[i - 1] + gap : 0], []);

/**
 * 카드 정렬: 사진마다 gridOf 로 셀을 정하고, 열 너비·행 높이 = 그 칸 카드의 최대 실제 크기(mm, 행은 이름 줄 labelMm 포함), 카드는 병합 셀 가운데.
 * 사진 묶음은 보드의 사진 배치 그대로 행·열(photoGrid) — 묶음 열의 왼쪽 = 그 열 사진의 왼쪽(넘치면 오른쪽으로), 행은 위에서부터, 묶음 사이 간격 두 배.
 * photos 의 x·y·w·h 는 평면 mm(보드 px ÷ 축척, 평면 원점 기준). 사진 없는 카드는 모두의 아래 한 줄
 */
export function arrangeGrid(cards: { id: string; w: number; h: number; photo: number | null; box: Box }[], photos: { x: number; y: number; w: number; h: number; imgW: number; imgH: number }[], gap: number, labelMm: number, tol = 0.03): Map<string, { x: number; y: number }> {
  const out = new Map<string, { x: number; y: number }>();
  const pg = photoGrid(photos);
  const blocks = new Map<number, { w: number; h: number; at: Map<string, { x: number; y: number }> }>();
  for (const p of [...new Set(cards.map((c) => c.photo).filter((x): x is number => x !== null && !!photos[x]))]) {
    const g = cards.filter((c) => c.photo === p);
    const spans = gridOf(g.map((c) => ({ id: c.id, box: c.box })), photos[p].imgW, photos[p].imgH, tol);
    const nC = Math.max(...[...spans.values()].map((s) => s.c1)), nR = Math.max(...[...spans.values()].map((s) => s.r1));
    const colW = trackSizes(nC, g.map((c) => ({ a: spans.get(c.id)!.c0, b: spans.get(c.id)!.c1, size: c.w })), gap);
    const rowH = trackSizes(nR, g.map((c) => ({ a: spans.get(c.id)!.r0, b: spans.get(c.id)!.r1, size: c.h + labelMm })), gap);
    const cx = starts(colW, gap), ry = starts(rowH, gap);
    const at = new Map<string, { x: number; y: number }>();
    for (const c of g) {
      const s = spans.get(c.id)!;
      const sw = cx[s.c1 - 1] + colW[s.c1 - 1] - cx[s.c0], sh = ry[s.r1 - 1] + rowH[s.r1 - 1] - ry[s.r0];
      at.set(c.id, { x: cx[s.c0] + (sw - c.w) / 2, y: ry[s.r0] + (sh - c.h - labelMm) / 2 });
    }
    blocks.set(p, { w: cx[nC - 1] + colW[nC - 1], h: ry[nR - 1] + rowH[nR - 1], at });
  }
  // 사진 묶음: 사진 배치의 행·열 그대로
  const used = [...blocks.keys()];
  const nC = Math.max(0, ...used.map((p) => pg[p].c + 1)), nR = Math.max(0, ...used.map((p) => pg[p].r + 1));
  const bw = new Array(nC).fill(0), bh = new Array(nR).fill(0);
  for (const p of used) { bw[pg[p].c] = Math.max(bw[pg[p].c], blocks.get(p)!.w); bh[pg[p].r] = Math.max(bh[pg[p].r], blocks.get(p)!.h); }
  // 묶음 열의 왼쪽 = 그 열 사진들의 왼쪽(사진 바로 아래 — 어느 사진의 카드인지 보이게), 앞 열이 넘어오면 간격 두 배를 두고 오른쪽으로
  const colLeft = new Array(nC).fill(Infinity);
  for (const p of used) colLeft[pg[p].c] = Math.min(colLeft[pg[p].c], photos[p].x);
  const bx: number[] = [];
  for (let c = 0; c < nC; c++) bx.push(Math.max(Number.isFinite(colLeft[c]) ? colLeft[c] : -Infinity, c ? bx[c - 1] + bw[c - 1] + gap * 2 : -Infinity));
  if (!Number.isFinite(bx[0])) bx[0] = 0;
  const by = starts(bh, gap * 2);
  for (const p of used) for (const [id, a] of blocks.get(p)!.at) out.set(id, { x: Math.round(bx[pg[p].c] + a.x), y: Math.round(by[pg[p].r] + a.y) });
  let x = 0;
  const y = used.length ? by[nR - 1] + bh[nR - 1] + gap * 2 : 0;
  for (const c of cards.filter((i) => i.photo === null || !photos[i.photo])) { out.set(c.id, { x, y }); x += c.w + gap; }
  return out;
}
