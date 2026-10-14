// 주문 사양 옵션 스키마 (2026-10-14 사용자 요청: 사인물 통합 주문): 종류마다 옵션을 데이터로 두고 설정 창이 폼을 그린다.
// 새 품목·옵션은 여기에 한 줄 추가. 값은 SignObject.options (키 → 값) 에 저장되고, 조합 규칙은 `when` 으로.
import type { SignObject } from './model';
import { productById } from './catalog';

export type OptionValue = string | boolean;
export type Options = Record<string, OptionValue>;
export interface OptionField {
  key: string;
  label: string;
  kind: 'select' | 'toggle' | 'text';
  values?: { id: string; label: string }[];
  placeholder?: string;
  /** 조건부 표시 (같은 사인물의 다른 옵션 값에 따라) */
  when?: (opts: Options, o: SignObject) => boolean;
}
export interface OptionGroup { title: string; fields: OptionField[] }

const sel = (key: string, label: string, values: string[], when?: OptionField['when']): OptionField =>
  ({ key, label, kind: 'select', values: values.map((v) => ({ id: v, label: v })), when });
const tog = (key: string, label: string, when?: OptionField['when']): OptionField => ({ key, label, kind: 'toggle', when });
const txt = (key: string, label: string, placeholder: string, when?: OptionField['when']): OptionField => ({ key, label, kind: 'text', placeholder, when });

const COLOR_SYSTEMS = ['PANTONE', 'RAL', 'KCC'];
const paint = (prefix: string, label: string, when?: OptionField['when']): OptionField[] => [
  sel(`${prefix}System`, `${label} 색상 체계`, COLOR_SYSTEMS, when),
  txt(`${prefix}Code`, `${label} 컬러코드`, '예: RAL 9005', when),
];
const SIDES = sel('sides', '면', ['단면', '양면']);
const isLit = (_o: Options, o: SignObject) => o.productId !== 'ch-galva';

/** 제품별 옵션 (주문 사양) */
export const PRODUCT_OPTIONS: Record<string, OptionField[]> = {
  'board-flex': [SIDES, sel('light', '내부 조명', ['LED', '형광등', '비조명'])],
  'board-galva': [sel('form', '형태', ['돌출형', '일체형(전면)']), sel('indirect', '간접조명', ['없음', 'T5 LED 주백색', 'T5 LED 전구색', '측면 LED 바']), ...paint('paint', '도색')],
  'board-foamex': [SIDES, sel('finish', '마감', ['실사 출력', '시트 컷팅', '도색']), ...paint('paint', '도색', (opts) => opts.finish === '도색')],
  'board-acp': [SIDES, sel('finish', '마감', ['실사 출력', '시트 컷팅', '도색']), ...paint('paint', '도색', (opts) => opts.finish === '도색')],
  'board-acrylic': [SIDES, sel('finish', '마감', ['실사 출력', '시트 컷팅', '도색']), ...paint('paint', '도색', (opts) => opts.finish === '도색')],
  ...Object.fromEntries(['ch-front', 'ch-halo', 'ch-both', 'ch-galva'].map((id) => [id, [
    sel('chType', '채널 종류', ['캡', '오싸이', '일체형']),
    sel('ledColor', 'LED 색', ['백색', '주백색', '전구색', '빨강', '파랑', 'RGB'], isLit),
    ...paint('body', '알루미늄·측면·프레임 도색'),
  ]])),
  'ch-rubber': [sel('thickness', '두께', ['10T', '20T', '30T', '50T']), sel('front', '전면판 종류', ['시트 부착', '아크릴 전면판', '없음']), txt('frontColor', '전면 색상', '예: 백색, RAL 3020', (opts) => opts.front !== '없음')],
  'sc-titan': [sel('color', '색상', ['골드', '실버', '로즈골드', '블랙', '브론즈']), sel('finish', '표면 마감', ['헤어라인(무광)', '미러(유광)'])],
  'ch-scashi': [sel('thickness', '두께', ['2T', '3T', '5T', '8T', '10T']), sel('colorMode', '색상', ['색상 코드', '지정 도색']), txt('colorCode', '색상 코드·도색', '예: 아크릴 #302, RAL 9010')],
};
/** 스카시 공통: 시공 보조 부속품 */
export const SCASHI_ACCESSORY_OPTIONS: OptionField[] = [
  tog('paperTemplate', '시공용 1:1 종이 도안'),
  tog('acrylicGuide', '아크릴 가다 (음각/양각 틀)'),
  sel('frontSheetAttached', '전면 시트 컷팅', ['부착 출고', '미부착']),
];
/** 시트 공통 + 시트별 */
export const SHEET_COMMON_OPTIONS: OptionField[] = [tog('transferTape', '보조시트(어플리케이션 테이프) 포함'), sel('coating', '코팅', ['코팅 없음', '유광', '무광'])];
export const SHEET_OPTIONS: Record<string, OptionField[]> = { 'sh-cut': [tog('halfCut', '반컷팅')] };
const SCASHI_IDS = ['ch-rubber', 'sc-titan', 'ch-scashi'];

/** 이 사인물에 보여 줄 옵션 묶음 (조건부 필드는 현재 값으로 거른다) */
export function optionGroupsFor(o: SignObject): OptionGroup[] {
  const opts = o.options ?? {};
  const vis = (fs: OptionField[]) => fs.filter((f) => !f.when || f.when(opts, o));
  const groups: OptionGroup[] = [];
  const p = productById(o.productId);
  if (p) {
    const fs = vis(PRODUCT_OPTIONS[p.id] ?? []);
    if (fs.length) groups.push({ title: `${p.name} 사양`, fields: fs });
    if (SCASHI_IDS.includes(p.id)) groups.push({ title: '시공 보조 부속품', fields: vis(SCASHI_ACCESSORY_OPTIONS) });
  }
  if (o.sheetIds.length) {
    const fs = [...SHEET_COMMON_OPTIONS, ...o.sheetIds.flatMap((id) => SHEET_OPTIONS[id] ?? [])];
    groups.push({ title: '시트 옵션', fields: vis(fs) });
  }
  return groups;
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
export function describeOptions(o: SignObject, { defaults = false } = {}): string[] {
  const opts = o.options ?? {};
  return optionGroupsFor(o).flatMap((g) => g.fields.map((f) => describeField(f, defaults ? optionValue(f, opts) : opts[f.key])).filter((s): s is string => !!s));
}

/** 보이는 필드 전부의 실제 값 (기본값 채움) — 주문 JSON 용 */
export function effectiveOptions(o: SignObject): Options {
  const opts = o.options ?? {};
  return Object.fromEntries(optionGroupsFor(o).flatMap((g) => g.fields.map((f) => [f.key, optionValue(f, opts)])));
}

/** 스키마에 없는(종류를 바꿔서 더는 안 보이는) 키를 버린다 */
export function normalizeOptions(o: SignObject): Options {
  const keep = new Set(optionGroupsFor(o).flatMap((g) => g.fields.map((f) => f.key)));
  return Object.fromEntries(Object.entries(o.options ?? {}).filter(([k]) => keep.has(k)));
}

/** 설정값: select 는 첫 값이 기본, toggle 은 false */
export function optionValue(f: OptionField, opts: Options): OptionValue {
  const v = opts[f.key];
  if (v !== undefined) return v;
  return f.kind === 'select' ? f.values![0].id : f.kind === 'toggle' ? false : '';
}
