// 주문 사양 옵션 — 사인물에 적용하는 함수 (표는 optionSchema.ts, 구성 요소별 옵션은 core/components 레지스트리 — 2026-10-18 레이어 구조 0단계)
import type { SignObject } from './model';
import { thicknessLabel } from './catalog';
import { productById, takesLetters } from './catalog';
import { describeParts, partsOf } from './parts';
import { componentOf } from './components';
import { CHANNEL_FIELDS, LEGACY_FIELDS, PRODUCT_OPTIONS, SCASHI_ACCESSORY_OPTIONS, SCASHI_ATTACH_FIELDS, SHEET_COMMON_OPTIONS, SHEET_OPTIONS, optionValue, type OptionField, type OptionGroup, type OptionValue, type Options } from './optionSchema';
export { PRODUCT_OPTIONS, SCASHI_ACCESSORY_OPTIONS, SHEET_COMMON_OPTIONS, SHEET_OPTIONS, SHEET_SPEC_KEYS, optionValue } from './optionSchema';
export type { OptionField, OptionGroup, OptionValue, Options } from './optionSchema';

const SCASHI_IDS = ['ch-rubber', 'sc-titan', 'ch-scashi'];

/** 구성 요소의 옵션 — 종류 모듈이 정한다 (core/components, 2026-10-18 0단계; 전엔 여기서 채널·스카시·시트로 분기) */
export function partOptionFields(part: import('./model').SignPart): OptionField[] {
  return componentOf(part.kind).optionFields(part);
}

/** 구성 요소 옵션의 실제 값 (기본값 채움) — 주문 JSON 용 */
export function effectivePartOptions(part: import('./model').SignPart): Options {
  return Object.fromEntries(partOptionFields(part).map((f) => [f.key, optionValue(f, part.options ?? {})]));
}

/** 이 사인물에 보여 줄 옵션 묶음 (조건부 필드는 현재 값으로 거른다) */
export function optionGroupsFor(o: SignObject): OptionGroup[] {
  const opts = o.options ?? {};
  const vis = (fs: OptionField[]) => fs.filter((f) => !f.when || f.when(opts, o));
  const groups: OptionGroup[] = [];
  const p = productById(o.productId);
  if (p) {
    // 간판 몸통이면 채널 옵션(+ 고른 채널의 세부)이 따라붙는다
    // 스카시 분류: 두께·재질·도색은 스카시 구성 요소에 (옛 값도 읽을 때 구성 요소로 옮겨짐 — 겹침 정리 2026-10-16)
    const own = SCASHI_IDS.includes(p.id) ? [] : PRODUCT_OPTIONS[p.id] ?? [];
    const fs = vis([...own, ...(takesLetters(p.id) && !o.parts ? [...CHANNEL_FIELDS, ...SCASHI_ATTACH_FIELDS] : [])]); // 상단 조명은 구성 요소 (2026-10-19) // 채널·스카시 부착·상단 조명은 간판 옵션. 조합형(parts)이면 채널·스카시는 구성 요소 카드에서
    if (fs.length) groups.push({ title: `${p.name} 사양`, fields: fs });
    if (SCASHI_IDS.includes(p.id)) groups.push({ title: '시공 보조 부속품', fields: vis(SCASHI_ACCESSORY_OPTIONS) });
  }
  if (o.sheetIds.length && !o.parts) { // 조합형이면 시트 옵션은 시트 구성 요소에
    const fs = [...SHEET_COMMON_OPTIONS, ...o.sheetIds.flatMap((id) => SHEET_OPTIONS[id] ?? [])];
    groups.push({ title: '시트 옵션', fields: vis(fs) });
  }
  return splitPreview(groups);
}

/** 값 하나의 표시 문자열. select 는 값 그대로, toggle 은 켜졌을 때 라벨, text 는 "라벨 값" */
function describeField(f: OptionField, v: OptionValue | undefined): string | null {
  if (v === undefined || v === '' || v === false) return null;
  if (f.kind === 'toggle') return f.label;
  if (f.kind === 'text') return `${f.label} ${v}`;
  return String(v);
}

/**
 * 요약·견적서·주문서용: 옵션들을 짧은 문구 목록으로 (보이는 필드만).
 * defaults = true 면 고르지 않은 select 도 기본값(첫 값)으로 적는다 — 주문서에는 기본값도 사양이므로
 */
/** 미리보기 필드는 "미리보기" 묶음으로 따로 (2026-10-21) — 요약·주문서는 이 묶음을 뺀다 */
function splitPreview(groups: OptionGroup[]): OptionGroup[] {
  const previews = groups.flatMap((g) => g.fields.filter((f) => f.preview));
  if (!previews.length) return groups;
  const rest = groups.map((g) => ({ ...g, fields: g.fields.filter((f) => !f.preview) })).filter((g) => g.fields.length);
  return [...rest, { title: '미리보기', preview: true, fields: previews }];
}

export function describeOptions(o: SignObject, { defaults = false } = {}): string[] {
  const opts = o.options ?? {};
  const legacy = (LEGACY_FIELDS[o.productId ?? ''] ?? [])
    .filter((f) => opts[f.key] !== undefined && !['없음', '비조명'].includes(String(opts[f.key])) && !(f.key === 'thick' && o.depthMm))
    .map((f) => `${f.label} ${opts[f.key]}`);
  const thick = thicknessLabel(o); // 두께는 소재 옆에 (치수는 가로×세로만)
  // 옛 데이터라도 시트 분류(제품 없음)·스카시 분류는 구성 요소로 요약 (그 옛 옵션 묶음은 구성 요소 쪽에서)
  const legacyParts = !o.parts && (!o.productId || SCASHI_IDS.includes(o.productId)) ? partsOf(o) : undefined;
  const groups = optionGroupsFor(o).filter((g) => !(legacyParts && g.title === '시트 옵션') && !g.preview); // 미리보기는 요약에 없다 (2026-10-21)
  const fromOptions = [...(thick ? [thick] : []), ...groups.flatMap((g) => g.fields.map((f) => describeField(f, defaults ? optionValue(f, opts) : opts[f.key])).filter((s): s is string => !!s)), ...legacy];
  // 조합형: 구성 요소마다 요약(이름·글자·그림) + 옵션 값 (2026-10-16)
  const all = partsOf(o);
  const shown = new Set((o.parts || legacyParts ? all : all.filter((p) => componentOf(p.kind).fromBody)).map((p) => p.id)); // 옛 사인물: 몸통 옵션이던 상단 조명만 구성 요소로
  if (!shown.size) return fromOptions;
  const lines = describeParts(o);
  return [...fromOptions, ...all.flatMap((p, i) => !shown.has(p.id) ? [] : [lines[i], ...partOptionFields(p).filter((f) => !componentOf(p.kind).specKeys?.has(f.key)).map((f) => describeField(f, defaults ? optionValue(f, p.options ?? {}) : p.options?.[f.key])).filter((s): s is string => !!s)])];
}

/** 보이는 필드 전부의 실제 값 (기본값 채움) — 주문 JSON 용 */
export function effectiveOptions(o: SignObject): Options {
  const opts = o.options ?? {};
  return Object.fromEntries(optionGroupsFor(o).filter((g) => !g.preview).flatMap((g) => g.fields.map((f) => [f.key, optionValue(f, opts)]))); // 미리보기 제외 (2026-10-21)
}

/** 스키마에 없는(종류를 바꿔서 더는 안 보이는) 키를 버린다 */
export function normalizeOptions(o: SignObject): Options {
  const fields = optionGroupsFor(o).flatMap((g) => g.fields);
  const keep = new Set(fields.map((f) => f.key));
  // 라이브러리 색 스냅샷(<prefix>Hex·Ref·CardId, core/colorLibrary.ts)은 필드가 아니지만 도색 객체와 함께 남긴다 (2026-10-17)
  for (const f of fields) if (f.paint?.part === 'system') for (const x of ['Hex', 'Ref', 'CardId']) keep.add(`${f.paint.prefix}${x}`);
  for (const k of ['topLight', 'topCount', 'topArm', 'topColor']) keep.add(k); // 옛 몸통 상단 조명 — 구성 요소로 저장될 때까지 지우지 않는다 (2026-10-19)
  return Object.fromEntries(Object.entries(o.options ?? {}).filter(([k]) => keep.has(k)));
}
