// 주문 사양 옵션 스키마 (2026-10-14 사용자 요청: 사인물 통합 주문): 종류마다 옵션을 데이터로 두고 설정 창이 폼을 그린다.
// 새 품목·옵션은 여기에 한 줄 추가. 값은 SignObject.options (키 → 값) 에 저장되고, 조합 규칙은 `when` 으로.
import type { SignObject } from './model';
import { thicknessLabel } from './catalog';
import { CHANNEL_NONE, CHANNEL_OPTIONS, SCASHI_OPTIONS, productById, takesLetters } from './catalog';
import { TOP_COLORS, TOP_LIGHTS, TOP_LIGHT_NONE } from './topLight';
import { describeParts, partsOf } from './parts';
import { GLOSSES, PAINT_SYSTEMS, labelsOf, materialByLabel } from './materials';

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

/**
 * 도색 객체 (2026-10-16 사용자: "체널, 스카시, 도색이 필요한 곳에 도색 객체를 넣는다"): 색상 체계(도색 없음/PANTONE/RAL/KCC) → 고르면 컬러코드·광택.
 * 키 = `${prefix}System` · `${prefix}Code` · `${prefix}Gloss`
 */
const painted = (prefix: string) => (opts: Options) => !!opts[`${prefix}System`] && opts[`${prefix}System`] !== PAINT_SYSTEMS[0];
const paint = (prefix: string, label: string, when?: OptionField['when']): OptionField[] => [
  sel(`${prefix}System`, `${label} 색상 체계`, PAINT_SYSTEMS, when),
  txt(`${prefix}Code`, `${label} 컬러코드`, '예: RAL 9005', (opts, o) => (!when || when(opts, o)) && painted(prefix)(opts)),
  sel(`${prefix}Gloss`, `${label} 광택`, GLOSSES, (opts, o) => (!when || when(opts, o)) && painted(prefix)(opts)),
];
/** 재질 객체 (2026-10-16 사용자: "재질객체에 스텐, 철, 알루미늄 여기에 도색 객체를 추가해 사용한다"): 재질 선택 + 도색 가능한 재질이면 도색 객체 */
const material = (key: string, label: string, ids: string[], paintPrefix: string, paintLabel: string, when?: OptionField['when']): OptionField[] => [
  sel(key, label, labelsOf(ids), when),
  ...paint(paintPrefix, paintLabel, (opts, o) => (!when || when(opts, o)) && !!materialByLabel(opts[key] ?? labelsOf(ids)[0])?.paintable),
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
  // 측면 재질 객체 + 도색, 앞면 판 (전광·전후광: 아크릴/PC판 — 2026-10-16 사용자: "체널 전광의 경우 pc판도 선택할 수 있다")
  ...material('chSideMat', '측면 재질', ['alu', 'stain', 'iron', 'galva'], 'body', '측면', hasChannel),
  sel('chFace', '앞면 판', ['아크릴', 'PC판'], (opts) => opts.channel === CHANNEL_OPTIONS[0].label || opts.channel === CHANNEL_OPTIONS[2].label),
  txt('chHeight', '글자 높이 (mm)', '비우면 간판 높이', hasChannel),
  sel('chFrame', '알루미늄 채널 프레임', ['없음', '150폭', '200폭', '250폭', '300폭', '400폭'], hasChannel),
  sel('chFrameColor', '채널 프레임 색', ['진회색', '연회색', '검정', '백색'], (opts) => hasChannel(opts) && !!opts.chFrame && opts.chFrame !== '없음'),
  tog('bracket', '까치발 (별도)', hasChannel),
];

// ---------- 스카시: 두께 · 재질 · 도색 컬러코드 (2026-10-15 사용자: "스카시: 고무, 티타늄, 아크릴 (두께,재질, 도색컬러코드)") ----------
const SCASHI_SPEC: Record<string, { thick: string[]; material: string[] }> = {
  'ch-rubber': { thick: ['10T', '20T', '30T', '50T'], material: ['칼라 알루미늄', '수입 금색', '수입 은색', '시트 부착', '아크릴 전면판', '없음'] },
  'sc-titan': { thick: ['1.2T', '10T', '20T'], material: ['골드', '실버', '로즈골드', '블랙', '브론즈'] },
  'ch-scashi': { thick: ['3T', '5T', '8T', '10T'], material: ['캐스팅', '압출', '펄', '미러', '한지'] },
};
/** 도색: 체계(도색 없음/PANTONE/RAL/KCC) + 코드 (비우면 요약에 안 나온다) */
const scashiFields = (id: string): OptionField[] => [sel('thickness', '두께', SCASHI_SPEC[id].thick), sel('material', '재질', SCASHI_SPEC[id].material), ...paint('paint', '도색')];
/** 간판에 붙이는 스카시 (2026-10-15 사용자: "스카시도 부착된다"): 고르면 그 스카시의 두께·재질·도색, 글자 높이 */
const scIdOf = (opts: Options) => SCASHI_OPTIONS.find((c) => c.label === opts.scashi)?.id;
const SCASHI_ATTACH_FIELDS: OptionField[] = [
  sel('scashi', '스카시 부착', [CHANNEL_NONE, ...SCASHI_OPTIONS.map((c) => c.label)]),
  ...SCASHI_OPTIONS.flatMap((c) => [
    sel('scThick', '스카시 두께', SCASHI_SPEC[c.id].thick, (opts) => scIdOf(opts) === c.id),
    sel('scMaterial', '스카시 재질', SCASHI_SPEC[c.id].material, (opts) => scIdOf(opts) === c.id),
  ]),
  ...paint('scPaint', '스카시 도색', (opts) => !!scIdOf(opts)),
  txt('scHeight', '스카시 글자 높이 (mm)', '비우면 간판 높이', (opts) => !!scIdOf(opts)),
];
/** 간판 상단 조명 (2026-10-16 사용자: "간판에 상단에 돌출 조명, 트러스트바형식의 간접조명, 트러스트 타공조명 등을 자동 모델링") */
const hasTop = (opts: Options) => !!opts.topLight && opts.topLight !== TOP_LIGHT_NONE;
const TOP_LIGHT_FIELDS: OptionField[] = [
  sel('topLight', '상단 조명', [TOP_LIGHT_NONE, ...TOP_LIGHTS.map((t) => t.label)]),
  txt('topCount', '투광등 개수', '비우면 가로 1.2m 마다 하나', (opts) => opts.topLight === TOP_LIGHTS[0].label),
  sel('topArm', '팔 길이', ['300mm', '450mm', '600mm'], (opts) => opts.topLight === TOP_LIGHTS[0].label),
  sel('topColor', '빛 색', Object.keys(TOP_COLORS), hasTop),
];
/** 프레임 재질 (후렉스 제외 프레임 스타일, 2026-10-15 사용자: "프레임 재질(후렉스제외):스텐,알루미늄,철,천") */
const FRAME_MAT = material('frameMat', '프레임 재질', ['stain', 'iron', 'alu', 'tension'], 'framePaint', '프레임 도색');
/** 옛 간접조명 선택 — 상단 조명(트러스 바 간접조명 등)과 겹쳐 없앰(2026-10-16). 옛 값은 요약에만 */
const INDIRECT = sel('indirect', '간접조명', ['없음', 'T5 LED 주백색', 'T5 LED 전구색', '측면 LED 바']);

/** 제품별 옵션 (주문 사양) */
export const PRODUCT_OPTIONS: Record<string, OptionField[]> = {
  // 프레임 간판 (한울: 조명/비조명 · 카바/일반 텐션 · 단폭/장폭 4.5㎡ · 플렉스 UV/솔벤 양면·단면 출력)
  'board-flex': [SIDES, sel('light', '내부 조명', ['LED', '형광등', '비조명']), sel('frame', '프레임 구조', ['일반 텐션', '카바']), sel('print', '플렉스 출력', ['UV 양면 출력', 'UV 단면 출력', '솔벤 양면 출력', '솔벤 단면 출력'])],

  // 천갈이: 기존 프레임에 원단만 교체. 철거·LED 교체는 현장마다 달라 토글로
  'board-reface': [SIDES, sel('fabric', '원단', ['일반 후렉스', '고투과 후렉스(LED용)', '메쉬 후렉스']), tog('removeOld', '기존 원단 철거·폐기'), tog('ledReplace', '내부 LED 교체')],
  // 갈바·스텐 전면 (한울: 두께 100 이하 · 1도 도장 기준 · 폭 150~1200)
  'board-galva': [...FRAME_MAT, sel('form', '형태', ['돌출형', '일체형(전면)']), ...paint('paint', '도색')], // 간접조명은 상단 조명으로
  // 트러스 (사용자 "트러스트": 채널을 잡는 프레임보다 가는 프레임) · 파이프 간접
  'board-truss': [...FRAME_MAT], // 조명은 상단 조명으로
  'board-pipe': [...FRAME_MAT],
  // 포맥스 (2026-10-15 사용자: "포멕스:uv시트부착")
  // 두께 = 치수 두께(빠른 선택 3~30T), UV 시트 = 구성 요소 (2026-10-16 중복 정리)
  'board-foamex': [],
  // 현수막 (한울: 일반·솔벤 출력, 기본 마감(재단·막대·타공·끈고리 4개) + 추가 마감)
  banner: [sel('print', '출력', ['일반', '솔벤']), tog('stitch', '줄미싱'), tog('endStitch', '양끝미싱'), tog('join', '장폭이음·사방미싱'), tog('band', '밴드미싱')],
  // 액자 (2026-10-15 사용자: "액자에 나무틀 패브릭도")
  'frame-plain': [sel('frameColor', '프레임 색', ['실버', '화이트', '블랙'])], // 출력물 = 시트 구성 요소
  'frame-wood': [sel('wood', '나무틀', ['원목', '화이트', '블랙', '월넛']), sel('fabric', '패브릭', ['UV 패브릭 출력'])],
  'board-acp': [SIDES, ...paint('paint', '도색')], // 실사·시트 마감 = 시트 구성 요소
  // 아크릴 간판·현판 (한울 아크릴가공: 현판·게시판·액자·번호판/층수/호수, 판재 출력 레이어, 전처리 프라이머)
  'board-acrylic': [
    sel('form', '형태', ['일반 판', '현판', '게시판', '액자', '번호판·층수·호수']),
    sel('material', '아크릴', ['캐스팅', '압출', '펄', '미러', '한지']),
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
  // 어닝 (2026-10-15 사용자: "고정형,접이식(수동,자동, 펼침, 제작사, 천코드,핸들좌우,핸들길이)", "펼침 = 벽에서 나오는 길이, 직접입력")
  'board-awning': [
    sel('form', '형태', ['고정형', '접이식']),
    sel('drive', '작동', ['수동', '자동'], (opts) => opts.form === '접이식'),
    sel('handleSide', '핸들 위치', ['좌', '우'], (opts) => opts.form === '접이식' && opts.drive !== '자동'),
    txt('handleLength', '핸들 길이 (mm)', '예: 1500', (opts) => opts.form === '접이식' && opts.drive !== '자동'),
    txt('reach', '펼침 (벽에서 나오는 길이 mm)', '예: 1200'),
    txt('maker', '제작사', '직접 입력'),
    txt('fabricCode', '천 코드', '직접 입력'),
  ],
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
  // 스카시: 두께 · 재질 · 도색 컬러코드 (+ 티타늄 표면 마감, 아크릴 문자)
  'ch-rubber': scashiFields('ch-rubber'),
  'sc-titan': [...scashiFields('sc-titan'), sel('finish', '표면 마감', ['헤어라인(무광)', '미러(유광)'])],
  'ch-scashi': [...scashiFields('ch-scashi'), sel('script', '문자', ['한글', '영문'])],
};
/** 없앤 옵션(겹침) — 저장된 값이 있으면 요약에만 보인다 (두께는 치수 두께가 없을 때만) */
const PLATE_THICK_FIELD = sel('thick', '두께', ['3T', '5T', '8T', '10T', '15T', '20T', '30T']);
const LEGACY_FIELDS: Record<string, OptionField[]> = {
  'board-foamex': [PLATE_THICK_FIELD], 'board-acrylic': [PLATE_THICK_FIELD],
  'board-galva': [INDIRECT], 'board-pipe': [INDIRECT], 'board-truss': [sel('light', '조명', ['비조명', '간접 조명'])],
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
/** 시트별 (2026-10-15 사용자: "시트: uv실사(흰색,회색), 단색(재질)시트,안개") */
export const SHEET_OPTIONS: Record<string, OptionField[]> = {
  'sh-print': [sel('base', '바탕', ['흰색', '회색']), INK],
  'sh-cut': [sel('sheetMat', '재질', ['단색', '반사', '투명', '메탈', '홀로그램']), tog('halfCut', '반컷팅')],
  'sh-perf': [INK],
};
const SCASHI_IDS = ['ch-rubber', 'sc-titan', 'ch-scashi'];

/**
 * 구성 요소의 옵션 (조합형, 2026-10-16): 채널 = 채널 세부(채널 선택 제외, 고른 채널 종류 기준 조건), 스카시 = 두께·재질·도색(+ 표면 마감·문자), 시트 = 시트 공통 + 시트별.
 * 조건부 필드는 구성 요소 자신의 옵션 값으로 거른다
 */
export function partOptionFields(part: import('./model').SignPart): OptionField[] {
  const opts: Options = { ...(part.options ?? {}) };
  if (part.kind === 'channel') {
    const ctx = { ...opts, channel: CHANNEL_OPTIONS.find((c) => c.id === part.type)?.label ?? CHANNEL_NONE };
    return CHANNEL_FIELDS.slice(1).filter((f) => f.key !== 'chHeight' && (!f.when || f.when(ctx, {} as SignObject)));
  }
  const fs = part.kind === 'scashi' ? PRODUCT_OPTIONS[part.type] ?? [] : [...SHEET_COMMON_OPTIONS, ...(SHEET_OPTIONS[part.type] ?? [])];
  return fs.filter((f) => !f.when || f.when(opts, {} as SignObject));
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
    const fs = vis([...own, ...(takesLetters(p.id) ? [...(o.parts ? [] : [...CHANNEL_FIELDS, ...SCASHI_ATTACH_FIELDS]), ...TOP_LIGHT_FIELDS] : [])]); // 채널·스카시 부착·상단 조명은 간판 옵션. 조합형(parts)이면 채널·스카시는 구성 요소 카드에서
    if (fs.length) groups.push({ title: `${p.name} 사양`, fields: fs });
    if (SCASHI_IDS.includes(p.id)) groups.push({ title: '시공 보조 부속품', fields: vis(SCASHI_ACCESSORY_OPTIONS) });
  }
  if (o.sheetIds.length && !o.parts) { // 조합형이면 시트 옵션은 시트 구성 요소에
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
  const legacy = (LEGACY_FIELDS[o.productId ?? ''] ?? [])
    .filter((f) => opts[f.key] !== undefined && !['없음', '비조명'].includes(String(opts[f.key])) && !(f.key === 'thick' && o.depthMm))
    .map((f) => `${f.label} ${opts[f.key]}`);
  const thick = thicknessLabel(o); // 두께는 소재 옆에 (치수는 가로×세로만)
  const fromOptions = [...(thick ? [thick] : []), ...optionGroupsFor(o).flatMap((g) => g.fields.map((f) => describeField(f, defaults ? optionValue(f, opts) : opts[f.key])).filter((s): s is string => !!s)), ...legacy];
  // 조합형: 구성 요소마다 요약(이름·글자·그림) + 옵션 값 (2026-10-16). 스카시 분류는 옛 데이터도 구성 요소로
  const ps = o.parts ?? (o.productId && SCASHI_IDS.includes(o.productId) ? partsOf(o) : undefined);
  if (!ps) return fromOptions;
  const lines = describeParts(o);
  return [...fromOptions, ...ps.flatMap((p, i) => [lines[i], ...partOptionFields(p).map((f) => describeField(f, defaults ? optionValue(f, p.options ?? {}) : p.options?.[f.key])).filter((s): s is string => !!s)])];
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
