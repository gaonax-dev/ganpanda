// 글자 없는 시트 = 올라간 면 전체 (2026-10-22 사용자: "시트 2d 3d에서 안나온다").
// 큰시트·폴딩시트(컷팅 없음)·안개 시트처럼 글자·그림 없이 면에 통째로 붙이는 시트는 그릴 객체가 없어 2D·3D 에 안 나왔다.
// 그릴 때만(저장하지 않음) 올라간 면을 덮는 사각 도형 객체를 하나 넣는다 — 프레임 면이면 사인물 전체, 구성 요소 위면 그 글자·그림 자리.
import type { PartItem, SignObject, SignPart } from './model';
import { componentOf } from './components';
import { itemBox } from './frontView';
import { partsOf } from './parts';

export function withSheetAreas(o: SignObject, parts: SignPart[] = partsOf(o)): SignPart[] {
  const W = o.widthMm, H = o.heightMm;
  if (!(W && W > 0 && H && H > 0)) return parts;
  return parts.map((p) => {
    const fill = componentOf(p.kind).areaFill?.(p);
    if (!fill || p.items.length) return p;
    const host = p.on && p.on !== 'frame' ? parts.find((x) => x.id === p.on) : undefined;
    let box = { x: 0, y: 0, w: W, h: H };
    if (host?.items.length) {
      const bs = host.items.map(itemBox);
      const x0 = Math.min(...bs.map((b) => b.x - b.w / 2)), x1 = Math.max(...bs.map((b) => b.x + b.w / 2));
      const y0 = Math.min(...bs.map((b) => b.y - b.h / 2)), y1 = Math.max(...bs.map((b) => b.y + b.h / 2));
      box = { x: (x0 + x1) / 2, y: (y0 + y1) / 2, w: x1 - x0, h: y1 - y0 };
    }
    const area: PartItem = { id: `${p.id}:area`, kind: 'shape', shape: 'rect', fill, ...box };
    return { ...p, items: [area] };
  });
}

/** 사진 위(2D)에 그릴 구성 요소가 있나: 글자·그림이 있는 구성 요소, 또는 면 전체 시트 (옛 시트 sheetIds 포함) */
export function hasPartsToDraw(o: SignObject): boolean {
  if (o.parts?.some((p) => p.items.length)) return true;
  return partsOf(o).some((p) => !p.items.length && !!componentOf(p.kind).areaFill?.(p));
}
