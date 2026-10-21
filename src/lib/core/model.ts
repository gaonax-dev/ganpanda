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
  /** false = 자동 원근 끔 (원근 창에서 [설정 지우기] — 2026-10-19). 그 뒤로는 사인물 치수가 들어와도 원근을 새로 만들지 않는다 */
  autoCamera?: false;
  /** 이미지 조절(크롭·밝기)의 기준 원본 (2026-10-21, core/photoEdit.ts). 없으면 조절 안 함 = assetId 가 원본 */
  source?: PhotoSource;
}

/** 조절 전 원본 에셋과 지금 적용된 크롭(원본 px, 원본 밖도 가능 = 여백)·밝기(1 = 그대로) */
export interface PhotoSource { assetId: string; w: number; h: number; crop: { x: number; y: number; w: number; h: number }; brightness: number }

/** 사인물 오브젝트. 영역 좌표는 사진 원본 픽셀 기준 */
/** 내용 객체 (글자·그림): 간판 중앙 기준 위치(mm, x 오른쪽 +, y 위 +), 높이 h(글자 높이·그림 높이), 그림·시트 면적용 가로 w */
export interface PartItem {
  id: string;
  /** shape = 도형 (레이어 구조 2단계, 2026-10-18): 사각·원·선 — 채움·선 색 */
  kind: 'text' | 'image' | 'shape';
  text?: string;
  shape?: 'rect' | 'ellipse' | 'line';
  /** 채움 색 (#hex, 비우면 없음) */
  fill?: string;
  /** 선 색 (#hex, 비우면 없음) */
  stroke?: string;
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
/** 재료 층의 마감 (2026-10-21 core/stack.ts): 도색 = options 의 도색 객체 접두사(paintHex/paintLabel 로 읽음), 시트 = 시트 종류 id */
export interface Finish { kind: 'paint' | 'sheet'; ref: string }
/** 재료 층: 뒤에서 앞으로 쌓인다. role = 밑판(base)·몸통(body)·면판(face). 마감은 앞면(face)·옆면(side) */
export interface MaterialLayer { id: string; material: string; thickness: number; role?: 'base' | 'body' | 'face'; face?: Finish; side?: Finish }

export interface SignPart {
  id: string;
  /** 재료 층 (2026-10-21, 스카시부터): 종류의 기본 묶음에서 시작해 층을 빼고 더한다. 없으면 읽을 때 종류 모듈이 옛 옵션(두께·재질·도색)에서 채운다 */
  stack?: MaterialLayer[];
  /** light = 상단 조명 (2026-10-19, 몸통 옵션에서 구성 요소로) */
  kind: 'channel' | 'scashi' | 'sheet' | 'light' | 'molding' | 'pole' | 'led';
  type: string;
  options?: Record<string, string | boolean>;
  on?: string;
  items: PartItem[];
}

/**
 * 레이어 (레이어 구조 1단계, 2026-10-18): "어디에, 어떤 순서로, 무엇 위에". kind = 구성 요소 종류(채널·스카시·시트 — core/components) 또는 내용 객체(text·image).
 * spec = 종류 모듈의 옵션(구성 요소: type + 옵션 / 글자: text·count / 그림: image). box = **부모 중심 기준** mm(x 오른쪽 +, y 위 +; 상자 중심), w·h 0 = 부모 채움·자동.
 * children = 아래→위 그리는 순서. 프레임(루트)은 SignObject 자체(종류·옵션·치수·두께) — core/layers.ts frameOf
 */
export interface Layer {
  id: string;
  kind: string;
  name?: string;
  spec: Record<string, unknown>;
  box: { x: number; y: number; w: number; h: number; rot?: number };
  children: Layer[];
  visible?: boolean;
  locked?: boolean;
  opacity?: number;
  /** 부모의 어느 면에 붙나 (기본 front) */
  face?: 'front' | 'top' | 'side' | 'back';
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
  /** 조합형 구성 요소 (2026-10-16): 간판 프레임에 붙는 채널·스카시·시트와 그 글자·그림. 없으면 옛 필드에서 읽는다(core/parts.ts). 1단계부터 layers 의 **거울**(펼친 형식) — 함께 저장 */
  parts?: SignPart[];
  /** 레이어 트리 (1단계, 2026-10-18): 프레임의 자식들. parts 와 같은 내용을 트리로(부모 기준 좌표, 시트는 올린 것의 자식). core/layers.ts */
  layers?: Layer[];
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
  /** 사인물 말풍선 자리 (사인물 좌표: 0~1 = 외곽선 안, 꼭짓점 0,0 = 왼쪽 위). tip = 꼭지, body = 풍선 몸통 중심. 없으면 꼭지 오른쪽 위 꼭짓점 + 화면 기준 오프셋. 사진·정면도 카드에서 같은 값 (2026-10-18) */
  bubble?: { tip: [number, number]; body: [number, number] };
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
  /** 풍선 몸통의 자리 = 꼭지(x,y)에서의 오프셋 (사진 px). 없으면 화면 기준 오른쪽 위 (2026-10-18 "꼭지를 따로 지정") */
  bx?: number;
  by?: number;
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
  /** 버전 되돌리기 (2026-10-21): 누가·언제·어느 버전으로 — 서버가 넣고, 함께 보는 사람에게 안내 */
  restored?: { by: string; at: number; version: string };
  /** 보드 카드 간격 (mm, 기본 600 — 2026-10-20 "상단 버튼에 카드 간격 + -") — 재정렬·자동 배치에 쓴다 */
  flatGap?: number;
  /** 소비자 견적 요청 폼의 적던 내용 (견적 초안 방에만; 2026-10-22 "사업자등록기록이 다른 기기에서 연동되지 않는다" — 기기 localStorage 에서 옮김). 보내면 지운다 */
  estimateDraft?: EstimateDraft;
  /** 보낸 견적 요청 (견적 초안 방, 2026-10-22 "견적이 요청되면 수정이 불가능하다"): 있으면 보드는 잠김 — 취소하면 지운다 */
  estimateRequest?: { id: string; url: string; at: number };
  /** 취소한 앞 요청 — 다시 보내면 재요청(prevId)으로 그 간판집에 재견적 */
  estimatePrev?: string;
  /** 고른 신원: 사업자(stores id) 또는 'general'(일반 주문) — 기기 사이 같이 */
  estimateIdentity?: string;
}

/** 견적 요청 폼 글 칸 (파일(사본)은 못 남긴다) */
export interface EstimateDraft { store: string; phone: string; email: string; text: string; address: string; bizNo: string; ownerName: string; startDate: string }

export interface Message {
  id: string;
  objectId: string;
  author: string;
  text: string;
  /** approval = 제안 승인 알림 (objectId 'project', 서버가 기록). voice = 음성 메모 (2026-10-18: 말풍선과 따로, 카드·상세의 🎙) */
  kind: 'chat' | 'comment' | 'approval' | 'voice';
  ts: number;
  /** 사진·PDF 첨부 (에셋 ID 로 참조) */
  attachments?: Attachment[];
}
