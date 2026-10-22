// 구성 요소(컴포넌트) 레지스트리 — 레이어 구조 0단계 (2026-10-18 사용자: "사인물 구성의 모듈화와 클래스화가 아직 부족해 보인다 … 레이어 형태의 자유로운 구성",
// 결정: 0·1단계, 몸통도 프레임 레이어). 설계: docs/architecture/composition-layers.md
// 컴포넌트 = "무엇을 어떻게 만드나": 종류마다 모듈 하나가 이름·세부 종류·옵션 스키마·단가·요약·2D 색·3D 만드는 법을 가진다.
// 코어·UI·3D 는 종류 이름으로 분기하지 않고 registry 만 본다 — 새 종류 = 모듈 하나 + 테스트 하나.
import type { MaterialLayer, SignObject, SignPart } from '../model';
import type { OptionField } from '../optionSchema';
import type { PriceTable } from '../pricing';
import type { Lighting } from '../../sim/types';

/** 견적 줄 만들기 — 최소 금액·공급사 꼬리표·원가 계산은 quote.ts 가 공통으로 */
export interface PartPriceCtx {
  o: SignObject;
  prices: PriceTable;
  /** 사인물에 가로·세로가 있나 */
  sized: boolean;
  /** 금액 줄 (raw = 배수 적용 전 금액이 아니라 판매 금액 계산값; cost = 계산법일 때 배수 전 공급 금액) */
  finish(label: string, detail: string, raw: number, priceId?: string, cost?: number, /** 같은 구성 요소의 둘째 줄 키 꼬리 (앞면 시트 등 — 수동 금액이 겹치지 않게) */ sub?: string): void;
  /** 표시 이름: 그 단가 항목에 연결된 공급사의 용어가 있으면 그것, 없으면 fallback (2026-10-19 V5 "공급사의 용어가 우선한다"). key = 'product:<id>' | 'sheet:<id>' */
  term(key: string, fallback: string): string;
  /** 입력이 더 필요한 줄 (0원) */
  need(label: string, detail: string): void;
}

export interface Component {
  kind: SignPart['kind'];
  /** 표시 이름 (채널·스카시·시트) */
  label: string;
  /** 정면도·카드·전개도에서 이 종류 객체의 기본 색 */
  color: string;
  /** 고를 수 있는 세부 종류 (part.type) */
  types: { id: string; label: string }[];
  /** 새로 만들 때 채우는 필드 (시트: on = 'frame') */
  init?(part: SignPart): SignPart;
  /** 저장된 것을 읽을 때 옛 옵션 정리 (시트: halfCut → cutMode) */
  normalize?(part: SignPart): SignPart;
  /** 세부 종류 이름 */
  typeLabel(part: SignPart): string;
  /** 구성내역 문구 (시트: 종류+재질+컷팅, 그 밖: 세부 종류 이름) */
  spec(part: SignPart): string;
  /** 구성내역을 카드 머리에 따로 보이나 (spec 이 typeLabel 과 다른 종류) */
  hasSpec: boolean;
  /** 빠른 설정 칩: 짧은 문구와 색 */
  chip(part: SignPart): { text: string; color: string | null };
  /** 옵션 스키마 (조건부 필드는 자기 옵션 값으로 거른다) */
  optionFields(part: SignPart): OptionField[];
  /** 구성내역 문구에 이미 들어가서 요약에 따로 적지 않는 옵션 키 */
  specKeys?: Set<string>;
  /** 다른 것(시트)을 위에 올릴 수 있으면 그 자리 문구 ("… 앞면" / "… 위"), 없으면 undefined */
  host?(part: SignPart): string;
  /** 자신이 무언가 위에 올라가는 종류인가 (올릴 곳 선택, part.on) */
  sits: boolean;
  /** 그리는 층: 0 = 면에 깔림(시트), 100 = 입체(채널·스카시). 같은 층은 올린 깊이(on)·원래 순서 */
  layer: number;
  /** 내용 객체(글자)에 가로 입력이 있나 (시트: 면적 계산) */
  itemWidth: boolean;
  /** 3D: 글자 객체를 밀어내나(입체 글자) — 아니면 앞면에 평면으로 */
  extrude: boolean;
  /** 입체 두께 (mm) */
  depthMm(part: SignPart, o: SignObject): number;
  lighting(part: SignPart): Lighting;
  /** 색의 도색 키: face = 글자 앞면·평면 객체 색, side = 입체 옆면 색 */
  paint: { face: string; side: string };
  /** 재료 층이 있는 종류(2026-10-21): 앞면·옆면 색을 층의 마감에서 (없으면 paint 키로) — components/index.ts surfaceOf */
  surface?(part: SignPart): { face: string | null; side: string | null; faceSheet?: string } | null;
  /** 재료 층(뒤→앞)이 있는 종류: 그 층들 (단면 쌓기가 층마다 그린다, 2026-10-22). 없으면 한 덩어리 */
  stack?(part: SignPart): MaterialLayer[];
  /** 글자·그림·도형 객체를 받나 (상단 조명은 아님) */
  takesItems: boolean;
  /** 견적 줄 키 (없으면 `<사인물>:part:<구성 요소>`) — 옛 키를 이어 써서 수동 금액을 지킨다 */
  quoteKey?(o: SignObject, part: SignPart): string;
  /** 예전엔 몸통 옵션이던 종류 (상단 조명): 구성 요소를 저장하지 않은 옛 사인물에서도 요약에 구성 요소로 보인다 */
  fromBody?: boolean;
  /** 3D 부속 (몰딩·지주): 사인물 좌표 mm. signColor = 간판 프레임 색 ("간판과 같은 색") */
  scene?(part: SignPart, signColor: string): Accessory | null;
  /** 있으면 간판 상자가 안에서 빛난다 (LED 모듈) */
  litsBody?: boolean;
  /** 용어 표 키 앞부분 (core/terms.ts): 시트 = 'sheet', 채널·스카시 = 'product' (단가표의 시트·제품) */
  termKey: 'product' | 'sheet';
  /** 견적 줄 (ctx.finish / ctx.need) */
  price(part: SignPart, ctx: PartPriceCtx): void;
}

/** 3D 부속 사양 (사인물 좌표 mm, 2026-10-19): 몰딩 = 앞 테두리 띠, 지주 = 간판 아래로 내려가는 기둥 */
export type Accessory =
  | { kind: 'molding'; edges: 'all' | 'tb' | 'lr'; widthMm: number; color: string }
  | { kind: 'pole'; count: number; heightMm: number; sizeMm: number; color: string };

