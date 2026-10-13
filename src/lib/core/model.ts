import type { Pt } from './homography';

export type ShapeKind = 'rect' | 'ellipse' | 'polygon';

/** 사진 = 보드 위의 구역 */
export interface Photo {
  id: string;
  name: string;
  assetId: string;
  /** 원본 픽셀 크기 */
  w: number;
  h: number;
  /** 보드(world) 위 위치와 표시 폭 */
  x: number;
  y: number;
  width: number;
}

/** 사인물 오브젝트. 영역 좌표는 사진 원본 픽셀 기준 */
export interface SignObject {
  id: string;
  photoId: string;
  name: string;
  shape: ShapeKind;
  /** 외곽 사각 영역 TL,TR,BR,BL (원근 반영) */
  quad: Pt[];
  /** shape = polygon 일 때 윤곽 (사진 픽셀) */
  polygon?: Pt[];
  widthMm?: number;
  heightMm?: number;
  /** 보드/채널 제품 */
  productId?: string;
  /** 시트 (복수 선택) */
  sheetIds: string[];
  /** 채널 글자수 */
  charCount?: number;
  /** 리스트 뷰(전개도) 위 위치, mm */
  listX?: number;
  listY?: number;
  createdAt: number;
}

export interface Message {
  id: string;
  objectId: string;
  author: string;
  text: string;
  kind: 'chat' | 'comment';
  ts: number;
}
