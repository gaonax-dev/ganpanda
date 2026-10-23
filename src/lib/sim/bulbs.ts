// 글자 안의 격자 점 (2026-10-23 채널 빛 L3): 벌브 전구 자리 · 까치발 받침 자리.
// 윤곽(바깥 + 구멍)은 짝홀 규칙, 가장자리에서 margin 이상 떨어진 점만. 하나도 없으면 안쪽 점 하나(가장 가장자리에서 먼 격자 점) — 작은 글자도 받침·전구 하나
type Pt = [number, number];

function inside(polys: Pt[][], x: number, y: number): boolean {
  let c = false;
  for (const poly of polys) for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
function edgeDist(polys: Pt[][], x: number, y: number): number {
  let d = Infinity;
  for (const poly of polys) for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [ax, ay] = poly[j], [bx, by] = poly[i];
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
    const t = l2 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2)) : 0;
    d = Math.min(d, Math.hypot(x - ax - t * dx, y - ay - t * dy));
  }
  return d;
}

/** step 간격 격자 중 윤곽 안, 가장자리에서 margin 이상인 점 */
export function insidePoints(polys: Pt[][], step: number, margin: number): Pt[] {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of polys) for (const [x, y] of p) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  if (!(step > 0) || !Number.isFinite(x0)) return [];
  const out: Pt[] = [];
  let best: Pt | null = null, bestD = 0;
  // 격자를 가운데 맞춤 — 남는 폭을 양쪽에 나눈다
  const ox = x0 + (((x1 - x0) % step) / 2), oy = y0 + (((y1 - y0) % step) / 2);
  const fine = Math.max(step / 4, (x1 - x0) / 40, (y1 - y0) / 40);
  for (let y = oy; y <= y1; y += step) for (let x = ox; x <= x1; x += step) {
    if (!inside(polys, x, y)) continue;
    const d = edgeDist(polys, x, y);
    if (d >= margin) out.push([x, y]);
  }
  if (out.length) return out;
  for (let y = y0 + fine / 2; y <= y1; y += fine) for (let x = x0 + fine / 2; x <= x1; x += fine) {
    if (!inside(polys, x, y)) continue;
    const d = edgeDist(polys, x, y);
    if (d > bestD) { bestD = d; best = [x, y]; }
  }
  return best ? [best] : [];
}

/**
 * 벌브 전구 자리: 고운 격자 후보를 가장자리에서 먼 것(획 가운데)부터 골라, 이미 고른 것과 pitch 이상 떨어진 것만.
 * 획 가운데 줄을 따라 간격대로 늘어서고, 굵은 곳은 여러 줄 (2026-10-23 — 격자만으로는 전구가 듬성했다)
 */
export function spacedPoints(polys: Pt[][], pitch: number, margin: number): Pt[] {
  const cand = insidePoints(polys, pitch / 4, margin).map((p) => ({ p, d: edgeDist(polys, p[0], p[1]) })).sort((a, b) => b.d - a.d);
  const out: Pt[] = [];
  const p2 = pitch * pitch - 1e-6;
  for (const { p } of cand) if (out.every((q) => (q[0] - p[0]) ** 2 + (q[1] - p[1]) ** 2 >= p2)) out.push(p);
  return out;
}
