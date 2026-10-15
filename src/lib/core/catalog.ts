// 간판·시트 종류 (이름과 단위). 금액은 단가표(pricing.ts)에서.
export type Category = 'board' | 'channel';
/** m2 = 원/㎡, charCm = 원/자/cm(글자 높이), none = 금액 없음(몸통 없음) */
export type Unit = 'm2' | 'charCm' | 'none';

export interface Product { id: string; category: Category; name: string; unit: Unit }
export interface Sheet { id: string; name: string }

export const CATALOG: Product[] = [
  { id: 'board-flex', category: 'board', name: '후렉스 간판', unit: 'm2' },
  { id: 'board-reface', category: 'board', name: '간판 천갈이', unit: 'm2' }, // 기존 프레임은 두고 면(후렉스 원단)만 교체 (2026-10-15 사용자: "간판 천갈이가 따로 있다")
  { id: 'board-galva', category: 'board', name: '갈바 간판', unit: 'm2' },
  { id: 'board-acp', category: 'board', name: '알루미늄 복합판 간판', unit: 'm2' },
  { id: 'board-foamex', category: 'board', name: '포맥스 간판', unit: 'm2' },
  { id: 'board-acrylic', category: 'board', name: '아크릴 간판', unit: 'm2' },
  { id: 'board-protrude', category: 'board', name: '돌출 간판', unit: 'm2' }, // 벽에 수직으로 튀어나온 양면 간판 (2026-10-15). 단가는 양면 기준 ㎡
  { id: 'body-none', category: 'board', name: '몸통 없음 (벽면 직접 부착)', unit: 'none' }, // 채널 글자만 벽에 붙이는 간판
  // 채널은 **간판 종류가 아니라 옵션**(2026-10-15 사용자: "몸통 선택과 채널 선택을 조합하는 경우가 많다. 선택을 분리, 채널은 옵션으로").
  // 아래 채널 항목은 옵션의 단가(원/자·cm)이며 종류 목록(productsOf)에는 안 나온다. 옛 데이터의 productId 'ch-*' 는 몸통 없음 + 그 채널로 읽는다(signParts)
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
export const CATEGORY_LABEL: Record<Category, string> = { board: '간판 몸통', channel: '채널 (옵션)' };
export const UNIT_LABEL: Record<Unit, string> = { m2: '원/㎡', charCm: '원/자·cm', none: '—' };

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
export const productsOf = (g: Group): Product[] => (g === 'sheet' ? [] : CATALOG.filter((p) => groupOfProduct(p.id) === g && !isChannelProduct(p.id))); // 간판 = 몸통만 (채널은 옵션)
export const defaultProductFor = (g: Group): string | undefined => (g === 'sign' ? 'board-flex' : g === 'scashi' ? 'ch-rubber' : undefined);
/** 제품이 있으면 그 분류, 없고 시트만 있으면 시트, 아무것도 없으면 null */
export function categoryOf(o: { productId?: string; sheetIds: string[] }): Group | null {
  if (o.productId && productById(o.productId)) return groupOfProduct(o.productId);
  return o.sheetIds.length ? 'sheet' : null;
}

/** 채널 옵션 값 ↔ 채널 제품(단가) */
export const CHANNEL_OPTIONS: { id: string; label: string }[] = [
  { id: 'ch-front', label: '전광 채널' },
  { id: 'ch-halo', label: '후광 채널' },
  { id: 'ch-both', label: '전후광 채널' },
  { id: 'ch-galva', label: '갈바 에폭시 채널 (비조명)' },
];
export const CHANNEL_NONE = '없음';
export const isChannelProduct = (id?: string) => !!id && CATALOG.some((p) => p.id === id && p.category === 'channel' && !SCASHI_IDS.has(id));
/** 사인물의 몸통 id 와 채널 id. 옛 데이터(채널 제품이 종류)는 몸통 없음 + 그 채널 */
/** 채널 옵션이 없는 몸통: 천갈이는 기존 프레임에 원단만 바꾸므로 입체 글자가 붙지 않는다 */
export const NO_CHANNEL = new Set(['board-reface']);
export function signParts(o: { productId?: string; options?: Record<string, string | boolean> }): { bodyId: string | undefined; channelId: string | null } {
  if (isChannelProduct(o.productId)) return { bodyId: 'body-none', channelId: o.productId! };
  if (o.productId && NO_CHANNEL.has(o.productId)) return { bodyId: o.productId, channelId: null };
  const label = o.options?.channel;
  const ch = typeof label === 'string' ? CHANNEL_OPTIONS.find((c) => c.label === label) : undefined;
  return { bodyId: o.productId, channelId: ch ? ch.id : null };
}
