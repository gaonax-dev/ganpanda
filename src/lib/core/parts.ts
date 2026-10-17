// 조합형 사인물 (2026-10-16 사용자: "조합형으로 구성할 수 있을까 사인물 간판프레임+체널,스카시,시트 / 간판프레임 아래에 선택가능한 리스트를 넣어주면 해당 객체를 사용한다 /
// 채널 객체에 포함된 글자 입력객체를 간판 중앙에 배치하고 크기와 위치지정 가능하게 / 스카시 객체… 글자 입력객체 사용 그림입력객체도 있음 /
// 체널도 추가 할수 있는 시트를 올려 커팅시트, uv출력 시트… 글자와 객체 여러개", 답 "뭐든 붙일 수 있다", "그림: 디자인 파일·직접 올린 그림 둘다").
// 사인물 = 간판 프레임(productId·options) + 구성 요소(parts: 채널·스카시·시트) + 내용 객체(items: 글자·그림, 간판 중앙 기준 mm).
// 저장된 parts 가 없으면 옛 필드(채널·스카시 옵션, 문구, 시트)에서 읽을 때 만든다 — 예전 프로젝트는 그대로 동작한다.
import type { PartItem, SignObject, SignPart } from './model';
import { CHANNEL_OPTIONS, SCASHI_OPTIONS, isChannelProduct, productById, sheetById, takesLetters } from './catalog';

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
  if (takesLetters(id) || isChannelProduct(id)) return ['channel', 'scashi', 'sheet'];
  return KINDS_OF[id] ?? [];
}

export const PART_KIND_LABEL: Record<SignPart['kind'], string> = { channel: '채널', scashi: '스카시', sheet: '시트' };
/** 구성 요소 종류마다 고를 수 있는 세부 종류 (채널 제품 · 스카시 제품 · 시트) */
export const PART_TYPES: Record<SignPart['kind'], { id: string; label: string }[]> = {
  channel: CHANNEL_OPTIONS,
  scashi: SCASHI_OPTIONS,
  // 시트 = UV 출력 / 재질 시트 (커팅은 옵션, 2026-10-16). 옛 안개 시트는 재질 "안개"
  sheet: [{ id: 'sh-print', label: 'UV 출력' }, { id: 'sh-cut', label: '재질 시트' }],
};

const uid = () => (globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2));
export function newPart(kind: SignPart['kind'], type = PART_TYPES[kind][0].id): SignPart {
  return { id: uid(), kind, type, ...(kind === 'sheet' ? { on: 'frame' } : {}), items: [] };
}
/** 새 내용 객체: 간판 중앙, 글자 높이·그림 높이 300mm */
export function newItem(kind: PartItem['kind']): PartItem {
  return { id: uid(), kind, ...(kind === 'text' ? { text: '' } : {}), x: 0, y: 0, h: 300 };
}

/** 구성 요소 이름 (채널: 채널 옵션 이름, 스카시: 제품 이름, 시트: 시트 이름) */
export const partLabel = (p: SignPart) =>
  p.kind === 'channel' ? CHANNEL_OPTIONS.find((c) => c.id === p.type)?.label ?? productById(p.type)?.name ?? p.type
  : p.kind === 'scashi' ? productById(p.type)?.name ?? p.type
  : sheetById(p.type)?.name ?? p.type;

const CH_KEYS = ['chType', 'chBuild', 'chDepth', 'chDouble', 'ledColor', 'font', 'chSideMat', 'bodySystem', 'bodyCode', 'bodyGloss', 'chFace', 'chFrame', 'chFrameColor', 'bracket'];
const SC_KEYS: Record<string, string> = { scThick: 'thickness', scMaterial: 'material', scPaintSystem: 'paintSystem', scPaintCode: 'paintCode', scPaintGloss: 'paintGloss' };
const pick = (opts: Record<string, string | boolean>, keys: string[]) => Object.fromEntries(keys.filter((k) => opts[k] !== undefined).map((k) => [k, opts[k]]));

/** 이 사인물의 구성 요소. 저장된 것이 있으면 그것, 없으면 옛 필드에서. 간판 분류가 아니면 없음 */
/** 옛 반컷팅(halfCut) → 컷 방식 반컷 */
const fixSheetOpts = (p: SignPart): SignPart => {
  const op = p.options ?? {};
  if (p.kind !== 'sheet' || op.halfCut === undefined) return p;
  const { halfCut, ...rest } = op;
  return { ...p, options: { ...rest, ...(halfCut === true && rest.cutMode === undefined ? { cutMode: '반컷' } : {}) } };
};
export function partsOf(o: SignObject): SignPart[] {
  if (o.parts) return o.parts.some((p) => p.kind === 'sheet' && p.options?.halfCut !== undefined) ? o.parts.map(fixSheetOpts) : o.parts;
  const kinds = partKindsFor(o);
  if (!kinds.length) return [];
  const opts = o.options ?? {};
  const out: SignPart[] = [];
  const text = (o.text ?? '').trim();
  const textItem = (h: number | undefined, id: string): PartItem[] => (text || o.charCount ? [{ id, kind: 'text', text: o.text ?? '', ...(o.charCount ? { count: o.charCount } : {}), x: 0, y: 0, h: h ?? 0 }] : []);
  const id = o.productId;
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
  if (!kinds.includes('sheet')) return out;
  const sheets = [...o.sheetIds];
  // 구성 요소와 겹치던 옛 옵션 → 시트 (포맥스 UV 시트 부착, 복합판 마감, 프레임 액자 출력)
  if (id === 'board-foamex' && opts.uvSheet === true) sheets.push('sh-print');
  if (id === 'board-acp' && opts.finish === '실사 출력') sheets.push('sh-print');
  if (id === 'board-acp' && opts.finish === '시트 컷팅') sheets.push('sh-cut');
  if (id === 'frame-plain' && opts.print === '실사 출력') sheets.push('sh-print');
  if (id === 'frame-plain' && opts.print === '시트') sheets.push('sh-cut');
  for (const s of [...new Set(sheets)]) out.push(fixSheetOpts({ id: `legacy-sheet-${s}`, kind: 'sheet', type: s, on: 'frame', options: pick(opts, ['transferTape', 'coating', 'base', 'ink', 'sheetMat', 'halfCut', 'cut', 'cutMode']), items: [] }));
  return out;
}

/** 옛 채널·스카시·시트 옵션 키 — 구성 요소로 저장하면 몸통 옵션에서 지운다 */
export const LEGACY_PART_KEYS = ['channel', 'chType', 'chBuild', 'chDepth', 'chDouble', 'ledColor', 'font', 'chSideMat', 'bodySystem', 'bodyCode', 'bodyGloss', 'chFace', 'chHeight', 'chFrame', 'chFrameColor', 'bracket',
  'scashi', 'scThick', 'scMaterial', 'scPaintSystem', 'scPaintCode', 'scPaintGloss', 'scHeight', 'transferTape', 'coating', 'base', 'ink', 'sheetMat', 'halfCut', 'cut', 'cutMode'];
/** 구성 요소 저장 패치: parts 로 저장하고 옛 옵션·sheetIds 를 정리 (설정 창 카드와 빠른 설정이 같이 씀) */
export function commitParts(o: Pick<SignObject, 'options'>, parts: SignPart[]): Pick<SignObject, 'parts' | 'options' | 'sheetIds'> {
  const options = Object.fromEntries(Object.entries(o.options ?? {}).filter(([k]) => !LEGACY_PART_KEYS.includes(k)));
  return { parts, options, sheetIds: [] }; // 시트 분류는 시트 구성 요소로 분류가 유지된다 (categoryOf)
}

/** 종류를 바꿀 때: 새 종류에 붙일 수 없는 구성 요소는 빼고, 빠진 채널 위의 시트는 프레임 면으로. 저장된 구성 요소가 없으면 undefined(옛 데이터 그대로) */
export function partsForProduct(o: SignObject, productId: string | undefined): SignPart[] | undefined {
  if (!o.parts) return undefined;
  const kinds = partKindsFor({ productId, sheetIds: o.sheetIds, parts: productId ? undefined : o.parts });
  const kept = o.parts.filter((p) => kinds.includes(p.kind));
  const ids = new Set(kept.map((p) => p.id));
  return kept.map((p) => (p.kind === 'sheet' && p.on && p.on !== 'frame' && !ids.has(p.on) ? { ...p, on: 'frame' } : p));
}

/** 분류를 고를 때의 변경: 그 분류 기본 종류, 옵션 비움, 못 붙는 구성 요소 정리. 시트 분류는 시트가 하나도 없으면 시트 컷팅으로 시작 */
export function categoryPatch(o: SignObject, g: string, productId: string | undefined): Partial<SignObject> {
  const parts = partsForProduct(o, productId);
  const hasSheet = o.sheetIds.length || (parts ?? []).some((p) => p.kind === 'sheet');
  // 남은 구성 요소가 없으면 비운다(undefined) — 시트 분류는 시트 목록에서 다시 만든다
  return { productId, options: undefined, parts: parts?.length ? parts : undefined, ...(g === 'sheet' && !hasSheet ? { sheetIds: ['sh-cut'] } : {}) };
}

/**
 * 구성내역 문구 (2026-10-16 사용자: "문구가 없으면 구성내역을 문자에 넣는다. uv출력 돔보컷팅 완컷"):
 * 시트 = 종류 + (재질) + 컷팅 + 컷 방식 + (보조시트), 채널·스카시 = 종류 이름
 */
export function partSpecOf(p: SignPart): string {
  if (p.kind !== 'sheet') return partLabel(p);
  const op = fixSheetOpts(p).options ?? {};
  const cut = (op.cut as string | undefined) ?? (p.type === 'sh-print' ? '돔보컷팅' : '커팅');
  const on = cut !== '컷팅 없음';
  return [partLabel(p), p.type === 'sh-cut' ? (op.sheetMat as string | undefined) ?? '단색' : '', on ? cut : '', on ? (op.cutMode as string | undefined) ?? '완컷' : '', on && op.cutMode !== '반컷' && op.transferTape === true ? '보조시트' : '']
    .filter(Boolean).join(' ');
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
    return [p.kind === 'sheet' ? partSpecOf(p) : partLabel(p), ...texts, ...(imgs ? [`그림 ${imgs}`] : [])].join(' ');
  });
}
