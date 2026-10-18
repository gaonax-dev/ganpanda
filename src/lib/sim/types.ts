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
  /** 채널: 옆면(몰딩) 색 · 박스: 프레임 색 (옆면 + 앞면 테) */
  sideColor: string;
  /** 박스 앞면 테(프레임이 앞에서 보이는 폭, mm). 0·없음 = 테 없이 판이 앞면 전체 (갈바·복합판·포맥스) — 2026-10-17 "3d에서 프레임과 판을 구별하나?" */
  frameMm?: number;
  /** 박스 글자색 */
  textColor: string;
  /**
   * 채널: 글자를 정면도의 글자 상자에 맞춘다 (2026-10-18 "2d결과물은 속성 정면도를 따르는데 3d는 따르지 않는다") — 정면도 편집기·2D 카드와 같은 규칙:
   * 글자 크기(폰트 크기) = 상자 높이 90%, 글자 폭 = 상자 폭 96% 에 늘이고 줄임(textLength spacingAndGlyphs). 없으면 잉크 높이 = heightMm, 폭은 폰트대로
   */
  fitBox?: { w: number; h: number };
  /** 박스 위에 얹는 입체 글자 (간판 몸통 + 채널 옵션). 없으면 박스만 */
  letters?: { text: string; heightMm: number; depthMm: number; lighting: Lighting; faceColor: string; sideColor: string; letterSpacing: number };
  /**
   * 조합형 4단계 (2026-10-16): 구성 요소의 글자 객체마다 자기 자리(상자 중심 기준 mm, 위 +)에 입체 글자.
   * 있으면 letters 대신 이것 — 정면도 편집기에서 정한 위치·상자 크기 그대로(상자 안에 2D 와 같은 규칙으로 맞춤)
   */
  letterItems?: { text: string; heightMm: number; /** 글자 상자 폭 (mm) — 있으면 상자에 맞춘다(fitBox) */ widthMm?: number; depthMm: number; lighting: Lighting; faceColor: string; sideColor: string; letterSpacing: number; x: number; y: number }[];
  /** 앞면에 평면으로 그리는 객체 (그림, 시트의 글자): 중심 기준 mm, 위 +. 그림은 buildSign 의 images[id] */
  faceItems?: { id: string; kind: 'text' | 'image'; text?: string; x: number; y: number; w: number; h: number; color: string }[];
  /** 몸통 없음: 상자는 그리지 않고 글자만 (letterItems) */
  bodyless?: boolean;
  /** 간판 상단 조명 (2026-10-16): 돌출 투광등 / 트러스 바 간접 / 트러스 타공 */
  topLight?: import('../core/topLight').TopLightSpec;
  /** 벽 좌표 중심 (mm) */
  x: number;
  y: number;
}

export interface Measured {
  widthMm: number;
  heightMm: number;
  charCount: number;
}
