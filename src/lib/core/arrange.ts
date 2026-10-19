// 사진 보드 카드 자동 정렬 (2026-10-20 사용자: "사진보드의 사인물 카드를 자동으로 정렬하고 싶다. 우선 사진순서로 소속 카드들을 배치하고 순서는 사진에서의 순서와 위치로 …
// 재정렬하면 위의 상태로 다시 배열 사용자는 언제든 카드를 자유롭게 배열한다. 상단 버튼에 카드 간격 + - 도 추가" → "사진의 구도대로 평면화 하고 여기에서 축이 다른 경우도 평면으로 펴서 카드가 정렬되게")
// 결과 좌표는 리스트 배치와 같은 mm (listX/listY, 왼쪽 위 기준, 아래로 +). 사용자는 정렬 뒤에도 카드를 자유롭게 옮긴다 — 정렬은 [재정렬]을 누를 때만
import type { Pt } from './homography';

type V3 = [number, number, number];

/**
 * 벽 좌표(가로 X, 높이 H, 벽 밖 D — 원근 설정의 벽 프레임) 점을 벽 평면(X, H)으로 편다.
 * y(벽면) 그대로 · x(벽에 직각인 세로면 — 돌출 간판) 벽에 붙은 세로선을 축으로 돌려 벽에서 나온 만큼 옆(+X)으로 ·
 * z(수평면 — 어닝 아랫면 등) 벽에 붙은 가로선을 축으로 접어 벽에서 나온 만큼 아래(−H)로
 */
export function unfold(points: V3[], axis: 'x' | 'y' | 'z'): Pt[] {
  return points.map(([x, h, d]) => (axis === 'x' ? [x + Math.abs(d), h] : axis === 'z' ? [x, h - Math.abs(d)] : [x, h]) as Pt);
}

/**
 * 한 사진의 카드를 구도대로: 펴진 중심(cx, cy — mm, 위가 +)에 입력 크기(w×h)로 놓고, 왼쪽 위를 (0,0)·아래로 + 로 옮긴다.
 * 겹치는 카드는 간격(gap)을 두고 오른쪽으로 민다(겹친 채로는 고르기·끌기가 어렵다)
 */
export function composeBlock(cards: { id: string; w: number; h: number; cx: number; cy: number }[], gap: number): Map<string, { x: number; y: number }> {
  const out = new Map<string, { x: number; y: number }>();
  if (!cards.length) return out;
  const left = Math.min(...cards.map((c) => c.cx - c.w / 2)), top = Math.max(...cards.map((c) => c.cy + c.h / 2));
  const placed: { x: number; y: number; w: number; h: number }[] = [];
  // 큰 카드부터 자리를 잡는다 (판 위의 글자처럼 겹친 작은 것이 밀려난다), 같으면 왼쪽부터
  for (const c of [...cards].sort((a, b) => b.w * b.h - a.w * a.h || a.cx - b.cx)) {
    const r = { x: c.cx - c.w / 2 - left, y: top - (c.cy + c.h / 2), w: c.w, h: c.h };
    for (let guard = 0; guard < 200; guard++) {
      const hit = placed.find((p) => r.x < p.x + p.w + gap && p.x < r.x + r.w + gap && r.y < p.y + p.h && p.y < r.y + r.h);
      if (!hit) break;
      r.x = hit.x + hit.w + gap;
    }
    placed.push(r);
    out.set(c.id, { x: Math.round(r.x), y: Math.round(r.y) });
  }
  return out;
}

/**
 * 사진 순서(photo = 보드의 사진 순번, null = 사진 없는 카드 → 끝)대로 묶음을 위에서 아래로. 묶음 = 구도대로 편 카드(composeBlock),
 * 펴지 못한 카드(at = null)는 그 묶음 아래에 한 줄씩(rowWidth 를 넘으면 다음 줄). 카드 사이 gap, 사진이 바뀔 때 gap 두 배
 */
export function arrangeByPhotos(cards: { id: string; w: number; h: number; photo: number | null; at: { cx: number; cy: number } | null }[], gap: number, rowWidth: number): Map<string, { x: number; y: number }> {
  const out = new Map<string, { x: number; y: number }>();
  const groups = new Map<number, typeof cards>();
  for (const c of cards) { const k = c.photo ?? Number.MAX_SAFE_INTEGER; groups.set(k, [...(groups.get(k) ?? []), c]); }
  let y = 0, first = true;
  for (const k of [...groups.keys()].sort((a, b) => a - b)) {
    const g = groups.get(k)!;
    if (!first) y += gap; // 사진이 바뀌면 간격 두 배 (앞 묶음 끝의 gap + 하나 더)
    first = false;
    const comp = g.filter((c) => c.at);
    const block = composeBlock(comp.map((c) => ({ id: c.id, w: c.w, h: c.h, cx: c.at!.cx, cy: c.at!.cy })), gap);
    let bottom = y;
    for (const c of comp) { const p = block.get(c.id)!; out.set(c.id, { x: p.x, y: y + p.y }); bottom = Math.max(bottom, y + p.y + c.h + gap); }
    y = comp.length ? bottom : y;
    let x = 0, rowH = 0;
    const rest = g.filter((c) => !c.at);
    for (const c of rest) {
      if (x > 0 && x + c.w > rowWidth) { x = 0; y += rowH + gap; rowH = 0; }
      out.set(c.id, { x, y });
      x += c.w + gap;
      rowH = Math.max(rowH, c.h);
    }
    if (rest.length) y += rowH + gap;
  }
  return out;
}
