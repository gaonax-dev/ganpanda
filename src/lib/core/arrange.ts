// 사진 보드 카드 정렬 (2026-10-20 사용자: "사진보드의 사인물 카드를 자동으로 정렬하고 싶다 … 재정렬하면 위의 상태로 다시 배열 사용자는 언제든 카드를 자유롭게 배열한다. 상단 버튼에 카드 간격 + - 도 추가"
// → "카드 배치가 우선 사진 배치의 위치를 유지한다. 현재는 가로로 사진이 1장씩있다. 그리고 사진안의 사인물 배열을 한다. 위치는 1열 층 2열 층으로 정렬한다.")
// 결과 좌표는 리스트 배치와 같은 mm (listX/listY, 왼쪽 위 기준, 아래로 +). 정렬은 [재정렬]을 누를 때만 — 그 뒤로 카드는 자유롭게 옮긴다

export interface Box { x0: number; y0: number; x1: number; y1: number }

/**
 * 사진 안 사인물(사진 px 외곽선 범위, 아래로 +)을 층별 줄로: 높이 가운데가 아래인 것부터 줄을 세우고, 줄의 기준(처음 사인물)의 세로 범위 안에
 * 가운데가 들어오면 같은 층. 1열 = 가장 아래 층. 줄 안은 왼쪽부터. 여러 층에 걸친 긴 사인물이 기준이 되지 않게 낮은(키 작은) 것부터 기준을 잡는다
 */
export function floorRows(items: ({ id: string } & Box)[]): string[][] {
  const cy = (b: Box) => (b.y0 + b.y1) / 2;
  const rows: { seed: Box; items: ({ id: string } & Box)[] }[] = [];
  for (const it of [...items].sort((a, b) => (a.y1 - a.y0) - (b.y1 - b.y0) || cy(b) - cy(a))) {
    const row = rows.find((r) => cy(it) >= r.seed.y0 && cy(it) <= r.seed.y1);
    if (row) row.items.push(it); else rows.push({ seed: it, items: [it] });
  }
  return rows.sort((a, b) => cy(b.seed) - cy(a.seed)).map((r) => r.items.sort((a, b) => (a.x0 + a.x1) / 2 - (b.x0 + b.x1) / 2).map((i) => i.id));
}

/**
 * 카드 묶음을 각 사진 아래에: 묶음 왼쪽 = 그 사진의 가로 자리(photoX[사진 순번], mm), 앞 묶음이 넘어오면 간격 두 배를 두고 오른쪽으로.
 * 묶음 안 = 층별 줄(floorRows) — 1열(아래 층)이 위, 줄 안 왼쪽부터 gap 간격. 사진 없는 카드(photo = null)는 모든 묶음 아래 한 줄
 */
export function arrangeUnderPhotos(cards: { id: string; w: number; h: number; photo: number | null; box: Box }[], photoX: number[], gap: number): Map<string, { x: number; y: number }> {
  const out = new Map<string, { x: number; y: number }>();
  let right = -Infinity, bottom = 0;
  const photos = [...new Set(cards.map((c) => c.photo).filter((p): p is number => p !== null))].sort((a, b) => (photoX[a] ?? 0) - (photoX[b] ?? 0));
  for (const p of photos) {
    const g = cards.filter((c) => c.photo === p);
    const x0 = Math.max(photoX[p] ?? 0, right === -Infinity ? -Infinity : right + gap * 2);
    let y = 0, blockRight = x0;
    for (const row of floorRows(g.map((c) => ({ id: c.id, ...c.box })))) {
      let x = x0, rowH = 0;
      for (const id of row) {
        const c = g.find((i) => i.id === id)!;
        out.set(id, { x, y });
        x += c.w + gap;
        rowH = Math.max(rowH, c.h);
        blockRight = Math.max(blockRight, x - gap);
      }
      y += rowH + gap;
    }
    right = blockRight;
    bottom = Math.max(bottom, y - gap);
  }
  let x = 0;
  const y = photos.length ? bottom + gap * 2 : 0;
  for (const c of cards.filter((i) => i.photo === null)) { out.set(c.id, { x, y }); x += c.w + gap; }
  return out;
}
