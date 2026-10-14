// 단가표 (2-1): 제작자가 정하는 숫자. 카탈로그는 이름·단위만 갖고 금액은 여기서 온다.
import { CATALOG, SHEETS } from './catalog';

export interface PriceTable {
  version: 1;
  /** 제품 단가: 보드는 원/㎡, 채널은 원/자/cm(글자 높이 1cm 당) */
  products: Record<string, number>;
  /** 시트 단가: 원/㎡ */
  sheets: Record<string, number>;
  /** 기본 설치·운반비 (프로젝트당 1회) */
  install: number;
  /** 항목 최소 금액 */
  minimum: number;
  /** 금액 반올림 단위 */
  rounding: 1 | 10 | 100 | 1000 | 10000;
  /** true = 단가가 부가세 포함가 (합계 = 공급가, 부가세는 안내용 역산) */
  vatIncluded: boolean;
}

const ROUNDINGS = [1, 10, 100, 1000, 10000] as const;

/** 예시 단가 (업체 단가표로 바꾸세요) */
export const DEFAULT_PRICES: PriceTable = {
  version: 1,
  products: {
    'board-foamex': 45000, 'board-acp': 85000, 'board-acrylic': 120000, 'board-galva': 70000, 'board-flex': 250000,
    'ch-front': 3200, 'ch-halo': 3800, 'ch-both': 4500, 'ch-galva': 2600, 'ch-rubber': 900, 'sc-titan': 2800, 'ch-scashi': 1200,
  },
  sheets: { 'sh-cut': 35000, 'sh-print': 30000, 'sh-reflect': 55000, 'sh-frost': 40000, 'sh-trans': 38000, 'sh-perf': 45000 },
  install: 250000,
  minimum: 0, // 기본은 최소 금액 없음 (제작자가 정하면 적용)
  rounding: 1000,
  vatIncluded: false,
};

const num = (v: unknown): number | null => (typeof v === 'number' && isFinite(v) && v >= 0 ? v : null);

/** 저장된 값(형식 불명)을 기본값 위에 합친다. 모르는 키·이상한 값은 버린다 */
export function mergePrices(saved: unknown): PriceTable {
  const out: PriceTable = { ...DEFAULT_PRICES, products: { ...DEFAULT_PRICES.products }, sheets: { ...DEFAULT_PRICES.sheets } };
  if (!saved || typeof saved !== 'object') return out;
  const s = saved as Record<string, unknown>;
  const take = (src: unknown, dst: Record<string, number>, ids: string[]) => {
    if (!src || typeof src !== 'object') return;
    for (const id of ids) {
      const v = num((src as Record<string, unknown>)[id]);
      if (v !== null) dst[id] = v;
    }
  };
  take(s.products, out.products, CATALOG.map((p) => p.id));
  take(s.sheets, out.sheets, SHEETS.map((x) => x.id));
  const install = num(s.install); if (install !== null) out.install = install;
  const minimum = num(s.minimum); if (minimum !== null) out.minimum = minimum;
  if ((ROUNDINGS as readonly number[]).includes(s.rounding as number)) out.rounding = s.rounding as PriceTable['rounding'];
  if (typeof s.vatIncluded === 'boolean') out.vatIncluded = s.vatIncluded;
  return out;
}

export const ROUNDING_OPTIONS = ROUNDINGS;
