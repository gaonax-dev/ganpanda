// 세트 라이브러리 (2026-10-19 레이어 구조 4단계; 2026-10-16 사용자: "자주 사용하는 것은 셋을 모아서 저장하면 라이브러리(이미지 아이콘)를 가져다 사용",
// 답 "다른 크기에는 비율 유지"): 레이어 묶음(서브트리)을 저장했다가 다른 사인물에 넣는다 — 넣을 때 그 사인물 크기에 비율을 유지해 맞춘다.
// 계정에 저장(서버 /api/me/sets) + 기기 사본. 레이어의 그림은 에셋 id 로만 가리키므로 세트는 가볍다
import type { Layer, SignObject } from './model';
import { GROUP_KIND, isPartLayer, toParts } from './layers';
import { layoutParts, partsSvg } from './partsLayout';

export interface SignSet {
  id: string;
  name: string;
  /** 저장할 때 사인물 크기 (mm) — 넣을 때 비율의 기준 */
  frame: { w: number; h: number };
  layers: Layer[];
  /** 썸네일 SVG (data URL) */
  thumb?: string;
  createdAt: number;
}
export interface SetLibrary { version: 1; sets: SignSet[] }

const uid = () => (globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2));
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

/** 레이어 트리에서 고른 id 들의 서브트리(트리 순서대로)를 세트로. 고른 게 없으면 전체 */
export function setFrom(layers: Layer[], ids: string[], o: Pick<SignObject, 'widthMm' | 'heightMm'>, name: string): SignSet | null {
  const picked: Layer[] = [];
  const walk = (ls: Layer[]) => { for (const l of ls) { if (ids.includes(l.id)) picked.push(clone(l)); else walk(l.children); } };
  if (ids.length) walk(layers); else picked.push(...clone(layers));
  if (!picked.length) return null;
  const frame = { w: o.widthMm || 1000, h: o.heightMm || 1000 };
  const set: SignSet = { id: uid(), name: name.trim() || '세트', frame, layers: picked, createdAt: Date.now() };
  const thumb = thumbOf(set);
  return thumb ? { ...set, thumb } : set;
}

/** 모든 상자를 k 배 (좌표·크기), id 는 새로 */
export function scaleLayers(layers: Layer[], k: number): Layer[] {
  const walk = (ls: Layer[]): Layer[] => ls.map((l) => ({ ...clone(l), id: uid(), box: { ...l.box, x: l.box.x * k, y: l.box.y * k, w: l.box.w * k, h: l.box.h * k }, children: walk(l.children) }));
  return walk(layers);
}
/** 세트를 사인물에 넣을 배율: 가로·세로 비 중 작은 쪽 (비율 유지). 사인물 크기가 없으면 1 */
export const fitScale = (set: SignSet, o: Pick<SignObject, 'widthMm' | 'heightMm'>): number =>
  o.widthMm && o.heightMm ? Math.min(o.widthMm / set.frame.w, o.heightMm / set.frame.h) : 1;
/** 세트의 뿌리가 모두 구성 요소(또는 구성 요소만 담은 그룹)인가 → 프레임 바로 아래에 넣을 수 있다 */
export const rootsArePartsOnly = (layers: Layer[]): boolean => layers.every((l) => isPartLayer(l) || (l.kind === GROUP_KIND && rootsArePartsOnly(l.children)));

/**
 * 세트를 트리에 넣는다: 뿌리가 구성 요소뿐이면 프레임 아래(뒤에), 내용 객체가 섞여 있으면 intoPartId 구성 요소의 자식으로.
 * 넣을 구성 요소가 없으면 null (호출자가 안내)
 */
export function insertSet(layers: Layer[], set: SignSet, o: Pick<SignObject, 'widthMm' | 'heightMm'>, intoPartId?: string): Layer[] | null {
  const k = fitScale(set, o);
  const fresh = scaleLayers(set.layers, k);
  const tree = clone(layers);
  if (rootsArePartsOnly(fresh)) return [...tree, ...fresh];
  const find = (ls: Layer[]): Layer | undefined => { for (const l of ls) { if (l.id === intoPartId) return l; const f = find(l.children); if (f) return f; } return undefined; };
  const target = intoPartId ? find(tree) : undefined;
  if (!target || !isPartLayer(target)) return null;
  // 구성 요소 뿌리는 프레임 아래로, 내용 객체·그룹은 그 구성 요소 아래로
  for (const l of fresh) { if (isPartLayer(l)) tree.push(l); else target.children.push(l); }
  return tree;
}

/** 썸네일: 세트의 펼친 구성 요소를 작은 SVG 로 (그림은 자리만) */
export function thumbOf(set: SignSet): string | undefined {
  try {
    const parts = toParts(set.layers);
    const items = layoutParts({ parts, widthMm: set.frame.w, heightMm: set.frame.h } as SignObject, set.frame.w, set.frame.h, 160, Math.max(24, Math.round((160 * set.frame.h) / set.frame.w)));
    const h = Math.max(24, Math.round((160 * set.frame.h) / set.frame.w));
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 ${h}" width="160" height="${h}"><rect width="160" height="${h}" fill="#1e2228" stroke="#444a53"/>${partsSvg(items, () => undefined)}</svg>`;
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  } catch { return undefined; }
}

export function validSetLibrary(v: unknown): v is SetLibrary {
  if (!v || typeof v !== 'object') return false;
  const lib = v as { version?: unknown; sets?: unknown };
  return lib.version === 1 && Array.isArray(lib.sets) && lib.sets.every((s) => s && typeof s === 'object' && typeof (s as SignSet).id === 'string' && typeof (s as SignSet).name === 'string' && Array.isArray((s as SignSet).layers) && !!(s as SignSet).frame);
}
const KEY = 'ganpanda.sets';
export function loadLocalSets(): SignSet[] {
  try { const v = JSON.parse(localStorage.getItem(KEY) ?? 'null'); return validSetLibrary(v) ? v.sets : []; } catch { return []; }
}
export function saveLocalSets(sets: SignSet[]) { try { localStorage.setItem(KEY, JSON.stringify({ version: 1, sets })); } catch { /* 기기에 못 남겨도 동작 */ } }
