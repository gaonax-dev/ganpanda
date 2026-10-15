// 주문 사양 옵션 스키마 (2026-10-14 사용자 요청: 사인물 통합 주문): 종류마다 옵션을 데이터로 두고 설정 창이 폼을 그린다.
// 새 품목·옵션은 여기에 한 줄 추가. 값은 SignObject.options (키 → 값) 에 저장되고, 조합 규칙은 `when` 으로.
import type { SignObject } from './model';
import { CHANNEL_NONE, CHANNEL_OPTIONS, NO_CHANNEL, productById } from './catalog';

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
/** 채널 옵션 (모든 간판 몸통에): 없음 또는 채널 종류. 고르면 세부 옵션이 따라온다 */
const hasChannel = (opts: Options) => !!opts.channel && opts.channel !== CHANNEL_NONE;
const isLit = (_opts: Options, o: SignObject) => o.productId !== 'ch-galva';
const EPOXY = CHANNEL_OPTIONS[3].label; // 갈바 에폭시 채널 (비조명)
const isEpoxy = (opts: Options) => opts.channel === EPOXY;
const chTypeOf = (opts: Options) => (opts.chType as string | undefined) ?? '캡';
/**
 * 채널 조합 (2026-10-15 한울상사 LED 채널간판 분류: 전광·후광·전후광(캡/오사이, 양면)·캡 단차(아크릴)·일체형·에폭시(갈바/스텐 25~50, 일체형 A/L 35~80)·
 * 캡/오사이 용접·A/L 타카·통아크릴·벌브, 입체 80mm 기준(100mm +10%), 각고딕·영문고딕 기준(예서체 상담), 까치발·도장 별도, 알루미늄 채널 프레임 150~400폭)
 */
const CHANNEL_FIELDS: OptionField[] = [
  sel('channel', '채널 (입체 글자)', [CHANNEL_NONE, ...CHANNEL_OPTIONS.map((c) => c.label)]),
  sel('chType', '채널 방식', ['캡', '오싸이', '일체형', '캡 단차(아크릴)'], (opts) => hasChannel(opts) && !isEpoxy(opts)),
  sel('chBuild', '제작 방식', ['용접', '타카'], (opts) => hasChannel(opts) && !isEpoxy(opts) && ['캡', '오싸이'].includes(chTypeOf(opts))),
  sel('chDepth', '입체 두께', ['80mm (기준)', '100mm (+10%)'], (opts) => hasChannel(opts) && !isEpoxy(opts)),
  sel('chDepth', '입체 두께', ['25mm', '30mm', '35mm', '50mm', '60mm', '80mm'], (opts) => isEpoxy(opts)),
  tog('chDouble', '양면 (돌출용 전후광)', (opts) => opts.channel === CHANNEL_OPTIONS[2].label),
  sel('ledColor', 'LED 색', ['백색', '주백색', '전구색', '빨강', '파랑', 'RGB'], (opts) => hasChannel(opts) && !isEpoxy(opts)),
  sel('font', '서체', ['각고딕·영문고딕 (기준)', '명조·예서체 등 (상담)'], hasChannel),
  ...paint('body', '알루미늄·측면·프레임 도색', hasChannel),
  txt('chHeight', '글자 높이 (mm)', '비우면 간판 높이', hasChannel),
  sel('chFrame', '알루미늄 채널 프레임', ['없음', '150폭', '200폭', '250폭', '300폭', '400폭'], hasChannel),
  sel('chFrameColor', '채널 프레임 색', ['진회색', '연회색', '검정', '백색'], (opts) => hasChannel(opts) && !!opts.chFrame && opts.chFrame !== '없음'),
  tog('bracket', '까치발 (별도)', hasChannel),
];

/** 제품별 옵션 (주문 사양) */
export const PRODUCT_OPTIONS: Record<string, OptionField[]> = {
  // 프레임 간판 (한울: 조명/비조명 · 카바/일반 텐션 · 단폭/장폭 4.5㎡ · 플렉스 UV/솔벤 양면·단면 출력)
  'board-flex': [SIDES, sel('light', '내부 조명', ['LED', '형광등', '비조명']), sel('frame', '프레임 구조', ['일반 텐션', '카바']), sel('print', '플렉스 출력', ['UV 양면 출력', 'UV 단면 출력', '솔벤 양면 출력', '솔벤 단면 출력'])],

  // 천갈이: 기존 프레임에 원단만 교체. 철거·LED 교체는 현장마다 달라 토글로
  'board-reface': [SIDES, sel('fabric', '원단', ['일반 후렉스', '고투과 후렉스(LED용)', '메쉬 후렉스']), tog('removeOld', '기존 원단 철거·폐기'), tog('ledReplace', '내부 LED 교체')],
  // 갈바·스텐 전면 (한울: 두께 100 이하 · 1도 도장 기준 · 폭 150~1200)
  'board-galva': [sel('material', '소재', ['갈바', '스텐']), sel('form', '형태', ['돌출형', '일체형(전면)']), sel('indirect', '간접조명', ['없음', 'T5 LED 주백색', 'T5 LED 전구색', '측면 LED 바']), ...paint('paint', '도색')],
  'board-foamex': [SIDES, sel('thick', '두께', ['3T', '5T', '8T', '10T', '15T', '20T', '30T']), sel('finish', '마감', ['실사 출력', '시트 컷팅', '도색']), ...paint('paint', '도색', (opts) => opts.finish === '도색')],
  'board-acp': [SIDES, sel('finish', '마감', ['실사 출력', '시트 컷팅', '도색']), ...paint('paint', '도색', (opts) => opts.finish === '도색')],
  // 아크릴 간판·현판 (한울 아크릴가공: 현판·게시판·액자·번호판/층수/호수, 판재 출력 레이어, 전처리 프라이머)
  'board-acrylic': [
    sel('form', '형태', ['일반 판', '현판', '게시판', '액자', '번호판·층수·호수']),
    sel('material', '아크릴', ['캐스팅', '압출', '펄', '미러', '한지']),
    sel('thick', '두께', ['3T', '5T', '8T', '10T', '15T', '20T', '30T']),
    sel('layers', '판재 출력', ['출력 없음', '컬러 (1레이어)', '화이트 (1레이어)', '컬러+화이트 (2레이어)', '컬러+화이트+컬러 (3레이어)', '컬러+컬러 (2레이어)']),
    tog('primer', '전처리 프라이머 (잉크 부착·스크래치 방지)', (opts) => !!opts.layers && opts.layers !== '출력 없음'),
    sel('mount', '부착', ['다보', '양면 테이프', '실리콘 직접 부착']),
  ],
  // 라이트패널 (한울: 단면/양면 · SMPS 내장/외장 · 옥외 방수형 · 프레임 블랙/실버/화이트)
  'board-lightpanel': [SIDES, sel('smps', 'SMPS (인버터)', ['내장형', '외장형']), sel('place', '설치', ['실내', '옥외 방수형']), sel('frameColor', '프레임 색', ['블랙', '실버', '화이트'])],
  // 패브릭 라이트박스 (한울: 바 높이 · 1㎡ 이하/이상 · 9구 확산바 · 조명용 패브릭 UV 출력 + 고무 팩킹)
  'board-fabric': [tog('diffuser', '9구 확산바'), sel('mount', '설치', ['벽 부착', '천장 매달기', '스탠드'])],
  // 지주 간판 (한울: 파이프·스텐·알미늄·갈바·갈바 사면 지주, 삼각기둥, 스텐/갈바 카바, LED 투광기)
  'board-pole': [sel('pole', '지주', ['파이프 지주', '스텐 지주', '알미늄 지주', '갈바 지주', '갈바 사면 지주', '삼각기둥']), sel('cover', '카바', ['없음', '스텐 카바', '갈바 카바']), sel('light', '조명', ['LED 내부 조명', 'LED 투광기', '비조명'])],
  // 어닝 (한울: 일반 폴딩 어닝 RECACRIL 원단 / 패션 어닝 디지털 양면 출력)
  'board-awning': [sel('type', '종류', ['일반 폴딩 어닝', '패션 어닝']), sel('fabric', '원단', ['아크릴 원단 (RECACRIL)', '디지털 양면 출력'])],
  // LED 사인미러 (한울: 흑경·브론즈경·은경 · AL 누드 사각/R · 골드·화이트·블랙 · 주광 5700K/전구 4000K)
  'board-mirror': [sel('mirror', '거울', ['은경', '흑경', '브론즈경']), sel('frame', '프레임', ['AL 누드 사각', 'AL 누드 사각 R']), sel('frameColor', '프레임 색', ['골드', '화이트', '블랙']), sel('led', 'LED 빛', ['주광색 5700K', '전구색 4000K'])],
  // 전광판 (한울: 3색 RW · 3색 RpG · 풀컬러 RpGB, 모듈 200/240/320mm, 단면/양면)
  'board-ledsign': [sel('color', '색', ['3색 (RW)', '3색 (RpG)', '풀컬러 (RpGB)']), sel('module', '모듈', ['200mm', '240mm', '320mm']), SIDES],
  // 에어간판 (한울: 2D 만, 완제품 통 높이 50cm 포함)
  'board-air': [],
  // 돌출 간판: 양면이 기본. 몸체가 갈바 도색일 때만 컬러코드. 브라켓(벽 고정 철물) 포함 여부
  'body-none': [],
  'board-protrude': [
    sel('sides', '면', ['양면', '단면']),
    sel('shape', '모양', ['사각', '원형']), // 한울: 사각·원형 돌출, 스텐·갈바·프레임 돌출
    sel('body', '몸체', ['갈바 도색', '스텐', '후렉스', '아크릴']),
    sel('light', '내부 조명', ['LED', '비조명']),
    ...paint('paint', '도색', (opts) => (opts.body ?? '갈바 도색') === '갈바 도색'),
    sel('bracket', '브라켓', ['기본 브라켓 포함', '별도 제작', '기존 브라켓 사용']),
  ],
  // 옛 데이터(채널 제품이 종류): 채널 세부 옵션만
  ...Object.fromEntries(['ch-front', 'ch-halo', 'ch-both', 'ch-galva'].map((id) => [id, [
    sel('chType', '채널 종류', ['캡', '오싸이', '일체형']),
    sel('ledColor', 'LED 색', ['백색', '주백색', '전구색', '빨강', '파랑', 'RGB'], isLit),
    ...paint('body', '알루미늄·측면·프레임 도색'),
    txt('chHeight', '글자 높이 (mm)', '비우면 간판 높이'),
  ]])),
  // 고무 스카시 (한울: 고무판 베이스 + 칼라 알루미늄 부착 30T 이하/50T, 수입 금색·은색 30T 이하, 10~130각)
  'ch-rubber': [sel('thickness', '두께', ['10T', '20T', '30T', '50T']), sel('front', '표면', ['칼라 알루미늄', '수입 금색', '수입 은색', '시트 부착', '아크릴 전면판', '없음']), txt('frontColor', '전면 색상', '예: 백색, RAL 3020', (opts) => opts.front !== '없음')],
  'sc-titan': [sel('color', '색상', ['골드', '실버', '로즈골드', '블랙', '브론즈']), sel('finish', '표면 마감', ['헤어라인(무광)', '미러(유광)'])],
  // 아크릴 스카시 = 레이저 커팅 (한울: 3/5/8/10T · 한글/영문 · 문자 크기 ~30~400mm 구간)
  'ch-scashi': [sel('thickness', '두께', ['3T', '5T', '8T', '10T']), sel('script', '문자', ['한글', '영문']), sel('colorMode', '색상', ['색상 코드', '지정 도색']), txt('colorCode', '색상 코드·도색', '예: 아크릴 #302, RAL 9010')],
};
/** 스카시 공통: 시공 보조 부속품 */
export const SCASHI_ACCESSORY_OPTIONS: OptionField[] = [
  tog('paperTemplate', '시공용 1:1 종이 도안'),
  tog('acrylicGuide', '아크릴 가다 (음각/양각 틀)'),
  sel('frontSheetAttached', '전면 시트 컷팅', ['부착 출고', '미부착']),
];
/** 시트 공통 + 시트별 */
export const SHEET_COMMON_OPTIONS: OptionField[] = [tog('transferTape', '보조시트(어플리케이션 테이프) 포함'), sel('coating', '코팅', ['코팅 없음', '유광', '무광'])];
const INK = sel('ink', '잉크', ['UV', '솔벤트']);
/** 시트별 (한울 시트지 실사: 원웨이(최대 폭 1150)·알미늄(바닥)·투명·엠보·리무벌·그레이·백색, UV/솔벤트) */
export const SHEET_OPTIONS: Record<string, OptionField[]> = {
  'sh-cut': [tog('halfCut', '반컷팅')],
  'sh-print': [sel('media', '실사 소재', ['백색', '투명', '알미늄 (바닥용)', '엠보', '리무벌', '그레이']), INK],
  'sh-perf': [INK],
};
const SCASHI_IDS = ['ch-rubber', 'sc-titan', 'ch-scashi'];

/** 이 사인물에 보여 줄 옵션 묶음 (조건부 필드는 현재 값으로 거른다) */
export function optionGroupsFor(o: SignObject): OptionGroup[] {
  const opts = o.options ?? {};
  const vis = (fs: OptionField[]) => fs.filter((f) => !f.when || f.when(opts, o));
  const groups: OptionGroup[] = [];
  const p = productById(o.productId);
  if (p) {
    // 간판 몸통이면 채널 옵션(+ 고른 채널의 세부)이 따라붙는다
    const fs = vis([...(PRODUCT_OPTIONS[p.id] ?? []), ...(p.category === 'board' && !NO_CHANNEL.has(p.id) ? CHANNEL_FIELDS : [])]);
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
