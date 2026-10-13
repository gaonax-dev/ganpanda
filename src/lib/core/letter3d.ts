// 입체 간판 (4차): 사인물 → 3D 글자 사양, 폰트 기준 폭 계산
import type { Font } from 'opentype.js';
import type { SignObject } from './model';
import type { Lighting, SignSpec } from '../sim/types';
import { channelGeometry } from '../sim/signs';

/** 사인물에 저장하는 입체 설정 */
export interface Letter3D { depthMm: number; faceColor: string; sideColor: string; letterSpacing: number }

export const DEFAULT_LETTER3D: Letter3D = { depthMm: 80, faceColor: '#ff3b30', sideColor: '#d8dadd', letterSpacing: 0.02 };

/** 제품 → 조명: 전광 채널은 면 발광, 후광 채널은 벽면 반사, 그 외 비조명 */
export function lightingOf(productId: string | undefined): Lighting {
  if (productId === 'ch-front') return 'front';
  if (productId === 'ch-halo') return 'halo';
  return 'none';
}

/** 3D 로 만들 수 있는 사인물(문구·높이 있음) → 시뮬레이터 사양. 아니면 null */
export function specFromObject(o: SignObject): SignSpec | null {
  const text = (o.text ?? '').trim();
  if (!text || !o.heightMm) return null;
  const l = { ...DEFAULT_LETTER3D, ...(o.letter3d ?? {}) };
  return {
    id: o.id, kind: 'channel', text, heightMm: o.heightMm, widthMm: o.widthMm ?? 0, depthMm: l.depthMm,
    letterSpacing: l.letterSpacing, lighting: lightingOf(o.productId), faceColor: l.faceColor, sideColor: l.sideColor,
    textColor: '#ffffff', x: 0, y: 0,
  };
}

/** 폰트로 조판했을 때 전체 폭(mm) — 채널 간판 폭 자동 산출 */
export function measureTextWidthMm(font: Font, text: string, heightMm: number, letterSpacing: number): number {
  if (!text.trim() || !heightMm) return 0;
  const { geometry, measured } = channelGeometry({ ...DEFAULT_LETTER3D, id: 'm', kind: 'channel', text, heightMm, widthMm: 0, letterSpacing, lighting: 'none', textColor: '#fff', x: 0, y: 0 }, font);
  geometry.dispose();
  return measured.widthMm;
}
