// 간판·시트 종류 (이름과 단위). 금액은 단가표(pricing.ts)에서.
export type Category = 'board' | 'channel' | 'light';
/** m2 = 원/㎡, charCm = 원/자/cm(글자 높이), ea = 원/개(1식, 치수와 무관), none = 금액 없음(몸통 없음) */
export type Unit = 'm2' | 'charCm' | 'ea' | 'm' | 'none';

export interface Product { id: string; category: Category; name: string; unit: Unit }
export interface Sheet { id: string; name: string }

export const CATALOG: Product[] = [
  // 분류·종류 재정리 (2026-10-15 사용자: "간판,시트,스카시,포맥스,현수막,라이트패널,액자,어닝 / 프레임스타일:후렉스,갈바,트러스트,파이프간접 …",
  // "돌출, 알루미늄 복합판, 몸통 없음, 지주, 전광판 간판에 있고 사인미러는 따로"). id 는 그대로(호환), 순서 = 종류 목록 순서
  // 간판 — 프레임 스타일
  { id: 'board-flex', category: 'board', name: '후렉스', unit: 'm2' },
  { id: 'board-galva', category: 'board', name: '갈바', unit: 'm2' },
  { id: 'board-truss', category: 'board', name: '트러스 (얇은 프레임)', unit: 'm2' }, // 사용자 "트러스트": 채널을 잡는 프레임보다 가는 프레임 → 업계 용어 트러스
  { id: 'board-pipe', category: 'board', name: '파이프 간접', unit: 'm2' },
  { id: 'board-protrude', category: 'board', name: '돌출 간판', unit: 'm2' },
  { id: 'board-acp', category: 'board', name: '알루미늄 복합판', unit: 'm2' },
  { id: 'board-pole', category: 'board', name: '지주 간판', unit: 'ea' },
  { id: 'board-ledsign', category: 'board', name: '전광판', unit: 'ea' },
  { id: 'board-reface', category: 'board', name: '간판 천갈이', unit: 'm2' }, // 기존 프레임은 두고 면(후렉스 원단)만 교체 (2026-10-15 사용자: "간판 천갈이가 따로 있다")
  { id: 'board-air', category: 'board', name: '에어간판', unit: 'ea' },
  { id: 'body-none', category: 'board', name: '몸통 없음 (벽면 직접 부착)', unit: 'none' }, // 채널·스카시 글자만 벽에 붙이는 간판
  // 포맥스 · 현수막 · 라이트패널 · 액자 · 어닝 · 사인미러
  { id: 'board-foamex', category: 'board', name: '포맥스', unit: 'm2' },
  { id: 'banner', category: 'board', name: '현수막', unit: 'm2' },
  { id: 'board-lightpanel', category: 'board', name: '라이트패널', unit: 'm2' },
  { id: 'board-fabric', category: 'board', name: '패브릭 라이트박스', unit: 'm2' },
  { id: 'board-acrylic', category: 'board', name: '아크릴 액자·현판', unit: 'm2' },
  { id: 'frame-plain', category: 'board', name: '프레임 액자', unit: 'm2' },
  { id: 'frame-wood', category: 'board', name: '나무틀 패브릭 액자', unit: 'm2' },
  { id: 'board-awning', category: 'board', name: '어닝', unit: 'm2' },
  { id: 'board-mirror', category: 'board', name: 'LED 사인미러', unit: 'ea' },
  // 채널은 **간판 종류가 아니라 옵션**(2026-10-15 사용자: "몸통 선택과 채널 선택을 조합하는 경우가 많다. 선택을 분리, 채널은 옵션으로").
  // 아래 채널 항목은 옵션의 단가(원/자·cm)이며 종류 목록(productsOf)에는 안 나온다. 옛 데이터의 productId 'ch-*' 는 몸통 없음 + 그 채널로 읽는다(signParts)
  { id: 'ch-front', category: 'channel', name: '채널 간판 (전광)', unit: 'charCm' },
  { id: 'ch-halo', category: 'channel', name: '채널 간판 (후광)', unit: 'charCm' },
  { id: 'ch-both', category: 'channel', name: '채널 간판 (전후광)', unit: 'charCm' },
  { id: 'ch-galva', category: 'channel', name: '갈바 에폭시 채널 (비조명)', unit: 'charCm' },
  { id: 'ch-acrylic', category: 'channel', name: '통아크릴 채널', unit: 'charCm' },
  { id: 'ch-bulb', category: 'channel', name: '벌브 채널', unit: 'charCm' },
  { id: 'ch-rubber', category: 'channel', name: '고무 스카시', unit: 'charCm' },
  { id: 'sc-titan', category: 'channel', name: '티타늄 스카시', unit: 'charCm' },
  { id: 'ch-scashi', category: 'channel', name: '아크릴 스카시', unit: 'charCm' },
  // 간판 상단 조명 (옵션의 단가, 2026-10-16 사용자: "간판에 상단에 돌출 조명, 트러스트바형식의 간접조명, 트러스트 타공조명 등을 자동 모델링") — 종류 목록에는 안 나온다
  { id: 'tl-arm', category: 'light', name: '돌출 투광등', unit: 'ea' },
  { id: 'tl-bar', category: 'light', name: '트러스 바 간접조명', unit: 'm' },
  { id: 'tl-perf', category: 'light', name: '트러스 타공 조명', unit: 'm' },
];

// 시트 (2026-10-15 사용자: "시트: uv실사(흰색,회색), 단색(재질)시트,안개 / 시트커팅: 돔보(uv실사), 커팅(단색,재질시트)") — 커팅 방식은 종류에 따라 정해져 이름에 표시.
// 원웨이·반사·투명은 옛 데이터 호환용으로 남기고 고르는 목록(sheetsForPicker)에는 안 나온다 (반사·투명은 단색·재질 시트의 재질로)
export const SHEETS: Sheet[] = [
  { id: 'sh-print', name: 'UV 실사 (돔보 커팅)' },
  { id: 'sh-cut', name: '단색·재질 시트 (커팅)' },
  { id: 'sh-frost', name: '안개 시트 (커팅)' },
  { id: 'sh-perf', name: '원웨이 시트 (타공 실사)' },
  { id: 'sh-reflect', name: '반사 시트' },
  { id: 'sh-trans', name: '투명·반투명 시트' },
];

export const productById = (id?: string) => CATALOG.find((p) => p.id === id);
export const sheetById = (id: string) => SHEETS.find((s) => s.id === id);
/** 설정 창에서 고르는 시트 (옛 시트는 이미 붙어 있을 때만 보인다) */
export const sheetsForPicker = (): Sheet[] => SHEETS.filter((s) => ['sh-print', 'sh-cut', 'sh-frost'].includes(s.id));
export const CATEGORY_LABEL: Record<Category, string> = { board: '간판 몸통', channel: '채널 (옵션)', light: '상단 조명 (옵션)' };
export const UNIT_LABEL: Record<Unit, string> = { m2: '원/㎡', charCm: '원/자·cm', ea: '원/개', m: '원/m', none: '—' };

// ---------- 사인물 분류 (패널에서 고르는 큰 묶음) ----------
// 2026-10-15 사용자: "간판,시트,스카시,포맥스,현수막,라이트패널,액자,어닝" + "사인미러는 따로"
export type Group = 'sign' | 'sheet' | 'scashi' | 'foamex' | 'banner' | 'lightpanel' | 'frame' | 'awning' | 'mirror';
export const CATEGORY_GROUPS: { id: Group; label: string; hint: string }[] = [
  { id: 'sign', label: '간판', hint: '후렉스·갈바·트러스·파이프 간접·돌출 등 + 채널·스카시 부착' },
  { id: 'sheet', label: '시트', hint: 'UV 실사(돔보)·단색·재질 시트(커팅)·안개' },
  { id: 'scashi', label: '스카시', hint: '고무·티타늄·아크릴 입체 글자' },
  { id: 'foamex', label: '포맥스', hint: '포맥스 판 (UV 시트 부착)' },
  { id: 'banner', label: '현수막', hint: '현수막 출력과 마감' },
  { id: 'lightpanel', label: '라이트패널', hint: '라이트패널·패브릭 라이트박스' },
  { id: 'frame', label: '액자', hint: '아크릴·프레임·나무틀 패브릭 액자' },
  { id: 'awning', label: '어닝', hint: '고정형·접이식 어닝' },
  { id: 'mirror', label: '사인미러', hint: 'LED 사인미러' },
];
const GROUP_OF: Record<string, Group> = {
  'ch-rubber': 'scashi', 'sc-titan': 'scashi', 'ch-scashi': 'scashi',
  'board-foamex': 'foamex', banner: 'banner', 'board-lightpanel': 'lightpanel', 'board-fabric': 'lightpanel',
  'board-acrylic': 'frame', 'frame-plain': 'frame', 'frame-wood': 'frame', 'board-awning': 'awning', 'board-mirror': 'mirror',
};
const SCASHI_IDS = new Set(['ch-rubber', 'sc-titan', 'ch-scashi']);

export const groupOfProduct = (id: string): Group => GROUP_OF[id] ?? 'sign';
export const productsOf = (g: Group): Product[] => (g === 'sheet' ? [] : CATALOG.filter((p) => groupOfProduct(p.id) === g && !isChannelProduct(p.id) && p.category !== 'light')); // 간판 = 몸통만 (채널·상단 조명은 옵션)
/** 분류의 기본 종류 = 목록 첫 종류 (시트는 제품 없음) */
export const defaultProductFor = (g: Group): string | undefined => productsOf(g)[0]?.id;
/** 제품이 있으면 그 분류, 없고 시트만 있으면 시트, 아무것도 없으면 null */
export function categoryOf(o: { productId?: string; sheetIds: string[]; parts?: { kind: string }[] }): Group | null {
  if (o.productId && productById(o.productId)) return groupOfProduct(o.productId);
  return o.sheetIds.length || o.parts?.some((p) => p.kind === 'sheet') ? 'sheet' : null; // 시트 분류: 시트가 구성 요소로 옮겨져도
}

/** 채널 옵션 값 ↔ 채널 제품(단가) */
export const CHANNEL_OPTIONS: { id: string; label: string }[] = [
  { id: 'ch-front', label: '전광 채널' },
  { id: 'ch-halo', label: '후광 채널' },
  { id: 'ch-both', label: '전후광 채널' },
  { id: 'ch-galva', label: '갈바 에폭시 채널 (비조명)' },
  { id: 'ch-acrylic', label: '통아크릴 채널' },
  { id: 'ch-bulb', label: '벌브 채널' },
];
export const CHANNEL_NONE = '없음';
export const isChannelProduct = (id?: string) => !!id && CATALOG.some((p) => p.id === id && p.category === 'channel' && !SCASHI_IDS.has(id));
/** 사인물의 몸통 id 와 채널 id. 옛 데이터(채널 제품이 종류)는 몸통 없음 + 그 채널 */
/** 채널 옵션이 없는 몸통: 천갈이는 기존 프레임에 원단만 바꾸므로 입체 글자가 붙지 않는다 */
/** 치수 두께 빠른 선택 (mm) — 판 두께를 옵션으로 따로 두지 않는다 (2026-10-16 "포맥스의 경우 실측에 두께가 있어 포멕스 두께가 따로표시 중복된다") */
const PLATE_THICK = [3, 5, 8, 10, 15, 20, 30];
export const thickPresetsFor = (id?: string): number[] => (id === 'board-foamex' || id === 'board-acrylic' ? PLATE_THICK : []);
/** 두께는 소재에 (2026-10-16 사용자: "사인물 가로세로만 표시하고 두께는 소재에 붙이는게 맞을 거 같은데"): 받는 종류와 이름·단위. 현수막·어닝·에어간판·몸통 없음·스카시(카드에 두께)는 없음 */
const NO_THICK = new Set(['banner', 'board-awning', 'board-air', 'body-none']);
export function thicknessFieldOf(id?: string): { label: string; unit: 'T' | 'mm' } | null {
  if (!id || !productById(id) || NO_THICK.has(id) || isChannelProduct(id) || SCASHI_IDS.has(id)) return null;
  return thickPresetsFor(id).length ? { label: '판 두께', unit: 'T' } : { label: '두께', unit: 'mm' };
}
export const thicknessLabel = (o: { productId?: string; depthMm?: number }): string | null => {
  const t = thicknessFieldOf(o.productId);
  return t && o.depthMm ? (t.unit === 'T' ? `${o.depthMm}T` : `두께 ${o.depthMm.toLocaleString('ko-KR')}mm`) : null;
};
export const NO_CHANNEL = new Set(['board-reface', 'board-ledsign', 'board-air']); // 천갈이·전광판·에어간판은 채널이 붙지 않는다
/** 채널·스카시 부착은 간판의 옵션 (2026-10-15 사용자: "간판옵션이다. 그리고 스카시도 부착된다") — 간판 분류이고 NO_CHANNEL 이 아닌 몸통만 */
export const takesLetters = (id?: string) => !!id && groupOfProduct(id) === 'sign' && !NO_CHANNEL.has(id) && !isChannelProduct(id);
/** 간판에 붙이는 스카시 옵션 값 ↔ 스카시 제품(단가) */
export const SCASHI_OPTIONS: { id: string; label: string }[] = [
  { id: 'ch-rubber', label: '고무 스카시' },
  { id: 'sc-titan', label: '티타늄 스카시' },
  { id: 'ch-scashi', label: '아크릴 스카시' },
];
export function signParts(o: { productId?: string; options?: Record<string, string | boolean>; parts?: { kind: string; type: string }[] }): { bodyId: string | undefined; channelId: string | null; scashiId: string | null } {
  if (isChannelProduct(o.productId)) return { bodyId: 'body-none', channelId: o.productId!, scashiId: null };
  if (!takesLetters(o.productId)) return { bodyId: o.productId, channelId: null, scashiId: null };
  // 조합형: 저장된 구성 요소가 있으면 그 첫 채널·스카시 (2026-10-16)
  if (o.parts) return { bodyId: o.productId, channelId: o.parts.find((p) => p.kind === 'channel')?.type ?? null, scashiId: o.parts.find((p) => p.kind === 'scashi')?.type ?? null };
  const label = o.options?.channel, sc = o.options?.scashi;
  const ch = typeof label === 'string' ? CHANNEL_OPTIONS.find((c) => c.label === label) : undefined;
  const s = typeof sc === 'string' ? SCASHI_OPTIONS.find((c) => c.label === sc) : undefined;
  return { bodyId: o.productId, channelId: ch ? ch.id : null, scashiId: s ? s.id : null };
}
