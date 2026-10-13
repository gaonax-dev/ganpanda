// 간판·시트 종류 (이름과 단위). 금액은 단가표(pricing.ts)에서.
export type Category = 'board' | 'channel';
/** m2 = 원/㎡, charCm = 원/자/cm(글자 높이) */
export type Unit = 'm2' | 'charCm';

export interface Product { id: string; category: Category; name: string; unit: Unit }
export interface Sheet { id: string; name: string }

export const CATALOG: Product[] = [
  { id: 'board-foamex', category: 'board', name: '포맥스 보드', unit: 'm2' },
  { id: 'board-acp', category: 'board', name: '알루미늄 복합판', unit: 'm2' },
  { id: 'board-acrylic', category: 'board', name: '아크릴 판', unit: 'm2' },
  { id: 'board-galva', category: 'board', name: '갈바 판', unit: 'm2' },
  { id: 'board-flex', category: 'board', name: '플렉스 (내부 조명)', unit: 'm2' },
  { id: 'ch-front', category: 'channel', name: '전광 채널', unit: 'charCm' },
  { id: 'ch-halo', category: 'channel', name: '후광 채널', unit: 'charCm' },
  { id: 'ch-galva', category: 'channel', name: '갈바 에폭시 채널', unit: 'charCm' },
  { id: 'ch-scashi', category: 'channel', name: '스카시 (포맥스/아크릴)', unit: 'charCm' },
  { id: 'ch-rubber', category: 'channel', name: '고무 스카시', unit: 'charCm' },
];

export const SHEETS: Sheet[] = [
  { id: 'sh-cut', name: '컬러 시트 커팅' },
  { id: 'sh-print', name: '실사 출력 시트' },
  { id: 'sh-reflect', name: '반사 시트' },
  { id: 'sh-frost', name: '안개(에칭) 시트' },
  { id: 'sh-trans', name: '투명·반투명 시트' },
  { id: 'sh-perf', name: '타공(원웨이) 시트' },
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
const SCASHI_IDS = new Set(['ch-scashi', 'ch-rubber']);

export const groupOfProduct = (id: string): Group => (SCASHI_IDS.has(id) ? 'scashi' : 'sign');
export const productsOf = (g: Group): Product[] => (g === 'sheet' ? [] : CATALOG.filter((p) => groupOfProduct(p.id) === g));
export const defaultProductFor = (g: Group): string | undefined => (g === 'sign' ? 'board-acp' : g === 'scashi' ? 'ch-scashi' : undefined);
/** 제품이 있으면 그 분류, 없고 시트만 있으면 시트, 아무것도 없으면 null */
export function categoryOf(o: { productId?: string; sheetIds: string[] }): Group | null {
  if (o.productId && productById(o.productId)) return groupOfProduct(o.productId);
  return o.sheetIds.length ? 'sheet' : null;
}
