// 칼선 SVG 내려받기 (2026-11-05 roadmap 10-2) — 보드 평면 구역 카드 배치 그대로, 사인물마다 입체 글자·벡터의 윤곽을 실물 1:1(mm)로. → docs/features/cut-lines.md
import { app } from './state.svelte';
import { cutItems, cutSvg, shapePathD, textCutShapes, type CutCard } from './core/cutlines';
import { loadFont } from './core/textShapes';
import { loadItemVectors } from './render/itemImages';
import fontUrl from 'pretendard/dist/public/static/Pretendard-Bold.otf?url';

/** 칼선 SVG 와 칼선이 있는 사인물 수 */
export async function buildCutSvg(): Promise<{ svg: string; count: number }> {
  const font = await loadFont(fontUrl);
  const cards: CutCard[] = [];
  let count = 0;
  for (const { o, w, h, placeholder } of app.flatCards) {
    if (placeholder) continue;
    const p = app.flatPlaced.get(o.id);
    if (!p) continue;
    const items = cutItems(o);
    const vectors = items.some((i) => i.vector) ? await loadItemVectors(o, app.sources) : {};
    // 추정 크기 카드는 그 크기에 맞춰 (3D composedOf 와 같은 축척)
    const sx = w / (o.widthMm || w), sy = h / (o.heightMm || h);
    const paths = items.map((it) => {
      const shapes = it.vector ? vectors[it.id] ?? [] : textCutShapes(font, it.text ?? '', { w: it.w, h: it.h }, it.letterSpacing);
      return shapePathD(shapes, ([x, y]) => [p.x + w / 2 + (it.x + x) * sx, p.y + h / 2 - (it.y + y) * sy]);
    }).filter(Boolean);
    if (paths.length) count++;
    cards.push({ id: o.id, name: o.name, x: p.x, y: p.y, w, h, paths });
  }
  const title = app.access.status === 'ok' ? app.access.projectName : '간판다';
  return { svg: cutSvg(title, cards), count };
}
