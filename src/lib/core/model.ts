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
/** 내용 객체 (글자·그림): 간판 중앙 기준 위치(mm, x 오른쪽 +, y 위 +), 높이 h(글자 높이·그림 높이), 그림·시트 면적용 가로 w */
export interface PartItem {
  id: string;
  kind: 'text' | 'image';
  text?: string;
  /** 글자수 직접 지정 (없으면 문구에서 셈) */
  count?: number;
  x: number;
  y: number;
  h: number;
  w?: number;
  /** 그림 소스: 디자인 파일의 페이지(영역) 또는 직접 올린 그림 */
  image?: { sourceId: string; page: number } | { assetId: string; name?: string };
}
/** 구성 요소 (2026-10-16 조합형): 채널·스카시·시트. type = 채널 제품 id / 스카시 제품 id / 시트 id. 시트는 올릴 곳(on: 'frame' 또는 채널 구성 요소 id) */
export interface SignPart {
  id: string;
  kind: 'channel' | 'scashi' | 'sheet';
  type: string;
  options?: Record<string, string | boolean>;
  on?: string;
  items: PartItem[];
}

export interface SignObject {
  id: string;
  /** 사진 id. '' = 사진 없이 보드에 직접 만든 사인물(평면도 카드만, quad 는 빈 배열) — 나중에 사진의 영역이 이것과 연결(sameAs)된다 */
  photoId: string;
  name: string;
  shape: ShapeKind;
  /** 외곽 사각 영역 TL,TR,BR,BL (원근 반영) */
  quad: Pt[];
  /** shape = polygon 일 때 윤곽 (사진 픽셀) */
  polygon?: Pt[];
  /** 사각형 모서리 둥글기: 짧은 변 대비 반지름 비율 0~0.5 (0.5 = 알약/원). 원형 도구는 0.5 로 만든다 */
  corner?: number;
  /** 벽에서 돌려 세운 사인물 (3단계 매니퓰레이터, 2026-10-15): 경첩 변을 벽에 붙인 채 수직축으로 deg° (90 = 돌출 간판 직각). 사진마다의 배치 — quad 는 그 투영 */
  turn?: { deg: number; hinge: 'left' | 'right' };
  /** 정면 축 = 박스가 뻗는 축 (2026-10-15 사용자: "삼면 구조로 진행해줘", "정면을 바꾸면 박스 구조만 변경되고 원 사인물은 형태를 유지"): 매니퓰레이터 축 이름 x(벽 가로)·y(벽 밖)·z(위). 없으면 사인물 면의 법선. 사인물 면·외곽선·크기는 바꾸지 않는다 */
  faceAxis?: 'x' | 'y' | 'z';
  /** 박스 방향 (2026-10-15 사용자: "박스만 회전하고 크기는 외곽선만"): 회전 고리로 돌린 상자의 방향, 원근 설정의 벽 좌표 단위 벡터. 사진마다의 배치. 있으면 faceAxis 보다 우선 */
  boxDir?: [number, number, number];
  /** 조합형 구성 요소 (2026-10-16): 간판 프레임에 붙는 채널·스카시·시트와 그 글자·그림. 없으면 옛 필드에서 읽는다(core/parts.ts) */
  parts?: SignPart[];
  widthMm?: number;
  heightMm?: number;
  /** 보드 두께·돌출 깊이 (mm). 채널 글자 두께는 letter3d.depthMm (2026-10-15 사용자: "두께가 필요해") */
  depthMm?: number;
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
  /** 평면도 위치 (mm) — 리스트 뷰와 보드의 평면 구역이 같은 배치를 쓴다. 없으면 자동 배치 */
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
  /** 받는 사람 이름 (2026-10-17 말풍선). 없거나 빈 문자열 = 모두. 있으면 보낸 사람·받는 사람·소유자만 본다 → core/pins.ts */
  to?: string;
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
  /** 견적 줄 금액: manual = 직접 입력(새 프로젝트), 없으면 auto(기존 프로젝트) — 2026-10-16 */
  quoteMode?: 'manual' | 'auto';
  /** 줄 키 → 수동 금액 또는 'auto'(자동 전환) */
  lineAmounts?: Record<string, number | 'auto'>;
  /** 보드 평면 구역 축척 (px/mm, 기본 0.1 — 2026-10-17 "평면도 전체 사이즈 조절") → core/boardCards.ts */
  flatScale?: number;
  /** 보드 평면 구역 이동 (보드 px, 기본 0,0 — 2026-10-17 왼쪽 위 이동 손잡이) */
  flatOffset?: { x: number; y: number };
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
