// 공급업체 단가표 (2026-10-16 사용자: "한울 단가표이다. 해당 단가는 한울 꼬리표가 있어야 한다. 추후 거래업체에 단가표를 공급받아 제공하려한다.
// 현재는 사용자가 등록한 단가표로 구성해 해당 사용자만의 단가표이다. 지금은 개발중으로 둘다 구성하고 추후 업로드나 api로 단가를 공급받고 사용자가 입력가능하게")
// 공급 단가표는 읽기 전용 참고값이고, 견적은 언제나 사용자 단가표(`PriceTable`)로 낸다. 사용자 단가 항목은 공급 품목에 연결(link)할 수 있고,
// 연결하면 그 값을 가져다 쓰며 견적 줄에 공급업체 꼬리표가 붙는다. 업로드·API 로 받는 단가표는 `parseSupplierList` 로 검증한다.
import alidaRaw from './suppliers/alida-2025-03.json';

/** 단가 단위: 회배 = 1m × 1m = 1㎡ */
export type SupplierUnit = '회배' | '장' | '개' | 'm';
export const SUPPLIER_UNITS: readonly SupplierUnit[] = ['회배', '장', '개', 'm'];

export interface Supplier { id: string; name: string; /** 견적·단가 화면에 붙는 꼬리표 */ tag: string }
export interface SupplierItem {
  /** `<공급업체 id>.` 로 시작하는 고유 id */
  id: string;
  /** 분류 (출력 방식 등) */
  group: string;
  name: string;
  /** 같은 품목의 세부 (폭·면·레이어 등) */
  option?: string;
  /** 출력 최대폭 mm */
  maxWidthMm?: number;
  unit: SupplierUnit;
  price: number;
  /** true = 기본 단가에 더하는 추가금 (코팅·LG·마감 등) */
  surcharge?: boolean;
  note?: string;
}
export interface SupplierPriceList {
  supplier: Supplier;
  /** 단가표 적용일 YYYY-MM-DD */
  effectiveDate: string;
  source: 'pdf' | 'upload' | 'api';
  items: SupplierItem[];
}

type Row = [name: string, option: string | undefined, maxWidthMm: number | undefined, price: number, extra?: { unit?: SupplierUnit; surcharge?: boolean; note?: string }];
const ADD = { surcharge: true } as const;

/** 한울상사 원단별 단가표 (2026.03.27, PDF 스캔을 옮겨 적음). 그룹 → [키, 행] */
const HANWOOL_ROWS: [group: string, key: string, rows: Row[]][] = [
  ['수성', 'water', [
    ['유포/유포G', undefined, 1470, 8500, { note: '코팅 포함(무광·유광)' }],
    ['캘/그레이G', undefined, 1470, 9000, { note: '코팅 포함(무광·유광)' }],
    ['와이드', undefined, 1470, 10500, { note: '코팅 포함(무광·유광)' }],
    ['패트지', undefined, 1470, 10000, { note: '코팅 포함(무광·유광)' }],
    ['패트배너', undefined, undefined, 11000, { unit: '장', note: '600×1800 (2회배 미만)' }],
    ['UV코팅', undefined, undefined, 1000, ADD],
    ['현수막', '1회배 이하', undefined, 3000, { unit: '장' }],
    ['현수막', '3회배 미만', undefined, 6000, { unit: '장' }],
    ['현수막', '3회배 이상', undefined, 2000],
    ['텐트천', undefined, 1780, 5500],
    ['이음/줄미싱/특수재단', undefined, undefined, 1000, { ...ADD, note: '재단·막대·타공·고리(4개까지)는 추가금 없음' }],
    ['타공/끈고리', '4개 초과', undefined, 500, { ...ADD, unit: '개' }],
    ['큐방', undefined, undefined, 500, { ...ADD, unit: '개' }],
    ['밴드미싱', undefined, undefined, 2000, ADD],
  ]],
  ['UV', 'uv', [
    ['백색시트', undefined, 1470, 7500], ['그레이시트', undefined, 1470, 8000], ['리무벌', undefined, 1340, 10000], ['조명백색', undefined, 1340, 10500],
    ['투명시트', undefined, 1470, 8000], ['엠보시트', undefined, 1470, 7000], ['에어백색', undefined, 1470, 8500], ['블랙시트', undefined, 1470, 8000],
    ['와이드', undefined, 1220, 10000], ['와이드', '대형', 2100, 35000], ['클리어', undefined, 1470, 8500], ['축광시트', undefined, 1190, 25000],
    ['알미늄시트', undefined, 1340, 36000], ['캔버스', undefined, 1470, 25000], ['방염시트', undefined, 1320, 15000],
    ['패브릭', '출력만', 1800, 15000], ['패브릭', '천갈이', 1800, 27000], ['패브릭', '1800 초과폭', 3050, 3000, ADD],
    ['투명배너', 'W 또는 C', undefined, 15500], ['투명배너', 'C+W', undefined, 20500], ['투명배너', 'C+W+C', undefined, 25500],
    ['매쉬천', undefined, 3150, 11000], ['매쉬천', '양면', 1250, 17000],
    ['매쉬배너', undefined, undefined, 12000, { unit: '장', note: '600×1800' }], ['매쉬배너', '양면', undefined, 18000, { unit: '장', note: '600×1800' }],
    ['패트지', undefined, 1470, 9000], ['패트배너', undefined, undefined, 8500, { unit: '장', note: '600×1800' }],
    ['블랙아웃배너', undefined, 1450, 11000], ['블랙아웃타포린', undefined, 1550, 9000],
    ['LG시트 사용', undefined, undefined, 1000, ADD], ['UV코팅(무광·유광)', undefined, undefined, 3000, ADD], ['UV코팅(무광·유광)', 'LG 사용 시', undefined, 500, ADD],
  ]],
  ['솔벤', 'solvent', [
    ['백색시트', undefined, 1470, 7500], ['그레이', undefined, 1470, 8000], ['리무벌', undefined, 1340, 10000], ['조명백색', undefined, 1340, 10500],
    ['투명', undefined, 1470, 8000], ['엠보', undefined, 1470, 7000], ['블랙', undefined, 1470, 8000], ['축광', undefined, 1190, 25000],
    ['에어백색', undefined, 1470, 8500], ['반사시트', undefined, 1180, 21000], ['고휘도반사시트', undefined, 1180, 31000],
    ['원웨이', '채널용', 1150, 25000], ['원웨이', '썬팅용', 1340, 17000],
    ['솔벤현수막', '단폭', 1800, 4000], ['솔벤현수막', '장폭', 3000, 5000], ['솔벤현수막', '3200폭 이상 이음·미싱', undefined, 1000, ADD],
    ['솔벤텐트천', '단폭', 1800, 6500], ['솔벤텐트천', '장폭', 3000, 7500],
    ['LG원단 사용', undefined, undefined, 1000, ADD], ['코팅(무광·유광)', undefined, undefined, 3000, ADD], ['코팅(무광·유광)', 'LG 사용 시', undefined, 500, ADD],
  ]],
  ['플렉스', 'flex', [
    ['솔벤', '단폭 2,100', 2100, 7000], ['솔벤', '장폭 3,040', 3040, 10000, { note: '장폭 2,101~3,000' }],
    ['UV 단면', '단폭 2,100', 2100, 8000], ['UV 단면', '장폭 3,000', 3000, 10000], ['UV 단면', '장폭 4,800', 4800, 12000, { note: '장폭 2,101~4,900' }],
    ['UV 양면', '단폭 2,100', 2100, 9000], ['UV 양면', '장폭 3,100', 3100, 11000], ['UV 양면', '장폭 4,800', 4800, 12000, { note: '장폭 2,101~4,900' }],
  ]],
  ['플렉스 마감', 'flexfin', [
    ['고주파', '단폭', undefined, 8000, { unit: 'm' }], ['고주파', '장폭(3.2m 이상)', undefined, 11000, { unit: 'm' }],
    ['클램프', undefined, undefined, 3000, { unit: '개' }], ['알미늄바', undefined, undefined, 8000, { unit: 'm', note: '1m 바' }],
    ['고주파 타공', '200mm 미만 간격', undefined, 1000, { ...ADD, unit: 'm' }], ['재단비', undefined, undefined, 1000, ADD],
  ]],
  ['라텍스', 'latex', [
    ['백색', undefined, 1470, 8000], ['그레이', undefined, 1470, 8500], ['리무벌', undefined, 1340, 10500], ['조명백색', undefined, 1340, 11000],
    ['투명', undefined, 1470, 8500], ['엠보', undefined, 1470, 7500], ['에어백색', undefined, 1470, 9000], ['블랙', undefined, 1470, 8500],
    ['LG 사용', undefined, undefined, 1000, ADD], ['코팅(무광·유광)', undefined, undefined, 3000, ADD], ['코팅(무광·유광)', 'LG 사용 시', undefined, 500, ADD],
  ]],
  ['UV시트평판', 'uvflat', [
    ['W', '투명·엠보', undefined, 10500], ['W', '클리어·코팅지', undefined, 11500],
    ['C+W', '투명·엠보', undefined, 13000], ['C+W', '클리어·코팅지', undefined, 14000],
    ['C+W+C', '투명·엠보', undefined, 23000], ['C+W+C', '클리어·코팅지', undefined, 24000],
    ['C+W2회+C', '투명·엠보', undefined, 28000], ['C+W2회+C', '클리어·코팅지', undefined, 29000],
  ]],
  ['컷팅', 'cut', [
    ['돔보/시트', undefined, 1470, 6000],
    ['50개 초과', '사각', undefined, 100, { ...ADD, unit: '개', note: '1회배 기준' }], ['50개 초과', '응용', undefined, 150, { ...ADD, unit: '개', note: '1회배 기준' }],
    ['각각재단', '판작업', undefined, 1000, { ...ADD, note: '1장·대형폭·판작업 불가 사이즈는 없음' }],
    ['시트지', 'LG시트 (내부용_LT)', undefined, 12000], ['시트지', 'LG시트 (외부용_LC)', undefined, 11500],
    ['시트지', '현대시트 (내부용_HL)', undefined, 11500], ['시트지', '현대시트 (외부용_AD)', undefined, 10500], ['시트지', '현대시트 (내부용_HS)', undefined, 9500],
    ['시트지', '울트라시트 (내부용_SC2)', undefined, 10000], ['시트지', '울트라시트 (외부용_SC3)', undefined, 11000], ['시트지', '울트라 엠보', undefined, 11000],
    ['종이도안', undefined, 1100, 3000],
  ]],
];

export const HANWOOL: SupplierPriceList = {
  supplier: { id: 'hanwool', name: '한울상사', tag: '한울' },
  effectiveDate: '2026-03-27',
  source: 'pdf',
  items: HANWOOL_ROWS.flatMap(([group, key, rows]) => rows.map(([name, option, maxWidthMm, price, extra]): SupplierItem => ({
    id: `hanwool.${key}.${name}${option ? `.${option}` : ''}`,
    group, name,
    ...(option ? { option } : {}),
    ...(maxWidthMm ? { maxWidthMm } : {}),
    unit: extra?.unit ?? '회배',
    price,
    ...(extra?.surcharge ? { surcharge: true } : {}),
    ...(extra?.note ? { note: extra.note } : {}),
  }))),
};


/** 연결 값 `<공급업체 id>:<품목 id>` */
export const linkOf = (list: SupplierPriceList, item: SupplierItem) => `${list.supplier.id}:${item.id}`;

export function findSupplierItem(link: string | undefined, lists: SupplierPriceList[] = SUPPLIER_LISTS): { list: SupplierPriceList; item: SupplierItem } | null {
  if (!link) return null;
  const i = link.indexOf(':');
  if (i < 0) return null;
  const list = lists.find((l) => l.supplier.id === link.slice(0, i));
  const item = list?.items.find((x) => x.id === link.slice(i + 1));
  return list && item ? { list, item } : null;
}

export const supplierTagOf = (link: string | undefined, lists?: SupplierPriceList[]): string | undefined => findSupplierItem(link, lists)?.list.supplier.tag;

/** 사용자 단가 단위에 연결할 수 있는 공급 품목 (㎡ = 회배 기본 단가, m = m, 개 = 개). 추가금은 제외 */
export function linkableItems(unit: string, lists: SupplierPriceList[] = SUPPLIER_LISTS): { list: SupplierPriceList; item: SupplierItem; link: string }[] {
  const want: SupplierUnit | null = unit === 'm2' ? '회배' : unit === 'm' ? 'm' : unit === 'ea' ? '개' : null;
  if (!want) return [];
  // 자당(글자 1자) 단가는 개 단위 제품(1식)에 맞지 않는다
  return lists.flatMap((list) => list.items.filter((x) => x.unit === want && !x.surcharge && !x.note?.includes('자당')).map((item) => ({ list, item, link: linkOf(list, item) })));
}

export const supplierItemLabel = (it: SupplierItem) => `${it.group} · ${it.name}${it.option ? ` (${it.option})` : ''}`;

const str = (v: unknown, max = 300): v is string => typeof v === 'string' && v.trim().length > 0 && v.length <= max;

/** 업로드·API 로 받은 단가표 검증. 공급업체 정보가 틀리면 list = null, 잘못된 품목은 errors 에 이유를 남기고 뺀다 */
export function parseSupplierList(raw: unknown): { list: SupplierPriceList | null; errors: string[] } {
  const errors: string[] = [];
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const s = (r.supplier && typeof r.supplier === 'object' ? r.supplier : {}) as Record<string, unknown>;
  if (!str(s.id, 40) || !/^[a-z0-9-]+$/.test(s.id) || !str(s.name, 60) || !str(s.tag, 20)) return { list: null, errors: ['공급업체(id·이름·꼬리표)가 없거나 잘못됨'] };
  if (!str(r.effectiveDate) || !/^\d{4}-\d{2}-\d{2}$/.test(r.effectiveDate)) return { list: null, errors: ['적용일(YYYY-MM-DD)이 없음'] };
  const source = r.source === 'api' || r.source === 'pdf' ? r.source : 'upload';
  const items: SupplierItem[] = [];
  const seen = new Set<string>();
  (Array.isArray(r.items) ? r.items : []).forEach((x, n) => {
    const it = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>;
    const why = !str(it.id) || seen.has(it.id) ? 'id 없음·중복'
      : !str(it.group) || !str(it.name) ? '분류·이름 없음'
      : !SUPPLIER_UNITS.includes(it.unit as SupplierUnit) ? `단위 '${String(it.unit)}' 모름`
      : !(typeof it.price === 'number' && isFinite(it.price) && it.price >= 0) ? '단가가 0 이상 숫자가 아님'
      : null;
    if (why) { errors.push(`${n + 1}번째 품목: ${why}`); return; }
    seen.add(it.id as string);
    items.push({
      id: it.id as string, group: it.group as string, name: it.name as string,
      ...(str(it.option) ? { option: it.option } : {}),
      ...(typeof it.maxWidthMm === 'number' && it.maxWidthMm > 0 ? { maxWidthMm: it.maxWidthMm } : {}),
      unit: it.unit as SupplierUnit, price: it.price as number,
      ...(it.surcharge === true ? { surcharge: true } : {}),
      ...(str(it.note) ? { note: it.note } : {}),
    });
  });
  return { list: { supplier: { id: s.id, name: s.name, tag: s.tag }, effectiveDate: r.effectiveDate, source, items }, errors };
}

/** 알리다솔루션 단가표 2025년 3월 1호 (PDF 4~21쪽, 2026-10-16 사용자: "간판제작사에 제공하는 단가야"). 업로드와 같은 형식(JSON)을 같은 검증으로 읽는다 */
const alida = parseSupplierList(alidaRaw);
export const ALIDA: SupplierPriceList = alida.list!;
export const ALIDA_ERRORS = alida.errors;

/** 지금 쓰는 공급 단가표 (나중에 업로드·API 로 받은 것이 더해진다) */
export const SUPPLIER_LISTS: SupplierPriceList[] = [HANWOOL, ALIDA];
