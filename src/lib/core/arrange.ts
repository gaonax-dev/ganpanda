// 사진 보드 카드 정렬 (2026-10-20 사용자: "사진보드의 사인물 카드를 자동으로 정렬하고 싶다 … 재정렬하면 위의 상태로 다시 배열 사용자는 언제든 카드를 자유롭게 배열한다. 상단 버튼에 카드 간격 + - 도 추가"
// → "카드 배치가 우선 사진 배치의 위치를 유지한다 …" → "사진보드의 사진과 사인물 배치 그리고 카드 정렬을 비교해 최대한 같은 위치로 인식되도록 구성해줘")
// 결과 좌표는 리스트 배치와 같은 mm (listX/listY, 왼쪽 위 기준, 아래로 +). 정렬은 [재정렬]을 누를 때만 — 그 뒤로 카드는 자유롭게 옮긴다

export interface Box { x0: number; y0: number; x1: number; y1: number }
interface Rect { x: number; y: number; w: number; h: number }

/**
 * 카드를 사진 속 사인물 자리 그대로: 사진을 보드에서의 폭(photos[i].w mm, 왼쪽 photos[i].x mm)으로 옮겼을 때의 사인물 가운데에 카드 가운데를 둔다 —
 * 사진 바로 아래에 같은 배치가 한 번 더 있는 것처럼 보인다(왼쪽 사인물은 왼쪽, 위 사인물은 위). 묶음(사진)마다 맨 위를 0 으로.
 * 카드는 실제 mm 크기라 사진 속 넓이와 다르므로 겹치면 큰 카드부터 자리를 잡고, 겹친 카드는 오른쪽·왼쪽·아래·위 중 덜 움직이는 쪽으로 간격(gap)을 두고 비킨다.
 * 카드 아래 이름 줄(labelMm)도 겹침으로 친다. 앞 묶음이 다음 사진 자리를 넘으면 그 묶음을 오른쪽으로 민다. 사진 없는 카드(photo = null)는 모두의 아래 한 줄
 */
export function arrangeLikePhotos(cards: { id: string; w: number; h: number; photo: number | null; box: Box }[], photos: { x: number; w: number; imgW: number }[], gap: number, labelMm: number): Map<string, { x: number; y: number }> {
  const out = new Map<string, { x: number; y: number }>();
  const order = [...new Set(cards.map((c) => c.photo).filter((p): p is number => p !== null && !!photos[p]))].sort((a, b) => photos[a].x - photos[b].x);
  let right = -Infinity, bottom = 0;
  for (const p of order) {
    const ph = photos[p], s = ph.w / ph.imgW;
    const g = cards.filter((c) => c.photo === p);
    const want = g.map((c) => ({ c, x: ph.x + ((c.box.x0 + c.box.x1) / 2) * s - c.w / 2, y: ((c.box.y0 + c.box.y1) / 2) * s - c.h / 2 }));
    const top = Math.min(...want.map((t) => t.y));
    const placed: (Rect & { id: string })[] = [];
    for (const t of [...want].sort((a, b) => b.c.w * b.c.h - a.c.w * a.c.h || a.x - b.x)) {
      const r = { id: t.c.id, x: t.x, y: t.y - top, w: t.c.w, h: t.c.h + labelMm };
      for (let guard = 0; guard < 300; guard++) {
        const hit = placed.find((q) => r.x < q.x + q.w + gap && q.x < r.x + r.w + gap && r.y < q.y + q.h + gap && q.y < r.y + r.h + gap);
        if (!hit) break;
        // 오른쪽·왼쪽·아래·위 중 가장 덜 움직이는 쪽 (사진에서 왼쪽에 있던 카드가 오른쪽 아래로 멀리 밀려나지 않게)
        const moves: [number, number][] = [[hit.x + hit.w + gap - r.x, 0], [hit.x - gap - (r.x + r.w), 0], [0, hit.y + hit.h + gap - r.y], [0, hit.y - gap - (r.y + r.h)]];
        const [mx, my] = moves.reduce((m, v) => (Math.abs(v[0]) + Math.abs(v[1]) < Math.abs(m[0]) + Math.abs(m[1]) ? v : m));
        r.x += mx; r.y += my;
      }
      placed.push(r);
    }
    // 위로 비킨 카드가 있으면 묶음 맨 위를 다시 0 으로
    const minY = Math.min(...placed.map((q) => q.y));
    for (const q of placed) q.y -= minY;
    // 앞 묶음과 겹치면 이 묶음 전체를 오른쪽으로
    const left = Math.min(...placed.map((q) => q.x));
    const shift = right === -Infinity ? 0 : Math.max(0, right + gap * 2 - left);
    for (const q of placed) out.set(q.id, { x: Math.round(q.x + shift), y: Math.round(q.y) });
    right = Math.max(...placed.map((q) => q.x + q.w)) + shift;
    bottom = Math.max(bottom, ...placed.map((q) => q.y + q.h));
  }
  let x = 0;
  const y = order.length ? bottom + gap * 2 : 0;
  for (const c of cards.filter((i) => i.photo === null || !photos[i.photo])) { out.set(c.id, { x, y }); x += c.w + gap; }
  return out;
}
