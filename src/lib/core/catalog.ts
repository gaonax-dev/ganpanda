// 간판·시트 종류 (이름과 단위). 금액은 단가표(pricing.ts)에서.
export type Category = 'board' | 'channel';
/** m2 = 원/㎡, charCm = 원/자/cm(글자 높이) */
export type Unit = 'm2' | 'charCm';

export interface Product { id: string; category: Category; name: string; unit: Unit }
export interface Sheet { id: string; name: string }

export const CATALOG: Product[] = [
  { id: 'board-flex', category: 'board', name: '후렉스 간판', unit: 'm2' },
  { id: 'board-galva', category: 'board', name: '갈바 간판', unit: 'm2' },
  { id: 'board-acp', category: 'board', name: '알루미늄 복합판 간판', unit: 'm2' },
  { id: 'board-foamex', category: 'board', name: '포맥스 간판', unit: 'm2' },
  { id: 'board-acrylic', category: 'board', name: '아크릴 간판', unit: 'm2' },
  { id: 'board-protrude', category: 'board', name: '돌출 간판', unit: 'm2' }, // 벽에 수직으로 튀어나온 양면 간판 (2026-10-15). 단가는 양면 기준 ㎡
  { id: 'ch-front', category: 'channel', name: '채널 간판 (전광)', unit: 'charCm' },
  { id: 'ch-halo', category: 'channel', name: '채널 간판 (후광)', unit: 'charCm' },
  { id: 'ch-both', category: 'channel', name: '채널 간판 (전후광)', unit: 'charCm' },
  { id: 'ch-galva', category: 'channel', name: '갈바 에폭시 채널 (비조명)', unit: 'charCm' },
  { id: 'ch-rubber', category: 'channel', name: '고무 스카시', unit: 'charCm' },
  { id: 'sc-titan', category: 'channel', name: '티타늄 스카시', unit: 'charCm' },
  { id: 'ch-scashi', category: 'channel', name: '아크릴 스카시', unit: 'charCm' },
];

export const SHEETS: Sheet[] = [
  { id: 'sh-perf', name: '원웨이 시트 (타공 실사)' },
  { id: 'sh-print', name: '돔보 컷팅 (실사 + 칼선)' },
  { id: 'sh-cut', name: '시트 컷팅 (단색, 칼선)' },
  { id: 'sh-reflect', name: '반사 시트' },
  { id: 'sh-frost', name: '안개(에칭) 시트' },
  { id: 'sh-trans', name: '투명·반투명 시트' },
];

export const productById = (id?: string) => CATALOG.find((p) => p.id === id);
export const sheetById = (id: string) => SHEETS.find((s) => s.id === id);
export const CATEGORY_LABEL: Record<Category, string> = { board: '보드', channel: '채널' };
export const UNIT_LABEL: Record<Unit, string> = { m2: '원/㎡', charCm: '원/자·cm' };

// ---------- 사인물 분류 (패널에서 고르는 큰 묶음) ----------
// 간판 = 보드 + 조명 채널, 스카시 = 비조명 입체 글자, 시트 = 제품 없이 시트만
export type Group = 'sign' | 'scashi' | 'sheet';
export const CATEGORY_GROUPS: { id: Group; label: string; hint: string }[] = [
  { id: 'sign', label: '간판', hint: '보드·채널(전광·후광) 간판' },
  { id: 'scashi', label: '스카시', hint: '비조명 입체 글자' },
  { id: 'sheet', label: '시트', hint: '유리·벽면 시트 작업' },
];
const SCASHI_IDS = new Set(['ch-rubber', 'sc-titan', 'ch-scashi']);

export const groupOfProduct = (id: string): Group => (SCASHI_IDS.has(id) ? 'scashi' : 'sign');
export const productsOf = (g: Group): Product[] => (g === 'sheet' ? [] : CATALOG.filter((p) => groupOfProduct(p.id) === g));
export const defaultProductFor = (g: Group): string | undefined => (g === 'sign' ? 'board-flex' : g === 'scashi' ? 'ch-rubber' : undefined);
/** 제품이 있으면 그 분류, 없고 시트만 있으면 시트, 아무것도 없으면 null */
export function categoryOf(o: { productId?: string; sheetIds: string[] }): Group | null {
  if (o.productId && productById(o.productId)) return groupOfProduct(o.productId);
  return o.sheetIds.length ? 'sheet' : null;
}
