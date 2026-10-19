// 간판 상단 조명 (2026-10-16 사용자: "간판에 상단에 돌출 조명, 트러스트바형식의 간접조명, 트러스트 타공조명 등을 자동 모델링 할 수 있나?" → "진행해줘").
// 간판 옵션 topLight 로 종류를 고르고, 개수(비우면 가로 1.2m 마다 하나)·팔 길이·색온도. 견적은 투광등 = 개수 × 원/개, 트러스 = 간판 가로(m) × 원/m.
import type { SignObject } from './model';

export type TopLightKind = 'arm' | 'bar' | 'perf';
/** 3D 가 쓰는 상단 조명 사양 */
export interface TopLightSpec { kind: TopLightKind; count: number; armMm: number; color: string }

export const TOP_LIGHTS: { kind: TopLightKind; label: string; priceId: string }[] = [
  { kind: 'arm', label: '돌출 투광등', priceId: 'tl-arm' },
  { kind: 'bar', label: '트러스 바 간접조명', priceId: 'tl-bar' },
  { kind: 'perf', label: '트러스 타공 조명', priceId: 'tl-perf' },
];
export const TOP_LIGHT_NONE = '없음';
export const TOP_COLORS: Record<string, string> = { '주광색 5700K': '#f4f8ff', '주백색 4000K': '#fff4e0', '전구색 3000K': '#ffd9a0' };
/** 투광등 자동 개수: 가로 1.2m 마다 하나, 최소 1 */
export const ARM_SPACING_MM = 1200;
/** 타공 점 조명 간격 */
export const PERF_SPACING_MM = 120;

export type TopLightInfo = TopLightSpec & { label: string; priceId: string };
/** 상단 조명 사양: 종류(priceId: tl-arm/tl-bar/tl-perf) + 옵션(topCount·topArm·topColor) + 간판 가로. 2026-10-19 부터 구성 요소(kind 'light')의 type·options */
export function topLightFrom(priceId: string | undefined, opts: Record<string, unknown> | undefined, widthMm: number): TopLightInfo | null {
  const t = TOP_LIGHTS.find((x) => x.priceId === priceId);
  if (!t) return null;
  const typed = Math.floor(Number(opts?.topCount));
  const count = t.kind === 'arm' ? (typed > 0 ? typed : Math.max(1, Math.round(widthMm / ARM_SPACING_MM))) : 0;
  const armMm = t.kind === 'arm' ? Number.parseInt(String(opts?.topArm ?? '450'), 10) || 450 : 0;
  const color = TOP_COLORS[String(opts?.topColor ?? '')] ?? TOP_COLORS['주백색 4000K'];
  return { kind: t.kind, count, armMm, color, label: t.label, priceId: t.priceId };
}
/** 옛 몸통 옵션(options.topLight = 라벨)의 상단 조명 종류 id — 읽을 때 구성 요소로 바꾼다 (core/parts.ts) */
export const legacyTopLightId = (o: Pick<SignObject, 'options'>): string | undefined => TOP_LIGHTS.find((x) => x.label === o.options?.topLight)?.priceId;
/** 옛 몸통 옵션으로 읽기 (호환·테스트용). 새 코드는 parts.ts lightOf */
export function topLightOf(o: SignObject, widthMm?: number): TopLightInfo | null {
  return topLightFrom(legacyTopLightId(o), o.options, o.widthMm ?? widthMm ?? 0);
}
