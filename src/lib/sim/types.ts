export type SignKind = 'channel' | 'lightbox';
/** front: 전광(면 발광) / halo: 후광(벽면 반사) / none: 비조명 */
export type Lighting = 'front' | 'halo' | 'none';

export interface SignSpec {
  id: string;
  kind: SignKind;
  text: string;
  /** 채널: 글자 높이 / 박스: 박스 세로 (mm) */
  heightMm: number;
  /** 박스 가로 (mm). 채널은 글자 폭에서 자동 */
  widthMm: number;
  /** 두께 (mm) */
  depthMm: number;
  /** 박스 모서리 둥글기 (짧은 변 대비 반지름 비율 0~0.5) */
  corner?: number;
  letterSpacing: number;
  lighting: Lighting;
  /** 채널: 면/LED 색 · 박스: 바탕색 */
  faceColor: string;
  /** 채널: 옆면(몰딩) 색 · 박스: 프레임 색 */
  sideColor: string;
  /** 박스 글자색 */
  textColor: string;
  /** 박스 위에 얹는 입체 글자 (간판 몸통 + 채널 옵션). 없으면 박스만 */
  letters?: { text: string; heightMm: number; depthMm: number; lighting: Lighting; faceColor: string; sideColor: string; letterSpacing: number };
  /** 벽 좌표 중심 (mm) */
  x: number;
  y: number;
}

export interface Measured {
  widthMm: number;
  heightMm: number;
  charCount: number;
}
