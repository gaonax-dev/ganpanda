// 재질 객체 · 도색 객체 (2026-10-16 사용자: "재질객체에 스텐, 철, 알루미늄 여기에 도색 객체를 추가해 사용한다. 체널, 스카시, 도색이 필요한 곳에 도색 객체를 넣는다.
// 체널 전광의 경우 pc판도 선택할 수 있다. 조합 가능한 건 객체를 구성하고 추후 제공되는 자제를 공급업체별로 구성하려한다.")
// 옵션 값은 사람이 읽는 이름(label)으로 저장하고, 여기 id 는 나중에 공급업체 자재(품목 코드·단가)를 붙일 자리다.

export interface Material { id: string; label: string; paintable: boolean }
/** 프레임·측면 등에 쓰는 재질 */
export const MATERIALS: Material[] = [
  { id: 'stain', label: '스텐', paintable: true },
  { id: 'iron', label: '철', paintable: true },
  { id: 'alu', label: '알루미늄', paintable: true },
  { id: 'galva', label: '갈바', paintable: true },
  { id: 'tension', label: '텐션 천', paintable: false },
];
/** 채널 앞면 판 (전광·전후광): 아크릴 / PC판 */
export const FACE_MATERIALS: Material[] = [
  { id: 'acrylic', label: '아크릴', paintable: false },
  { id: 'pc', label: 'PC판', paintable: false },
];
export const materialById = (id: string) => [...MATERIALS, ...FACE_MATERIALS].find((m) => m.id === id);
export const materialByLabel = (label: unknown) => [...MATERIALS, ...FACE_MATERIALS].find((m) => m.label === label);
/** 재질 id 목록 → 이름 목록 (옵션 값) */
export const labelsOf = (ids: string[]) => ids.map((id) => materialById(id)!.label);

/** 도색 객체: 색상 체계(도색 없음이 기본) + 컬러코드 + 광택. 기본색 = 색 이름으로 바로 (2026-10-17 빠른 설정 "갈바 흰색 / 채널 갈색") */
export const PAINT_SYSTEMS = ['도색 없음', '기본색', '직접', 'PANTONE', 'RAL', 'KCC', '라이브러리']; // 직접 = 컬러 피커로 고른 #hex (2026-10-17) · 라이브러리 = 내 컬러 카드 스냅샷(Code=이름, Hex, Ref — core/colorLibrary.ts)
/** 기본색: 이름 + 3D 에 쓰는 색. basic = 컬러 피커 견본 줄에 보이는 11개, 나머지는 글·확장 모드에서 (2026-10-17 "연한베이지 … 버건디" 도 알아보게) */
export const NAMED_COLORS: { label: string; hex: string; basic?: boolean }[] = [
  { label: '흰색', hex: '#f4f4f2', basic: true }, { label: '검정', hex: '#141414', basic: true }, { label: '회색', hex: '#8a8f94', basic: true }, { label: '진회색', hex: '#3a3f44', basic: true },
  { label: '갈색', hex: '#6b4423', basic: true }, { label: '빨강', hex: '#d62828', basic: true }, { label: '파랑', hex: '#1f5fbf', basic: true }, { label: '노랑', hex: '#ffcc00', basic: true },
  { label: '초록', hex: '#2e8b57', basic: true }, { label: '금색', hex: '#c9a227', basic: true }, { label: '은색', hex: '#d8dadd', basic: true },
  { label: '아이보리', hex: '#f3ead8' }, { label: '베이지', hex: '#d9c7a3' }, { label: '크림', hex: '#f6e9c9' }, { label: '연회색', hex: '#c4c8cc' },
  { label: '주황', hex: '#f26b1d' }, { label: '분홍', hex: '#e8739a' }, { label: '보라', hex: '#6a3fa0' }, { label: '남색', hex: '#1f2f5f' }, { label: '하늘', hex: '#7cc4f0' },
  { label: '연두', hex: '#9ccc3c' }, { label: '청록', hex: '#1f8f8f' }, { label: '민트', hex: '#8fd9c8' }, { label: '버건디', hex: '#7a1f2e' }, { label: '와인', hex: '#722f37' },
  { label: '카키', hex: '#7a7a4a' }, { label: '구리', hex: '#b87333' }, { label: '로즈골드', hex: '#d8a39d' }, { label: '네이비', hex: '#1b2a4a' }, { label: '올리브', hex: '#6b7a2a' },
];
export const BASIC_COLORS = NAMED_COLORS.filter((c) => c.basic);
/** 밝게/어둡게 (연한·진한): 0 < k < 1 → 흰색/검정 쪽으로 k 만큼 */
export function shadeHex(hex: string, toward: 'light' | 'dark', k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (shift: number) => { const v = (n >> shift) & 255; const t = toward === 'light' ? v + (255 - v) * k : v * (1 - k); return Math.round(Math.max(0, Math.min(255, t))).toString(16).padStart(2, '0'); };
  return `#${ch(16)}${ch(8)}${ch(0)}`;
}
export const colorHex = (label: unknown): string | null => NAMED_COLORS.find((c) => c.label === label)?.hex ?? null;
const HEX_RE = /^#[0-9a-f]{6}$/i;
/** 도색 객체 → 3D·칩에 쓰는 색: 기본색은 이름 → hex, 직접은 hex 그대로. 코드 체계(PANTONE·RAL·KCC)·없음은 null */
export function paintHex(opts: Record<string, unknown> | undefined, prefix: string): string | null {
  const sys = opts?.[`${prefix}System`], code = opts?.[`${prefix}Code`];
  if (sys === PAINT_SYSTEMS[1]) return colorHex(code);
  if (sys === PAINT_SYSTEMS[2] && typeof code === 'string' && HEX_RE.test(code)) return code.toLowerCase();
  if (sys === PAINT_SYSTEMS[6]) { const hex = opts?.[`${prefix}Hex`]; return typeof hex === 'string' && HEX_RE.test(hex) ? hex.toLowerCase() : null; }
  return null;
}
/** 라이브러리 색의 출처 ("시트 · 3M · 1080-G13"), 아니면 null */
export function paintRef(opts: Record<string, unknown> | undefined, prefix: string): string | null {
  if (opts?.[`${prefix}System`] !== PAINT_SYSTEMS[6]) return null;
  const ref = opts?.[`${prefix}Ref`];
  return typeof ref === 'string' && ref ? ref : null;
}
/** 도색 객체의 투명도(%) → 불투명도 0~1 (없으면 1). 2D 보드 바탕 표시용 */
export function paintAlpha(opts: Record<string, unknown> | undefined, prefix: string): number {
  const v = Number(opts?.[`${prefix}Alpha`]);
  return Number.isFinite(v) && v > 0 ? Math.max(0, Math.min(1, 1 - v / 100)) : 1;
}
/** 도색 객체 → 읽는 말: 색 이름 / #hex / "RAL 9005" / 체계만. 없으면 null */
export function paintLabel(opts: Record<string, unknown> | undefined, prefix: string): string | null {
  const sys = opts?.[`${prefix}System`] as string | undefined, code = opts?.[`${prefix}Code`] as string | undefined;
  if (!sys || sys === PAINT_SYSTEMS[0]) return null;
  if (sys === PAINT_SYSTEMS[1] || sys === PAINT_SYSTEMS[2] || sys === PAINT_SYSTEMS[6]) return code || null;
  return code ? `${sys} ${code}` : sys;
}
export const GLOSSES = ['유광', '반광', '무광'];
