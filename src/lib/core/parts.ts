// 조합형 사인물 (2026-10-16 사용자: "조합형으로 구성할 수 있을까 사인물 간판프레임+체널,스카시,시트 / 간판프레임 아래에 선택가능한 리스트를 넣어주면 해당 객체를 사용한다 /
// 채널 객체에 포함된 글자 입력객체를 간판 중앙에 배치하고 크기와 위치지정 가능하게 / 스카시 객체… 글자 입력객체 사용 그림입력객체도 있음 /
// 체널도 추가 할수 있는 시트를 올려 커팅시트, uv출력 시트… 글자와 객체 여러개", 답 "뭐든 붙일 수 있다", "그림: 디자인 파일·직접 올린 그림 둘다").
// 사인물 = 간판 프레임(productId·options) + 구성 요소(parts: 채널·스카시·시트) + 내용 객체(items: 글자·그림, 간판 중앙 기준 mm).
// 저장된 parts 가 없으면 옛 필드(채널·스카시 옵션, 문구, 시트)에서 읽을 때 만든다 — 예전 프로젝트는 그대로 동작한다.
import type { Layer, PartItem, SignObject, SignPart } from './model';
import { CHANNEL_OPTIONS, SCASHI_OPTIONS, isChannelProduct, productById, takesLetters } from './catalog';
import { COMPONENTS, componentOf } from './components';
import { fromParts, mergeParts, orderLike, sameParts, toParts } from './layers';
import { legacyTopLightId, topLightFrom, type TopLightInfo } from './topLight';

/**
 * 분류(종류)마다 붙일 수 있는 구성 요소 (2026-10-16 사용자: "사인물 상세설정들을 모두 조합형으로 변경해주고 중복도 확인해줘").
 * 간판(채널이 붙는 몸통·옛 채널 제품) = 채널·스카시·시트, 스카시 분류 = 스카시, 시트 분류 = 시트, 포맥스·아크릴 = 시트·스카시,
 * 라이트패널·패브릭·프레임 액자·어닝·사인미러 = 시트. 현수막·나무틀 패브릭 액자·천갈이·전광판·에어간판은 그 자체가 출력물·완제품이라 없음.
 */
const KINDS_OF: Record<string, SignPart['kind'][]> = {
  'board-foamex': ['sheet', 'scashi'], 'board-acrylic': ['sheet', 'scashi'],
  'board-lightpanel': ['sheet'], 'board-fabric': ['sheet'], 'frame-plain': ['sheet'], 'board-awning': ['sheet'], 'board-mirror': ['sheet'],
};
const SCASHI_SET = new Set(SCASHI_OPTIONS.map((c) => c.id));
export function partKindsFor(o: Pick<SignObject, 'productId' | 'sheetIds' | 'parts'>): SignPart['kind'][] {
  const id = o.productId;
  if (!id || !productById(id)) return o.sheetIds?.length || o.parts?.some((p) => p.kind === 'sheet') ? ['sheet'] : [];
  if (SCASHI_SET.has(id)) return ['scashi'];
  if (takesLetters(id)) return ['channel', 'scashi', 'sheet', 'light']; // 상단 조명 (2026-10-19 구성 요소로)
  if (isChannelProduct(id)) return ['channel', 'scashi', 'sheet'];
  return KINDS_OF[id] ?? [];
}

// 종류 이름·세부 종류는 레지스트리에서 (core/components, 2026-10-18 레이어 구조 0단계) — 아래 두 표는 호환용
export const PART_KIND_LABEL: Record<SignPart['kind'], string> = Object.fromEntries(COMPONENTS.map((c) => [c.kind, c.label])) as Record<SignPart['kind'], string>;
/** 구성 요소 종류마다 고를 수 있는 세부 종류 (채널 제품 · 스카시 제품 · 시트) */
export const PART_TYPES: Record<SignPart['kind'], { id: string; label: string }[]> = Object.fromEntries(COMPONENTS.map((c) => [c.kind, c.types])) as Record<SignPart['kind'], { id: string; label: string }[]>;

const uid = () => (globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2));
export function newPart(kind: SignPart['kind'], type = componentOf(kind).types[0].id): SignPart {
  const c = componentOf(kind);
  const p: SignPart = { id: uid(), kind, type, items: [] };
  return c.init ? c.init(p) : p;
}
/** 새 내용 객체: 간판 중앙, 글자 높이·그림 높이 300mm */
export function newItem(kind: PartItem['kind']): PartItem {
  return { id: uid(), kind, ...(kind === 'text' ? { text: '' } : {}), ...(kind === 'shape' ? { shape: 'rect' as const, w: 300 } : {}), x: 0, y: 0, h: 300 };
}

/** 구성 요소 이름 (세부 종류 이름 — 종류 모듈이 정한다) */
export const partLabel = (p: SignPart) => componentOf(p.kind).typeLabel(p);

const CH_KEYS = ['chType', 'chBuild', 'chDepth', 'chDouble', 'ledColor', 'font', 'chSideMat', 'bodySystem', 'bodyCode', 'bodyGloss', 'chFace', 'chFrame', 'chFrameColor', 'bracket'];
const SC_KEYS: Record<string, string> = { scThick: 'thickness', scMaterial: 'material', scPaintSystem: 'paintSystem', scPaintCode: 'paintCode', scPaintGloss: 'paintGloss' };
const pick = (opts: Record<string, string | boolean>, keys: string[]) => Object.fromEntries(keys.filter((k) => opts[k] !== undefined).map((k) => [k, opts[k]]));

/** 이 사인물의 구성 요소. 저장된 것이 있으면 그것(종류 모듈의 normalize 로 옛 옵션 정리 — 바뀐 게 없으면 같은 배열), 없으면 옛 필드에서. 간판 분류가 아니면 없음 */
const normalizePart = (p: SignPart): SignPart => componentOf(p.kind).normalize?.(p) ?? p;
/** 옛 몸통 옵션 상단 조명(options.topLight·topCount·topArm·topColor) → 상단 조명 구성 요소 (2026-10-19). 이미 상단 조명 구성 요소가 있거나 붙일 수 없는 종류면 없음 */
function legacyLight(o: SignObject, have: SignPart[]): SignPart | null {
  const id = legacyTopLightId(o);
  if (!id || have.some((p) => componentOf(p.kind).fromBody) || !partKindsFor(o).includes('light')) return null;
  const opts = o.options ?? {};
  return { id: 'legacy-light', kind: 'light', type: id, options: pick(opts, ['topCount', 'topArm', 'topColor']), items: [] };
}
export function partsOf(o: SignObject): SignPart[] {
  if (o.parts) { const n = o.parts.map(normalizePart); const ll = legacyLight(o, n); if (ll) return [...n, ll]; return n.some((p, i) => p !== o.parts![i]) ? n : o.parts; }
  if (o.layers) { const t = toParts(o.layers).map(normalizePart); const ll = legacyLight(o, t); return ll ? [...t, ll] : t; } // 트리만 저장된 사인물 (1단계 이후)
  const kinds = partKindsFor(o);
  if (!kinds.length) return [];
  const opts = o.options ?? {};
  const out: SignPart[] = [];
  const text = (o.text ?? '').trim();
  const textItem = (h: number | undefined, id: string): PartItem[] => (text || o.charCount ? [{ id, kind: 'text', text: o.text ?? '', ...(o.charCount ? { count: o.charCount } : {}), x: 0, y: 0, h: h ?? 0 }] : []);
  const id = o.productId;
  const withLight = (ps: SignPart[]) => { const ll = legacyLight(o, ps); return ll ? [...ps, ll] : ps; };
  if (id && SCASHI_SET.has(id)) {
    // 스카시 분류: 사인물 자체가 스카시 → 스카시 구성 요소 하나 (옵션·글자 그대로)
    out.push({ id: 'legacy-scashi', kind: 'scashi', type: id, options: pick(opts, ['thickness', 'material', 'paintSystem', 'paintCode', 'paintGloss', 'finish', 'script']), items: textItem(o.heightMm, 'legacy-scashi-text') });
    return out;
  }
  const legacyChannel = isChannelProduct(id);
  const ch = legacyChannel ? id! : CHANNEL_OPTIONS.find((c) => c.label === opts.channel)?.id;
  if (ch && kinds.includes('channel')) out.push({ id: 'legacy-channel', kind: 'channel', type: ch, options: pick(opts, CH_KEYS), items: textItem(Number(opts.chHeight) || o.heightMm, 'legacy-channel-text') });
  const sc = SCASHI_OPTIONS.find((c) => c.label === opts.scashi)?.id;
  if (sc && !legacyChannel && kinds.includes('scashi')) out.push({ id: 'legacy-scashi', kind: 'scashi', type: sc, options: Object.fromEntries(Object.entries(SC_KEYS).filter(([k]) => opts[k] !== undefined).map(([k, v]) => [v, opts[k]])), items: textItem(Number(opts.scHeight) || o.heightMm, 'legacy-scashi-text') });
  if (!kinds.includes('sheet')) return withLight(out);
  const sheets = [...o.sheetIds];
  // 구성 요소와 겹치던 옛 옵션 → 시트 (포맥스 UV 시트 부착, 복합판 마감, 프레임 액자 출력)
  if (id === 'board-foamex' && opts.uvSheet === true) sheets.push('sh-print');
  if (id === 'board-acp' && opts.finish === '실사 출력') sheets.push('sh-print');
  if (id === 'board-acp' && opts.finish === '시트 컷팅') sheets.push('sh-cut');
  if (id === 'frame-plain' && opts.print === '실사 출력') sheets.push('sh-print');
  if (id === 'frame-plain' && opts.print === '시트') sheets.push('sh-cut');
  for (const s of [...new Set(sheets)]) out.push(normalizePart({ id: `legacy-sheet-${s}`, kind: 'sheet', type: s, on: 'frame', options: pick(opts, ['transferTape', 'coating', 'base', 'ink', 'sheetMat', 'halfCut', 'cut', 'cutMode']), items: [] }));
  return withLight(out);
}

/** 옛 채널·스카시·시트 옵션 키 — 구성 요소로 저장하면 몸통 옵션에서 지운다 */
export const LEGACY_PART_KEYS = ['channel', 'chType', 'chBuild', 'chDepth', 'chDouble', 'ledColor', 'font', 'chSideMat', 'bodySystem', 'bodyCode', 'bodyGloss', 'chFace', 'chHeight', 'chFrame', 'chFrameColor', 'bracket',
  'scashi', 'scThick', 'scMaterial', 'scPaintSystem', 'scPaintCode', 'scPaintGloss', 'scHeight', 'transferTape', 'coating', 'base', 'ink', 'sheetMat', 'halfCut', 'cut', 'cutMode',
  'topLight', 'topCount', 'topArm', 'topColor']; // 상단 조명도 구성 요소로 (2026-10-19)
/** 구성 요소 저장 패치: parts 로 저장하고 옛 옵션·sheetIds 를 정리 (설정 창 카드와 빠른 설정이 같이 씀) */
export function commitParts(o: Pick<SignObject, 'options' | 'layers' | 'parts'>, parts: SignPart[]): Pick<SignObject, 'parts' | 'layers' | 'options' | 'sheetIds'> {
  const options = Object.fromEntries(Object.entries(o.options ?? {}).filter(([k]) => !LEGACY_PART_KEYS.includes(k)));
  // 트리가 있고 거울과 맞으면 편집을 트리에 **병합**(그룹·이름·보이기·잠금 유지, 3단계), 아니면 새로 만든다
  const keep = o.layers && (!o.parts || sameParts(toParts(o.layers), o.parts));
  const layers = keep ? mergeParts(o.layers!, parts) : fromParts(parts);
  return { parts: orderLike(toParts(layers), parts), layers, options, sheetIds: [] }; // 시트 분류는 시트 구성 요소로 분류가 유지된다 (categoryOf). layers = 트리, parts 는 그 거울(숨긴 것 제외, 편집 전 순서 유지)
}
/** 레이어 패널 편집 저장: 트리를 쓰고 거울(parts)을 다시 만든다 */
export function commitLayers(o: Pick<SignObject, 'options'>, layers: Layer[]): Pick<SignObject, 'parts' | 'layers' | 'options' | 'sheetIds'> {
  const options = Object.fromEntries(Object.entries(o.options ?? {}).filter(([k]) => !LEGACY_PART_KEYS.includes(k)));
  return { parts: toParts(layers), layers, options, sheetIds: [] };
}

/** p 가 올라간 것(on)을 따라 깊이: 프레임 면 0, 채널·시트 위 = 그것의 깊이 + 1 (순환·없는 id 는 0) */
function depthOf(parts: SignPart[], p: SignPart, seen = new Set<string>()): number {
  if (!p.on || p.on === 'frame' || seen.has(p.id)) return 0;
  const base = parts.find((x) => x.id === p.on);
  if (!base) return 0;
  seen.add(p.id);
  return depthOf(parts, base, seen) + 1;
}
/** 시트를 올릴 곳 후보 (2026-10-17 "안개커팅 위에 로고 돔보컷팅"): 프레임 면 · 채널 앞면 · 다른 시트 위 — 자기 자신과 자기 위에 올라온 것(순환)은 제외 */
export function sheetTargets(parts: SignPart[], self: SignPart): { id: string; label: string }[] {
  /** p 가 (직접 또는 건너서) self 위에 올라와 있나 — 그 위에 self 를 올리면 순환 */
  const sitsOnSelf = (p: SignPart, seen = new Set<string>()): boolean => {
    if (!p.on || p.on === 'frame' || seen.has(p.id)) return false;
    if (p.on === self.id) return true;
    seen.add(p.id);
    const base = parts.find((x) => x.id === p.on);
    return !!base && sitsOnSelf(base, seen);
  };
  const out: { id: string; label: string }[] = [{ id: 'frame', label: '프레임 면' }];
  for (const p of parts) {
    const host = componentOf(p.kind).host; // 위에 올릴 수 있는 종류만 (스카시는 없음)
    if (p.id === self.id || !host) continue;
    if (componentOf(p.kind).sits && sitsOnSelf(p)) continue;
    out.push({ id: p.id, label: host(p) });
  }
  return out;
}
/** 올린 곳 문구 (요약·주문서): 채널 앞면 / 시트 위. 프레임 면이면 null */
export function onLabel(parts: SignPart[], p: SignPart): string | null {
  if (!p.on || p.on === 'frame') return null;
  const base = parts.find((x) => x.id === p.on);
  return base ? componentOf(base.kind).host?.(base) ?? null : null;
}
/** 그리는 순서(아래부터): 면에 깔리는 종류(층 0)는 깊이 순(프레임 면 → 그 위), 입체(층 100)는 뒤에. 같은 층은 원래 순서 */
export function layerOrder(parts: SignPart[]): SignPart[] {
  return parts.map((p, i) => ({ p, i, key: componentOf(p.kind).layer + depthOf(parts, p) }))
    .sort((a, b) => a.key - b.key || a.i - b.i).map((x) => x.p);
}

/** 종류를 바꿀 때: 새 종류에 붙일 수 없는 구성 요소는 빼고, 빠진 채널 위의 시트는 프레임 면으로. 저장된 구성 요소가 없으면 undefined(옛 데이터 그대로) */
export function partsForProduct(o: SignObject, productId: string | undefined): SignPart[] | undefined {
  if (!o.parts) return undefined;
  const kinds = partKindsFor({ productId, sheetIds: o.sheetIds, parts: productId ? undefined : o.parts });
  const kept = o.parts.filter((p) => kinds.includes(p.kind));
  const ids = new Set(kept.map((p) => p.id));
  return kept.map((p) => (p.on && p.on !== 'frame' && !ids.has(p.on) ? { ...p, on: 'frame' } : p));
}

/** 분류를 고를 때의 변경: 그 분류 기본 종류, 옵션 비움, 못 붙는 구성 요소 정리. 시트 분류는 시트가 하나도 없으면 시트 컷팅으로 시작 */
export function categoryPatch(o: SignObject, g: string, productId: string | undefined): Partial<SignObject> {
  const parts = partsForProduct(o, productId);
  const hasSheet = o.sheetIds.length || (parts ?? []).some((p) => p.kind === 'sheet');
  // 남은 구성 요소가 없으면 비운다(undefined) — 시트 분류는 시트 목록에서 다시 만든다
  return { productId, options: undefined, parts: parts?.length ? parts : undefined, layers: parts?.length ? fromParts(parts) : undefined, ...(g === 'sheet' && !hasSheet ? { sheetIds: ['sh-cut'] } : {}) };
}

/**
 * 구성내역 문구 (2026-10-16 사용자: "문구가 없으면 구성내역을 문자에 넣는다. uv출력 돔보컷팅 완컷"):
 * 시트 = 종류 + (재질) + 컷팅 + 컷 방식 + (보조시트), 채널·스카시 = 종류 이름
 */
export function partSpecOf(p: SignPart): string {
  return componentOf(p.kind).spec(p);
}
/** 사인물 문구: 사인물 문구 > 구성 요소의 글자 객체 > 구성내역 */
export function signTextOf(o: SignObject): string {
  if (o.text?.trim()) return o.text.trim();
  const ps = partsOf(o);
  const texts = ps.flatMap((p) => p.items.filter((i) => i.kind === 'text' && (i.text ?? '').trim()).map((i) => (i.text ?? '').trim()));
  return texts.length ? texts.join(' / ') : ps.map(partSpecOf).join(' + ');
}

/** 요약 문구: 구성 요소마다 이름 + 글자("…" 높이) + 그림 수 */
export function describeParts(o: SignObject): string[] {
  return partsOf(o).map((p) => {
    const texts = p.items.filter((i) => i.kind === 'text' && (i.text ?? '').trim()).map((i) => `"${(i.text ?? '').trim()}" ${Math.round(i.h)}mm`);
    const imgs = p.items.filter((i) => i.kind === 'image').length;
    const shapes = p.items.filter((i) => i.kind === 'shape').length;
    const on = onLabel(partsOf(o), p);
    return [partSpecOf(p), ...texts, ...(imgs ? [`그림 ${imgs}`] : []), ...(shapes ? [`도형 ${shapes}`] : []), ...(on ? [`(${on})`] : [])].join(' ');
  });
}

/** 사인물의 상단 조명 (구성 요소 — 옛 몸통 옵션도 읽을 때 구성 요소로). widthMm = 간판 가로(입력 치수 > 주어진 값). 3D 가 쓴다 */
export function lightOf(o: SignObject, widthMm?: number, heightMm?: number): TopLightInfo | null {
  const p = partsOf(o).find((x) => componentOf(x.kind).fromBody);
  return p ? topLightFrom(p.type, p.options, o.widthMm ?? widthMm ?? 0, o.heightMm ?? heightMm ?? 0) : null;
}

