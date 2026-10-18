// 레이어 트리 — 레이어 구조 1단계 (2026-10-18 결정: "0,1, 몸통도 프레임 레이어"; 설계 docs/architecture/composition-layers.md).
// 레이어 = "어디에, 어떤 순서로, 무엇 위에"(부모 기준 mm 상자·자식·보이기·잠금). 무엇을 어떻게 만드나는 종류 모듈(core/components).
// 1단계 저장 규칙: 사인물 = 프레임 레이어(루트 = SignObject 자체: 종류·옵션·치수·두께가 곧 프레임 spec). 그 자식 트리를 `SignObject.layers` 에 저장하고,
// 펼친 옛 형식 `parts` 를 **거울**로 함께 쓴다 — 기존 화면·견적·3D 는 parts 를 그대로 읽고, 트리를 아는 코드는 layersOf() 를 읽는다.
// 옛 클라이언트가 parts 만 고치면 layers 가 뒤처지므로, layers 는 parts 와 같을 때만 믿고 아니면 parts 에서 다시 만든다(layersOf).
import type { Layer, PartItem, SignObject, SignPart } from './model';
import { componentKinds, componentOf } from './components';

export const FRAME_ID = 'frame';
/** 내용 객체 종류 (글자·그림) — 구성 요소 종류는 레지스트리 */
export const ITEM_KINDS = ['text', 'image'] as const;
export type LayerBox = Layer['box'];
const FILL: LayerBox = { x: 0, y: 0, w: 0, h: 0 }; // w·h 0 = 부모 전체(채움)

const isPartKind = (kind: string) => (componentKinds() as string[]).includes(kind);
const isItemKind = (kind: string) => (ITEM_KINDS as readonly string[]).includes(kind);

/** 내용 객체 → 레이어 (좌표는 부모 기준 — 구성 요소는 프레임을 채우므로 간판 중심 기준 값 그대로) */
function itemLayer(it: PartItem): Layer {
  const spec: Record<string, unknown> = it.kind === 'text' ? { text: it.text ?? '', ...(it.count ? { count: it.count } : {}) } : { ...(it.image ? { image: it.image } : {}) };
  return { id: it.id, kind: it.kind, spec, box: { x: it.x, y: it.y, w: it.w ?? 0, h: it.h }, children: [] };
}
function partLayer(p: SignPart, parts: SignPart[], seen: Set<string>): Layer {
  seen.add(p.id);
  const kids = parts.filter((q) => q.on === p.id && !seen.has(q.id)); // 이 위에 올라온 것(시트)
  return {
    id: p.id, kind: p.kind, spec: { type: p.type, ...(p.options ?? {}) }, box: { ...FILL },
    children: [...p.items.map(itemLayer), ...kids.map((q) => partLayer(q, parts, seen))],
  };
}
/** 펼친 구성 요소(parts, on 으로 올린 곳) → 레이어 트리 (프레임의 자식들). 순서는 parts 순서, 올라간 것은 그 부모 아래로 */
export function fromParts(parts: SignPart[]): Layer[] {
  const ids = new Set(parts.map((p) => p.id));
  const seen = new Set<string>();
  const roots = parts.filter((p) => !p.on || p.on === FRAME_ID || !ids.has(p.on)); // 없는 id 위는 프레임 면으로
  return roots.map((p) => partLayer(p, parts, seen));
}

/** 레이어 트리 → 펼친 구성 요소 (on = 부모 구성 요소 id, 프레임 바로 아래면 'frame' — 올라가는 종류일 때만). 좌표는 부모 오프셋을 더해 간판 중심 기준으로 */
export function toParts(layers: Layer[]): SignPart[] {
  const out: SignPart[] = [];
  const walk = (ls: Layer[], parent: Layer | null, ox: number, oy: number) => {
    for (const l of ls) {
      if (!isPartKind(l.kind)) continue; // 내용 객체는 부모 구성 요소가 거둔다
      const { type, ...options } = l.spec as { type?: string } & Record<string, string | boolean>;
      const items: PartItem[] = l.children.filter((c) => isItemKind(c.kind)).map((c) => {
        const s = c.spec as { text?: string; count?: number; image?: PartItem['image'] };
        return {
          id: c.id, kind: c.kind as PartItem['kind'], ...(c.kind === 'text' ? { text: s.text ?? '' } : {}), ...(s.count ? { count: s.count } : {}),
          x: ox + l.box.x + c.box.x, y: oy + l.box.y + c.box.y, h: c.box.h, ...(c.box.w ? { w: c.box.w } : {}), ...(s.image ? { image: s.image } : {}),
        };
      });
      const part: SignPart = { id: l.id, kind: l.kind as SignPart['kind'], type: String(type ?? ''), ...(Object.keys(options).length ? { options } : {}), items };
      if (parent || l.spec.on !== undefined || sits(l.kind)) part.on = parent ? parent.id : FRAME_ID;
      out.push(part);
      walk(l.children.filter((c) => !isItemKind(c.kind)), l, ox + l.box.x, oy + l.box.y);
    }
  };
  walk(layers, null, 0, 0);
  return out;
}
/** 올라가는 종류(시트)만 on 을 적는다 — 종류 모듈 sits (함수 안에서만 읽어 모듈 초기화 순서와 무관) */
const sits = (kind: string): boolean => isPartKind(kind) && componentOf(kind).sits;

/** 두 구성 요소 목록이 같은 내용인가 (정규형 비교: 빈 옵션·on 기본값·순서 무시한 키) */
export function sameParts(a: SignPart[], b: SignPart[]): boolean {
  const canon = (ps: SignPart[]) => JSON.stringify(ps.map((p) => ({
    id: p.id, kind: p.kind, type: p.type, on: p.on && p.on !== FRAME_ID ? p.on : undefined,
    options: Object.keys(p.options ?? {}).length ? Object.fromEntries(Object.entries(p.options!).sort()) : undefined,
    items: p.items.map((it) => ({ id: it.id, kind: it.kind, text: it.text ?? undefined, count: it.count || undefined, x: it.x, y: it.y, h: it.h, w: it.w || undefined, image: it.image })),
  })));
  return canon(a) === canon(b);
}

/** 이 사인물의 레이어 트리(프레임의 자식들). 저장된 트리가 펼친 parts 와 같을 때만 그것, 아니면(옛 클라이언트가 parts 만 고침·저장 안 됨) parts 에서 */
export function layersOf(o: SignObject, parts: SignPart[]): Layer[] {
  if (o.layers && (!o.parts || sameParts(toParts(o.layers), parts))) return o.layers;
  return fromParts(parts);
}

/** 프레임 레이어 = 사인물 자체 (종류·옵션·두께·치수가 spec). 1단계에선 저장하지 않고 읽을 때 만든다 */
export function frameOf(o: SignObject, children: Layer[]): Layer {
  return {
    id: FRAME_ID, kind: 'frame', name: o.name,
    spec: { productId: o.productId, ...(o.options ?? {}), ...(o.depthMm ? { depthMm: o.depthMm } : {}) },
    box: { x: 0, y: 0, w: o.widthMm ?? 0, h: o.heightMm ?? 0 }, children,
  };
}

export interface FlatLayer { layer: Layer; parent: Layer | null; depth: number; /** 프레임 중심 기준 mm (상자 중심) */ abs: LayerBox }
/** 트리를 그리는 순서(아래→위, 깊이 우선)로 펼친다. 상자는 프레임 중심 기준 절대 mm */
export function flatten(layers: Layer[], parent: Layer | null = null, ox = 0, oy = 0, depth = 0): FlatLayer[] {
  return layers.flatMap((l) => {
    const abs = { ...l.box, x: ox + l.box.x, y: oy + l.box.y };
    return [{ layer: l, parent, depth, abs }, ...flatten(l.children, l, abs.x, abs.y, depth + 1)];
  });
}
export function findLayer(layers: Layer[], id: string): Layer | undefined {
  for (const l of layers) { if (l.id === id) return l; const f = findLayer(l.children, id); if (f) return f; }
  return undefined;
}
