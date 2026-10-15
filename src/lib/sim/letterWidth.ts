// 폰트로 조판했을 때 전체 폭(mm) — 채널 간판 폭 자동 산출. three 를 쓰므로 core/letter3d 와 분리(메인 번들을 가볍게)
import type { Font } from 'opentype.js';
import { DEFAULT_LETTER3D } from '../core/letter3d';
import { channelGeometry } from './signs';

export function measureTextWidthMm(font: Font, text: string, heightMm: number, letterSpacing: number): number {
  if (!text.trim() || !heightMm) return 0;
  const { geometry, measured } = channelGeometry({ ...DEFAULT_LETTER3D, id: 'm', kind: 'channel', text, heightMm, widthMm: 0, letterSpacing, lighting: 'none', textColor: '#fff', x: 0, y: 0 }, font);
  geometry.dispose();
  return measured.widthMm;
}
