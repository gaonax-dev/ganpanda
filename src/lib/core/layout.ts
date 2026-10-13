// 사인물 리스트 뷰(실측 전개도) 자동 배치 — 선반(shelf) 방식
export interface LayoutItem { id: string; w: number; h: number; x?: number; y?: number }
export interface Placed { x: number; y: number; w: number; h: number }

export function layoutList(items: LayoutItem[], gap = 600, rowWidth = 12000): Map<string, Placed> {
  const out = new Map<string, Placed>();
  let top = 0;
  for (const it of items) {
    if (it.x === undefined || it.y === undefined) continue;
    out.set(it.id, { x: it.x, y: it.y, w: it.w, h: it.h });
    top = Math.max(top, it.y + it.h + gap);
  }
  let x = 0, y = top, rowH = 0;
  for (const it of items) {
    if (out.has(it.id)) continue;
    if (x > 0 && x + it.w > rowWidth) { x = 0; y += rowH + gap; rowH = 0; }
    out.set(it.id, { x, y, w: it.w, h: it.h });
    x += it.w + gap;
    rowH = Math.max(rowH, it.h);
  }
  return out;
}
