// 레이어 트리 — 레이어 구조 1단계 (2026-10-18 결정: "0,1, 몸통도 프레임 레이어"; 설계 docs/architecture/composition-layers.md).
// 레이어 = "어디에, 어떤 순서로, 무엇 위에"(부모 기준 mm 상자·자식·보이기·잠금). 무엇을 어떻게 만드나는 종류 모듈(core/components).
// 1단계 저장 규칙: 사인물 = 프레임 레이어(루트 = SignObject 자체: 종류·옵션·치수·두께가 곧 프레임 spec). 그 자식 트리를 `SignObject.layers` 에 저장하고,
// 펼친 옛 형식 `parts` 를 **거울**로 함께 쓴다 — 기존 화면·견적·3D 는 parts 를 그대로 읽고, 트리를 아는 코드는 layersOf() 를 읽는다.
// 옛 클라이언트가 parts 만 고치면 layers 가 뒤처지므로, layers 는 parts 와 같을 때만 믿고 아니면 parts 에서 다시 만든다(layersOf).
import type { Layer, PartItem, SignObject, SignPart } from './model';
import { componentKinds, componentOf } from './components';

export const FRAME_ID = 'frame';
/** 내용 객체 종류 (글자·그림) — 구성 요소 종류는 레지스트리 */
export const ITEM_KINDS = ['text', 'image', 'shape'] as const;
/** 그룹 (2단계): 자식을 묶어 함께 옮기는 레이어 — 자기 spec·단가·3D 없음, 펼친 parts 거울에서는 오프셋만 남고 사라진다 */
export const GROUP_KIND = 'group';
export type LayerBox = Layer['box'];
const FILL: LayerBox = { x: 0, y: 0, w: 0, h: 0 }; // w·h 0 = 부모 전체(채움)

const isPartKind = (kind: string) => (componentKinds() as string[]).includes(kind);
const isItemKind = (kind: string) => (ITEM_KINDS as readonly string[]).includes(kind);

/** 내용 객체 → 레이어 (좌표는 부모 기준 — 구성 요소는 프레임을 채우므로 간판 중심 기준 값 그대로) */
function itemLayer(it: PartItem): Layer {
  const spec: Record<string, unknown> = it.kind === 'text' ? { text: it.text ?? '', ...(it.count ? { count: it.count } : {}) }
    : it.kind === 'shape' ? { shape: it.shape ?? 'rect', ...(it.fill ? { fill: it.fill } : {}), ...(it.stroke ? { stroke: it.stroke } : {}) }
    : { ...(it.image ? { image: it.image } : {}) };
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
/** 내용 객체 레이어 → PartItem (좌표는 간판 중심 기준 절대 mm) */
function itemOf(c: Layer, ax: number, ay: number): PartItem {
  const s = c.spec as { text?: string; count?: number; image?: PartItem['image']; shape?: PartItem['shape']; fill?: string; stroke?: string };
  return {
    id: c.id, kind: c.kind as PartItem['kind'], ...(c.kind === 'text' ? { text: s.text ?? '' } : {}), ...(s.count ? { count: s.count } : {}),
    ...(c.kind === 'shape' ? { shape: s.shape ?? 'rect', ...(s.fill ? { fill: s.fill } : {}), ...(s.stroke ? { stroke: s.stroke } : {}) } : {}),
    x: ax, y: ay, h: c.box.h, ...(c.box.w ? { w: c.box.w } : {}), ...(s.image ? { image: s.image } : {}),
  };
}
/**
 * 레이어 트리 → 펼친 구성 요소. 내용 객체는 **가장 가까운 구성 요소 조상**에 거두고(그룹은 투명 — 오프셋만 더해짐), 구성 요소는 on = 부모 구성 요소 id / 'frame'.
 * 좌표는 부모 오프셋을 누적해 간판 중심 기준으로. 프레임 바로 아래의 내용 객체(구성 요소 없음)는 거둘 곳이 없어 빠진다
 */
export function toParts(layers: Layer[]): SignPart[] {
  const out: SignPart[] = [];
  const walk = (ls: Layer[], parent: SignPart | null, ox: number, oy: number) => {
    for (const l of ls) {
      const ax = ox + l.box.x, ay = oy + l.box.y;
      if (isItemKind(l.kind)) { if (parent) parent.items.push(itemOf(l, ax, ay)); continue; }
      if (!isPartKind(l.kind)) { walk(l.children, parent, ax, ay); continue; } // 그룹 등: 투명
      const { type, ...options } = l.spec as { type?: string } & Record<string, string | boolean>;
      const part: SignPart = { id: l.id, kind: l.kind as SignPart['kind'], type: String(type ?? ''), ...(Object.keys(options).length ? { options } : {}), items: [] };
      if (parent || sits(l.kind)) part.on = parent ? parent.id : FRAME_ID;
      out.push(part);
      walk(l.children, part, ax, ay);
    }
  };
  walk(layers, null, 0, 0);
  return out;
}

/** 어떤 레이어가 어떤 자식을 받나: 프레임 = 구성 요소·그룹, 구성 요소 = 내용 객체·그룹·(올릴 수 있으면) 시트, 그룹 = 부모와 같음 */
export function canHold(parentKind: string | typeof FRAME_ID, childKind: string, ancestors: string[] = []): boolean {
  if (parentKind === GROUP_KIND) { const up = ancestors.at(-1) ?? FRAME_ID; return canHold(up, childKind, ancestors.slice(0, -1)); }
  if (childKind === GROUP_KIND) return true;
  if (parentKind === FRAME_ID) return isPartKind(childKind);
  if (!isPartKind(parentKind)) return false;
  if (isItemKind(childKind)) return true;
  return isPartKind(childKind) && !!componentOf(parentKind).host && sits(childKind);
}

export interface PlacedItem { item: PartItem; part: SignPart; /** 간판 앞면에서 올라선 높이 (mm) — 자기 구성 요소를 뺀 조상 구성 요소 두께의 합 */ z: number }
/** 3D 용: 트리를 그리는 순서로 걸으며 내용 객체마다 (절대 좌표, 거둔 구성 요소, 깊이 z) — 시트 위 채널 위 시트가 깊이대로 선다 (2단계) */
export function placedItems(layers: Layer[], depthOf: (part: SignPart) => number): PlacedItem[] {
  const out: PlacedItem[] = [];
  const walk = (ls: Layer[], parent: SignPart | null, ox: number, oy: number, z: number) => {
    for (const l of ls) {
      const ax = ox + l.box.x, ay = oy + l.box.y;
      if (isItemKind(l.kind)) { if (parent) out.push({ item: itemOf(l, ax, ay), part: parent, z }); continue; }
      if (!isPartKind(l.kind)) { walk(l.children, parent, ax, ay, z); continue; }
      const { type, ...options } = l.spec as { type?: string } & Record<string, string | boolean>;
      const part: SignPart = { id: l.id, kind: l.kind as SignPart['kind'], type: String(type ?? ''), ...(Object.keys(options).length ? { options } : {}), items: [] };
      // 이 구성 요소의 자식은 그 두께만큼 더 앞에 (자식 구성 요소·그 내용 객체). 자기 글자(밀어내기)는 z 에서 시작해 두께만큼 솟는다
      walk(l.children, part, ax, ay, z + (parent ? depthOf(parent) : 0));
    }
  };
  walk(layers, null, 0, 0, 0);
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
