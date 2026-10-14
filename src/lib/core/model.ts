import type { Pt } from './homography';
import type { DesignHistoryEntry, DesignRef, SourceKind } from './design';
import type { Letter3D } from './letter3d';
import type { CameraSetup } from './camera';

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
  /** 작업 존들: 실제 작업할 벽면 영역 (사진 px 다각형, 3점 이상). AI 는 존 안만 분석 */
  zones?: Pt[][];
  /** @deprecated 옛 데이터 (존 하나). zonesOf() 로 읽는다 */
  zone?: Pt[];
  /** 카메라 설정: 축 선 두 쌍 + 원점 + 기준 길이 → 벽면 평면 (core/camera.ts). 사인물과 무관 */
  camera?: CameraSetup;
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
  /** 사각형 모서리 둥글기: 짧은 변 대비 반지름 비율 0~0.5 (0.5 = 알약/원). 원형 도구는 0.5 로 만든다 */
  corner?: number;
  widthMm?: number;
  heightMm?: number;
  /** 보드/채널 제품 */
  productId?: string;
  /** 시트 (복수 선택) */
  sheetIds: string[];
  /** 간판 문구 (채널 글자수 자동 산출, 견적서 표기) */
  text?: string;
  /** 채널 글자수 (수동 입력, 문구보다 우선) */
  charCount?: number;
  /** 입체 간판 설정 (채널: 두께·색·자간) */
  letter3d?: Letter3D;
  /** 입힌 디자인 (소스 페이지의 영역) */
  design?: DesignRef;
  /** 디자인 변경 이력 (최신이 앞) */
  designHistory?: DesignHistoryEntry[];
  /** 리스트 뷰(전개도) 위 위치, mm */
  listX?: number;
  listY?: number;
  /** 주문 사양 옵션 (core/options.ts 스키마의 키 → 값) */
  options?: Record<string, string | boolean>;
  /** 사인물별 요청사항 (배선 위치, 특수 가공 등) */
  note?: string;
  /** 다른 사진의 같은 사인물(원본 id). 규격은 원본에서 읽고 위치만 자기 것 → core/link.ts */
  sameAs?: string;
  createdAt: number;
}

/** 디자인 소스: 올린 파일 하나. 페이지(아트보드)마다 변환된 이미지 에셋 */
export interface SourcePage { assetId: string; w: number; h: number }
export interface DesignSource {
  id: string;
  name: string;
  kind: SourceKind;
  /** 원본 파일 에셋 (히스토리·재변환용) */
  fileAssetId: string;
  pages: SourcePage[];
  author: string;
  createdAt: number;
  /** UV 뷰 위 위치 (world) */
  x?: number;
  y?: number;
}

/** 사진 위 위치 코멘트(핀). 대화는 messages 에 objectId = 핀 id 로 */
export interface Pin {
  id: string;
  photoId: string;
  /** 사진 원본 px */
  x: number;
  y: number;
  author: string;
  createdAt: number;
  resolved: boolean;
  /** 사진 안에서 만든 순서 (표시용) */
  number: number;
}

export interface Attachment { assetId: string; name: string; type: string; size: number }

/** 견적 추가 항목 (할인은 음수) */
export interface ExtraItem { id: string; label: string; amount: number }

/** 프로젝트 설정 (단가표·설치비·추가 항목) — 모두 선택 */
export interface ProjectSettings {
  prices?: import('./pricing').PriceTable;
  /** 프로젝트별 설치비 (없으면 단가표 기본값) */
  installFee?: number;
  extras?: ExtraItem[];
  /** 주문 정보 (주문자·연락처·시공지·납기·요청사항) → core/order.ts */
  order?: import('./order').OrderInfo;
  /** 마지막으로 보낸 제안 (실사 이미지 에셋·해시) → core/proposal.ts */
  proposal?: import('./proposal').ProposalInfo;
  /** 승인 기록 (서버가 추가, 최신이 뒤) */
  approvals?: import('./proposal').Approval[];
}

export interface Message {
  id: string;
  objectId: string;
  author: string;
  text: string;
  /** approval = 제안 승인 알림 (objectId 'project', 서버가 기록) */
  kind: 'chat' | 'comment' | 'approval';
  ts: number;
  /** 사진·PDF 첨부 (에셋 ID 로 참조) */
  attachments?: Attachment[];
}
