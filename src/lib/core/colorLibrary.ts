// 색 라이브러리 (2026-10-17 사용자: "색상관리가 중요하다. 컬러 카드를 놓고 컬러 생성 대화창으로 만들고 페인트·시트·천·필름 선택하고
// 컬러이름(버건디) 컬러피커로 컬러선택해주고 공급사명 해당코드 입력. 해당 컬러는 라이브러리에 저장해서 꺼내쓴다. 프로젝트 내에서(그룹 포함) 컬러 대화창에서 바로 선택").
// 컬러 카드 = 종류(페인트·시트·천·필름) + 이름 + hex + 공급사 + 공급사 코드. 계정 라이브러리(서버 `/api/me/colors`, 로컬 사본)에 저장되어 모든 프로젝트에서 꺼내 쓴다.
// 사인물에 고르면 도색 객체에 **스냅샷**으로 들어간다(`<prefix>System='라이브러리'` · Code=이름 · Hex · Ref) — 고객(열람)도 라이브러리 없이 색·출처를 본다.
import { PAINT_SYSTEMS } from './materials';

export const COLOR_KINDS = ['페인트', '시트', '천', '필름'] as const;
export type ColorKind = (typeof COLOR_KINDS)[number];
export interface ColorCard {
  id: string;
  kind: ColorKind;
  /** 읽는 이름 (버건디) — 사양 글에서도 이 이름을 알아본다 */
  name: string;
  /** #rrggbb */
  hex: string;
  /** 공급사 (3M, 삼화페인트…) */
  supplier?: string;
  /** 공급사의 색 코드 (1080-G13, KCC 7520…) */
  code?: string;
  createdAt: number;
}
export interface ColorLibrary { version: 1; colors: ColorCard[] }

export const LIBRARY_SYSTEM = PAINT_SYSTEMS[6]; // '라이브러리'
export const COLOR_LIBRARY_MAX = 300;
const HEX_RE = /^#[0-9a-f]{6}$/i;

export function newColorCard(c: Omit<ColorCard, 'id' | 'createdAt'>): ColorCard {
  return { ...c, name: c.name.trim(), hex: c.hex.toLowerCase(), supplier: c.supplier?.trim() || undefined, code: c.code?.trim() || undefined, id: crypto.randomUUID().slice(0, 8), createdAt: Date.now() };
}
/** 출처 한 줄: "시트 · 3M · 1080-G13" (없는 칸은 뺀다) */
export const cardRef = (c: Pick<ColorCard, 'kind' | 'supplier' | 'code'>) => [c.kind, c.supplier, c.code].filter(Boolean).join(' · ');
/** 카드 → 도색 객체 필드 (스냅샷) */
export function paintPatch(prefix: string, c: ColorCard): Record<string, string> {
  return { [`${prefix}System`]: LIBRARY_SYSTEM, [`${prefix}Code`]: c.name, [`${prefix}Hex`]: c.hex, [`${prefix}Ref`]: cardRef(c), [`${prefix}CardId`]: c.id };
}
/** 이름으로 찾기 (같은 이름이 여럿이면 최근 것) */
export const findCardByName = (lib: ColorCard[], name: string) => [...lib].reverse().find((c) => c.name === name.trim()) ?? null;

/** 서버·로컬에서 읽은 값 검사 (형식·크기). 틀리면 null */
export function validColorLibrary(v: unknown): ColorLibrary | null {
  if (!v || typeof v !== 'object') return null;
  const lib = v as { version?: unknown; colors?: unknown };
  if (lib.version !== 1 || !Array.isArray(lib.colors) || lib.colors.length > COLOR_LIBRARY_MAX) return null;
  const colors: ColorCard[] = [];
  for (const raw of lib.colors) {
    if (!raw || typeof raw !== 'object') return null;
    const c = raw as Record<string, unknown>;
    if (typeof c.id !== 'string' || !c.id || c.id.length > 40) return null;
    if (!COLOR_KINDS.includes(c.kind as ColorKind)) return null;
    if (typeof c.name !== 'string' || !c.name.trim() || c.name.length > 40) return null;
    if (typeof c.hex !== 'string' || !HEX_RE.test(c.hex)) return null;
    for (const k of ['supplier', 'code']) if (c[k] !== undefined && (typeof c[k] !== 'string' || (c[k] as string).length > 60)) return null;
    if (typeof c.createdAt !== 'number') return null;
    colors.push({ id: c.id, kind: c.kind as ColorKind, name: c.name, hex: (c.hex as string).toLowerCase(), supplier: c.supplier as string | undefined, code: c.code as string | undefined, createdAt: c.createdAt });
  }
  return { version: 1, colors };
}

const KEY = 'ganpanda.colors';
export function loadLocalColors(): ColorCard[] {
  try { return validColorLibrary(JSON.parse(localStorage.getItem(KEY) ?? 'null'))?.colors ?? []; } catch { return []; }
}
export function saveLocalColors(colors: ColorCard[]) {
  try { localStorage.setItem(KEY, JSON.stringify({ version: 1, colors } satisfies ColorLibrary)); } catch { /* 저장 불가 환경 */ }
}
