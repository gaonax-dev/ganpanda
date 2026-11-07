// 일러스트 패스 → 입체 윤곽 (2026-11-05 사용자: "일러스트 패스로 입체 사인물이 가능한가?" → "내가 디자이너야 사인물에 각각의 디자인이 연결되어야해 …
// 후렉스(인쇄) 위에 체널(입체), 스카시(입체+ 시트 또는 도색)의 구성이라면 일러스트 레이어를 생성하고 이걸 내보내서 자동으로 간판다에서 보여질 수 있게").
// 일러스트 스크립트가 구성 요소 레이어를 대지 크기 SVG(글자는 윤곽선)로 내보낸다 → 채운 패스를 사인물 상자(mm, 가운데 원점·위 +)의 THREE.Shape 로.
// 채널·스카시는 이 윤곽을 재료 층 두께만큼 밀어낸다(sim/signs.ts channelGeometry). 선만 있는 패스는 뺀다(입체가 안 됨 — 일러스트에서 "확장"). → docs/features/illustrator.md
import * as THREE from 'three';
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js';

/** SVG 크기(viewBox, 없으면 width·height) */
function svgBox(text: string): { x: number; y: number; w: number; h: number } | null {
  const vb = /viewBox\s*=\s*"([^"]+)"/.exec(text);
  if (vb) { const n = vb[1].trim().split(/[\s,]+/).map(Number); if (n.length === 4 && n.every(Number.isFinite) && n[2] > 0 && n[3] > 0) return { x: n[0], y: n[1], w: n[2], h: n[3] }; }
  const w = /<svg[^>]*\swidth\s*=\s*"([\d.]+)/.exec(text), h = /<svg[^>]*\sheight\s*=\s*"([\d.]+)/.exec(text);
  return w && h ? { x: 0, y: 0, w: Number(w[1]), h: Number(h[1]) } : null;
}

/** 곡선 나누기 (점 수) — 간판 크기에서 매끈하게, 너무 무겁지 않게 */
const DIVISIONS = 12;

/** SVG(대지 크기) → 상자 box(mm) 안의 윤곽들. 가운데 원점, 위 + */
/** 윤곽의 원본 채움색 (#rrggbb, 2026-11-07) — three Shape 에 자리가 없어 따로 */
const SHAPE_COLOR = new WeakMap<THREE.Shape, string>();
export const shapeColor = (s: THREE.Shape): string | undefined => SHAPE_COLOR.get(s);
export const setShapeColor = (s: THREE.Shape, c: string) => void SHAPE_COLOR.set(s, c);

export function svgShapes(text: string, box: { w: number; h: number }): THREE.Shape[] {
  const vb = svgBox(text);
  if (!vb) return [];
  const data = new SVGLoader().parse(text);
  const sx = box.w / vb.w, sy = box.h / vb.h;
  const map = (p: THREE.Vector2) => new THREE.Vector2((p.x - vb.x) * sx - box.w / 2, box.h / 2 - (p.y - vb.y) * sy);
  const out: THREE.Shape[] = [];
  for (const path of data.paths) {
    const fill = (path.userData?.style as { fill?: string } | undefined)?.fill;
    if (fill === 'none' || fill === 'transparent') continue;
    // 채움을 적은 패스는 원본 색 — 3D 앞면이 따른다 (2026-11-07 "추출한 패스의 컬러는 원본에 따르게 해야됨"). 안 적으면 구성 요소 색
    const node = (path.userData as { node?: Element } | undefined)?.node;
    const said = !!node && (node.hasAttribute('fill') || /fill\s*:/.test(node.getAttribute('style') ?? ''));
    const color = said && path.color ? '#' + path.color.getHexString() : undefined;
    for (const s of SVGLoader.createShapes(path)) {
      // y 를 뒤집으면 감기는 방향이 바뀐다 — 점을 옮겨 새 윤곽으로 (구멍도)
      const shape = new THREE.Shape(s.getPoints(DIVISIONS).map(map));
      shape.holes = s.holes.map((h) => new THREE.Path(h.getPoints(DIVISIONS).map(map)));
      if (color) SHAPE_COLOR.set(shape, color);
      if (shape.getPoints().length >= 3) out.push(shape);
    }
  }
  return out;
}
