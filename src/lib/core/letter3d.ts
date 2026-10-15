// 입체 간판 (4차): 사인물 → 3D 글자 사양, 폰트 기준 폭 계산
import type { SignObject } from './model';
import type { Lighting, SignSpec } from '../sim/types';
import { signParts } from './catalog';

/** 사인물에 저장하는 입체 설정 */
export interface Letter3D { depthMm: number; faceColor: string; sideColor: string; letterSpacing: number }

export const DEFAULT_LETTER3D: Letter3D = { depthMm: 80, faceColor: '#ff3b30', sideColor: '#d8dadd', letterSpacing: 0.02 };

/** 채널 id → 조명: 전광 채널은 면 발광, 후광 채널은 벽면 반사, 그 외 비조명 */
export function lightingOf(channelId: string | null | undefined): Lighting {
  if (channelId === 'ch-front' || channelId === 'ch-both' || channelId === 'ch-acrylic' || channelId === 'ch-bulb') return 'front';
  if (channelId === 'ch-halo') return 'halo';
  return 'none';
}
/** 사인물의 채널 글자 높이(mm): 옵션 chHeight, 없으면 간판 높이 */
export const channelHeightOf = (o: SignObject): number | undefined => Number(o.options?.chHeight) || o.heightMm;

/** 3D 로 만들 수 있는 사인물(문구·높이 있음) → 시뮬레이터 사양. 아니면 null */
export function specFromObject(o: SignObject): SignSpec | null {
  // 조합형 (2026-10-16): 첫 채널 구성 요소의 글자 객체들 (이어 붙이고 가장 큰 높이)
  const cp = o.parts?.find((p) => p.kind === 'channel' && p.items.some((i) => i.kind === 'text' && (i.text ?? '').trim()));
  const cps = cp ? cp.items.filter((i) => i.kind === 'text' && (i.text ?? '').trim()) : [];
  const text = o.parts ? cps.map((i) => (i.text ?? '').trim()).join(' ') : (o.text ?? '').trim();
  const channelId = o.parts ? cp?.type ?? null : signParts(o).channelId;
  const h = o.parts ? (cps.length ? Math.max(...cps.map((i) => i.h)) : 0) : channelHeightOf(o);
  if (!text || !h || !channelId) return null; // 채널(입체 글자)이 있을 때만
  const l = { ...DEFAULT_LETTER3D, ...(o.letter3d ?? {}) };
  return {
    id: o.id, kind: 'channel', text, heightMm: h, widthMm: o.widthMm ?? 0, depthMm: l.depthMm,
    letterSpacing: l.letterSpacing, lighting: lightingOf(channelId), faceColor: l.faceColor, sideColor: l.sideColor,
    textColor: '#ffffff', x: 0, y: 0,
  };
}
