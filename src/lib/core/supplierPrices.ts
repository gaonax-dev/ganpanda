// 공급업체 단가표 (2026-10-16 사용자: "해당 단가는 공급사 꼬리표가 있어야 한다. 추후 거래업체에 단가표를 공급받아 제공하려한다.
// 현재는 사용자가 등록한 단가표로 구성해 해당 사용자만의 단가표이다. 지금은 개발중으로 둘다 구성하고 추후 업로드나 api로 단가를 공급받고 사용자가 입력가능하게")
// 공개 자료(알리다솔루션 공개 단가표)만 넣는다. 거래처가 개별로 준 단가표는 넣지 않는다 (2026-10-31 사용자: "한울 빼" — 한울상사 2026-03-27 단가표 제거)
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
export const SUPPLIER_LISTS: SupplierPriceList[] = [ALIDA];
