# 조합형 사인물의 레이어 구조 (2026-10-18 결정: 0·1단계 진행, 몸통도 프레임 레이어)

사용자: "사인물 구성의 모듈화와 클래스화가 아직 부족해 보인다. 조합형을 위한 레이어 형태의 자유로운 구성이 필요하다. 제안해 줄 수 있나"

상태: **결정됨**(사용자 2026-10-18: "0,1, 몸통도 프레임 레이어"). 컴포넌트 정의는 코드 모듈(권장안), 옛 형식 병행 기간은 1단계에서 정한다. 구현 상태는 아래 7절과 [../features/composition.md](../features/composition.md).

## 0. 목적 (2026-10-18 사용자 보충: "퀵입력시 AI로 구성을 생성하는데 원활하게 하는 목적도 있다")
이 구조는 사람이 레이어 패널에서 조립하는 것만이 아니라, **퀵입력(사양 글)에서 AI 가 구성 전체를 만들어 내는 것**을 목표로 한다.
지금 사양 글(`core/specText.ts`)은 사전 매칭이라 종류·색·채널·LED·사이즈·옵션 값까지만 알아보고, "채널 글자 3개를 왼쪽 정렬, 아래에 UV 시트 로고" 같은 **배치와 중첩**은 못 만든다.
AI 가 만들려면 결과물이 **선언적이고 자기 설명적인 데이터**여야 한다 — 그것이 레이어 트리(어디에·무엇 위에)와 컴포넌트 레지스트리(무엇을·어떤 옵션으로)다.

**방식 결정(2026-10-18)**: 런타임 LLM 호출이 아니라 **규칙 파서를 레이어 트리까지 넓히고 계속 키운다**(사용자: "파서를 계속 ai로 디벨롭하면 될거 같은데" — 무료 요금제의 비용·남용 문제 때문). 인식 못 한 글은 사용자가 보내면(명시적 단추, 글은 저장 안 함) 테스트 말뭉치에 쌓고, 개발 때 AI 가 파서를 확장한다. 아래 "AI 친화 요건" 중 스키마·정규화·확인 창은 파서에도 그대로 필요하고, 런타임 모델은 Pro 한도 안 선택지로 자리만 남긴다.

AI 친화 요건 (설계에 반영):
- **JSON 하나로 완결**: 트리 + 종류 모듈의 spec 만으로 사인물이 정해진다. 코드 상수·숨은 기본값에 기대지 않고, 빠진 값은 모듈의 `defaults` 로 채운다.
- **스키마를 레지스트리가 내보낸다**: 종류·세부 종류·옵션 키와 허용 값·자식 규칙·좌표 규칙을 `describeSchema()` 로 뽑아 프롬프트(또는 도구 호출 JSON 스키마)에 넣는다. 새 종류를 추가하면 AI 도 바로 안다.
- **관대한 검증·정규화**: AI 출력은 이름·단위·순서가 어긋날 수 있다. `normalizeLayers(input, schema)` 가 별칭(후랙스→board-flex, 버건디→라이브러리 카드)·단위(cm→mm)·범위(간판 밖 좌표)를 고치고, 모르는 키는 버리고 경고로 남긴다. 사전 매칭 파서는 **오프라인·즉시 미리보기 폴백**으로 유지.
- **확인 후 적용**: 지금 사양 글의 확인 창(체크한 항목만 적용)을 그대로 — AI 결과를 레이어 칩·정면도 미리보기로 보여 주고 체크 후 적용. 글은 저장하지 않는다.
- **안정된 id·부모 기준 좌표**: AI 가 "로고를 안개 시트 위, 왼쪽 아래" 같은 상대 배치를 말하기 쉽다. 그룹·정렬은 2단계 컴포넌트.

## 1. 지금 구조의 한계

현재 사인물 = `SignObject`(몸통 `productId` + `options` + 치수) + `parts: SignPart[]`(채널·스카시·시트 3종) + `items: PartItem[]`(글자·그림). 2026-10-16 에 1~4단계를 빠르게 올리면서 생긴 모양이고, 다음이 걸린다.

| 한계 | 어디서 드러나나 |
|---|---|
| **구성 요소 종류가 코드에 고정** (`kind: 'channel' \| 'scashi' \| 'sheet'`) | 종류별 분기가 코어·UI·3D 에 **41곳** 흩어져 있다(`kind === 'sheet'` 등). LED 모듈·몰딩·지주·네온 플렉스·아크릴 돔 같은 새 요소 하나를 넣으려면 모델·옵션 스키마·견적·요약·정면도 색·2D SVG·3D·주문 JSON 을 각각 고쳐야 한다 |
| **몸통(프레임)이 구성 요소가 아니다** | 몸통은 `productId`+`options`, 구성 요소는 `parts` — 두 체계. 프레임 색·테두리·상단 조명(`topLight`)·두께가 몸통에만 붙고, "프레임 없이 벽에 직접" 같은 구성은 `body-none` 특수값으로 땜질 |
| **중첩이 한 단계** (`sheet.on = 'frame' \| 채널 id`) | 시트 위 시트는 되지만 임의 깊이·그룹이 없고, 순서는 `layerOrder` 가 종류 규칙으로 추정한다. 사용자가 순서를 직접 정할 수 없다 |
| **내용 객체가 글자·그림뿐** | 도형(사각·원·선)·그룹·개별 글자 배치·마스크가 없다. 좌표가 **간판 중심 기준 절대 mm** 라 묶어서 옮기거나 세트로 저장해 다른 간판에 넣을 때 다시 계산해야 한다 |
| **레이어 속성이 없다** | 이름·보이기/숨기기·잠금·불투명도·메모가 없어 복잡한 구성에서 편집이 어렵다 |
| **3D 가 종류별 하드코딩** | `composedOf` → `letterItems`(채널·스카시 글자는 밀어내기) / `faceItems`(시트 글자·그림은 앞면 텍스처) 두 갈래. 깊이(z)는 `bakeOffset`·`recessBox` 로 특수 처리. 시트 위 채널, 채널 위 시트 위 글자 같은 깊이 누적이 안 된다 |
| **옵션이 평평한 `Record`** | 구성 요소 옵션 스키마(`options.ts` 328줄)가 종류 이름으로 묶여 있어 새 종류의 옵션은 코드 추가 |

## 2. 제안: "무엇"과 "어디"를 나눈 레이어 트리

핵심은 두 축을 분리하는 것이다.

- **컴포넌트(Component) = 무엇을 어떻게 만드나** — 재료·제작법·옵션 스키마·단가·요약·2D/3D 그리는 법. **종류마다 모듈 하나**로 등록한다(레지스트리).
- **레이어(Layer) = 어디에, 어떤 순서로, 무엇 위에** — 위치·크기·회전·부모·자식·보이기·잠금. 종류와 무관한 **공통 구조**.

```ts
// core/layers.ts (제안)
interface Layer {
  id: string;
  kind: string;                 // 레지스트리 키: 'frame' | 'channel' | 'scashi' | 'sheet' | 'text' | 'image' | 'shape' | 'group' | 'light' | ...
  name?: string;                // 레이어 패널 표시 이름 (없으면 컴포넌트 기본)
  spec: Record<string, unknown>; // 컴포넌트가 정의한 옵션 (스키마는 컴포넌트가 소유)
  box: { x: number; y: number; w: number; h: number; rot?: number }; // **부모 기준** 로컬 mm (부모 중심 원점, 위 +)
  children: Layer[];            // 아래→위 순서 = 그리는 순서
  visible?: boolean; locked?: boolean; opacity?: number;
  face?: 'front' | 'top' | 'side' | 'back'; // 부모의 어느 면에 붙나 (기본 front)
}
// SignObject.layers: Layer[]  — 루트는 보통 frame 하나 (프레임 없는 사인물은 루트가 channel/scashi)
```

```ts
// core/components/index.ts (제안) — 종류마다 이 인터페이스를 구현한 모듈 하나
interface Component<S = Record<string, unknown>> {
  kind: string; label: string; icon: string;
  schema: OptionField[];                  // 옵션 패널이 그대로 그린다 (지금 options.ts 의 필드 정의 재사용)
  defaults(parent?: Layer): S;
  allowedChildren: string[];              // 예: channel → ['text','image','sheet'], sheet → ['text','image','shape','sheet']
  depthMm(spec: S, layer: Layer): number; // 자식이 올라앉는 높이 (채널 두께, 시트 0.2, 프레임 두께)
  price(ctx: PriceCtx): QuoteLine[];      // 면적·글자수·자식 요약을 받아 단가표로
  summarize(ctx): string;                 // "전광 채널 '카페' 450mm"
  draw2d(ctx): Svg2dItem[];               // 정면도·카드·SVG·사진 2D 겹침 (좌표는 ctx 가 절대 mm 로 변환해 줌)
  build3d(ctx): MeshSpec[];               // extrude / face-texture / box / light … 중 하나 이상 (sim/signs.ts 의 기존 빌더를 조각으로 재사용)
  validate?(layer): string[];             // 경고 ("시트 위에 채널은 시공 불가" 등)
}
export const registry = new Map<string, Component>();
```

규칙
- **제작법은 부모가, 모양은 자식이 정한다.** 글자 레이어는 `channel` 아래에 있으면 입체 글자, `sheet` 아래면 커팅/출력 글자, `frame` 바로 아래면 도색 글자. 글자 레이어 자체는 "글자·높이·폭·폰트"만 안다.
- **깊이는 트리 누적.** 3D 는 루트부터 순회하며 `z += parent.depthMm` — 시트 위 채널 위 시트 같은 조합이 자동으로 선다. `bakeOffset`·`recessBox` 특수 처리는 없어진다.
- **좌표는 부모 기준.** 그룹을 옮기면 자식이 따라가고, 서브트리를 통째로 **라이브러리 세트**로 저장해 다른 크기의 간판에 넣을 때 비율만 맞추면 된다(5단계 계획과 맞물림).
- **순서는 사용자가.** 레이어 패널에서 끌어 바꾼다. `layerOrder` 의 종류 추정은 마이그레이션 때 초기 순서를 정하는 데만 쓴다.
- **새 종류 = 모듈 하나 + 테스트 하나.** 코어·UI·3D 어디에도 종류 이름 분기가 남지 않게 한다(레지스트리만 본다). 잘 자리 잡으면 JSON 정의(코드 없이 추가)도 검토.

기본 컴포넌트(1차): `frame`(지금 몸통 — 종류별 제품 `board-*` 흡수, 프레임 색·테두리·두께·상단 조명), `channel`, `scashi`, `sheet`, `text`, `image`, `shape`(사각·원·선), `group`. 2차 후보: `light`(상단 조명을 별도 레이어로), `led-module`, `molding`, `pole`, `neon-flex`.

## 3. 호환과 마이그레이션

- **읽을 때 변환**(지금 옛 필드 → `parts` 변환과 같은 방식): `productId/options/depthMm/topLight` → 루트 `frame` 레이어, `parts[]` → 자식 레이어, `items[]` → 손자 레이어, `sheet.on` → 부모 결정, 절대 mm → 부모 기준 로컬 mm. 저장은 새 형식(`layers`)만. 옛 클라이언트와 섞여 쓰는 기간이 있으면 두 형식을 함께 쓰다가 전환.
- `sameAs`(다른 사진의 같은 사인물)·`design`(입힌 디자인)·말풍선·치수는 그대로 `SignObject` 에 남는다 — 레이어는 "규격"의 일부라 원본에서 읽는다.
- 견적·주문 JSON·PDF·SVG 는 컴포넌트 `price/summarize/draw2d` 를 트리로 fold 하는 것으로 바뀌지만, **단가표(`suppliers/*.json`) 매핑과 결과 금액은 같아야** 한다 → 기존 단위 테스트(`quote.test.ts`, `parts.test.ts`, `listSvg.test.ts`, `renderSpec.test.ts`)를 회귀 기준으로 고정하고 시작한다.

## 4. UI

- **레이어 패널**(설정 창 왼쪽 또는 정면도 편집기 옆): 트리(접기), 눈·자물쇠, 이름 바꾸기, 끌어 순서·부모 바꾸기, 선택 = 정면도 선택과 동기. 일러스트레이터 손버릇.
- **정면도 편집기**: 지금 그대로 쓰되 그룹 선택·그룹 이동, Shift 다중 선택, 정렬은 "부모 기준". 휴대폰에서도 같은 트리(목록만).
- **옵션 패널**: 선택한 레이어의 컴포넌트 `schema` 를 generic 으로 그린다(지금 `partOptionFields` 가 하던 일).
- **라이브러리(5단계)**: 서브트리 저장·썸네일·팀 공유·비율 맞춤. 이 제안이 그 전제.

## 5. 단계 (TDD, 각 단계가 끝나도 앱은 동작)

| 단계 | 내용 | 산출 | 크기 |
|---|---|---|---|
| 0 | **컴포넌트 레지스트리 도입** — 기존 3종(+몸통)을 `core/components/*` 로 옮기고 41곳 분기를 레지스트리 호출로 바꾼다. 데이터·UI 변화 없음 | 분기 0곳, 기존 테스트 전부 통과 | 중 |
| 1 | **레이어 트리 모델** + 읽을 때 마이그레이션 + 부모 기준 좌표. 정면도·2D·SVG 는 `flatten(layers)` 로 지금 로직 유지 | `layers.test.ts`(변환 왕복, flatten, 좌표) | 중 |
| 2 | **3D 트리 순회 렌더**(깊이 누적) + `shape`·`group` 컴포넌트 | `renderSpec` 회귀 + 중첩 깊이 테스트 | 중 |
| 3 | **레이어 패널 UI**, 보이기·잠금·순서·이름, 정면도 그룹 편집 | E2E | 중~대 |
| 4 | **라이브러리 세트**(서브트리 저장·공유·비율 맞춤), 새 컴포넌트(조명·LED 모듈·몰딩·지주) | E2E, 컴포넌트별 단위 | 대 |
| AI | **퀵입력 → AI 구성 생성**: 레지스트리 `describeSchema()` + `normalizeLayers()`(별칭·단위·범위·기본값), 서버 `/api/ai/compose`(LLM 도구 호출로 레이어 JSON), 확인 창에 레이어 칩·정면도 미리보기, 사전 매칭 파서는 폴백. 2단계(그룹·도형) 뒤가 자연스럽지만 스키마·정규화는 1단계 직후부터 가능 | 스키마 스냅샷·정규화 단위, 고정 응답으로 E2E | 중~대 |

0~1 을 먼저 하면 겉모습은 그대로인 채 내부가 모듈화되어, 이후 종류 추가·레이어 UI 가 모두 "모듈 하나" 단위로 쪼개진다.

## 6. 결정이 필요한 것

1. **범위**: 0~1 부터 시작할지(권장), 3(레이어 패널)까지 한 번에 갈지.
2. **좌표계 전환**: 부모 기준 로컬 mm 로 바꾸면 기존 정면도 위치는 변환으로 보존된다. 외부로 나가는 값(주문 JSON 의 객체 위치)은 절대 mm 유지.
3. **프레임도 레이어로**: 몸통 옵션(프레임 색·테두리·판 두께·상단 조명)을 `frame` 레이어의 spec 으로 옮기는 데 동의하는지. 옵션 패널 모양은 유지 가능.
4. **컴포넌트 정의 방식**: 코드 모듈(권장, 타입 검사·테스트 용이) vs JSON(코드 없이 추가 — 2차).
5. **옛 형식 병행 기간**: 저장을 새 형식으로만 할 시점.

## 7. 구현 상태

### 0단계 — 구성 요소 레지스트리 (구현됨 2026-10-18)
- `src/lib/core/components/`: `types.ts`(`Component`·`PartPriceCtx` 인터페이스), `channel.ts`·`scashi.ts`·`sheet.ts`(종류 모듈), `letters.ts`(입체 글자 공통 단가), `index.ts`(`COMPONENTS`·`componentOf(kind)`·`componentKinds()`).
- 모듈이 가진 것: `label`·`color`·`types`, `init`(시트 `on='frame'`)·`normalize`(시트 halfCut→cutMode), `typeLabel`·`spec`·`hasSpec`·`chip`, `optionFields`·`specKeys`, `host`(위에 올릴 수 있을 때 자리 문구)·`sits`·`layer`(0 면 / 100 입체)·`itemWidth`, 3D `extrude`·`depthMm`·`lighting`·`paint{face,side}`, `price(part, ctx)`.
- 옮긴 곳: `parts.ts`(이름·구성내역·올릴 곳·층·새 요소·옛 옵션 정리), `partsLayout.ts`(색·도색 키), `quote.ts`(구성 요소 줄 — `finish/need` 를 ctx 로 넘김; 줄 순서는 전과 같이 입체 → 상단 조명 → 시트), `render.ts`(`composedOf` 의 밀어내기·두께·조명·색), `options.ts`(`partOptionFields`·요약의 구성내역 키), `PartsEditor`·`QuickSpec`·`ObjectSettingsDialog`(이름·세부 종류·올릴 곳·가로 입력).
- 옵션 표는 `optionSchema.ts`(잎)로 분리 — 레지스트리가 표만 보고, `options.ts` 는 함수. `charCount.ts`·`priceFormat.ts`·`shapeArea.ts` 도 잎으로 빼서 순환 의존을 없앴다(`quote.ts` 가 다시 내보냄).
- 달라진 동작 하나: 스카시 글자의 3D 색이 스카시 **도색**(`paint`)을 따른다 — 전엔 채널 키(face/body)를 봐서 도색이 비치지 않았다(2D 정면도는 이미 도색을 썼음).
- 남긴 종류 이름 비교(허용 목록, `tests/unit/components.test.ts` 가 개수를 지킨다): 분류 판정(`catalog.ts` 시트 분류·첫 채널·첫 스카시, `parts.ts` 시트 분류·옛 데이터 변환), 채널 전용 UI(`quickSpec.ts`·`specText.ts`·`ObjectSettingsDialog` 채널 탭), 입체 보기(`letter3d.ts` = 채널 글자), 옛 형식 3D(`render.ts` letters). 이것들은 "종류 자체"를 가리키는 곳이라 레지스트리로 옮길 대상이 아니다.

### 1단계 — 레이어 트리 (구현됨 2026-10-18)
- 모델: `Layer{id, kind, name?, spec, box{x,y,w,h,rot?}, children, visible?, locked?, opacity?, face?}`(`core/model.ts`), `SignObject.layers?: Layer[]` = 프레임의 자식들. `box` 는 **부모 중심 기준 mm**(상자 중심, 위 +), `w·h 0` = 부모 채움(구성 요소)·자동(글자 폭).
- `core/layers.ts`: `fromParts`(펼친 구성 요소 → 트리: `on` 으로 올린 시트는 그 아래, 글자·그림은 구성 요소의 자식, 없는 id 위는 프레임 면), `toParts`(트리 → 펼침: `on` = 부모 id/`frame`, 부모 오프셋을 더해 간판 중심 기준 좌표로), `sameParts`(정규형 비교), `layersOf(o, parts)`, `frameOf(o, children)`(프레임 레이어 = 사인물 자체: 종류·옵션·두께·치수가 spec), `flatten`(그리는 순서로 펼친 목록 + 절대 상자), `findLayer`.
- **저장 규칙(병행 기간)**: `commitParts`·`categoryPatch` 가 `layers`(트리)와 `parts`(펼친 거울)를 **함께** 쓴다. 읽는 쪽은 둘이 같을 때만 트리를 믿고, 다르면(옛 클라이언트가 parts 만 고침) parts 에서 트리를 다시 만든다. 트리만 있는 사인물도 `partsOf` 가 읽는다(`toParts`). 연결(`sameAs`)의 규격 필드(`link.ts SPEC_FIELDS`)·다중 선택 "구성 맞추기"에 `layers` 포함. 거울을 없애고 트리만 저장하는 시점은 2단계(3D·정면도가 트리를 직접 읽을 때) 이후.
- 프레임 레이어는 저장하지 않는다 — `SignObject` 가 곧 프레임(1:1: 치수·`sameAs`·디자인·말풍선이 사인물에 붙어 있음). 2단계에서 3D·견적이 `frameOf(o, layersOf(o))` 트리를 순회하면 프레임도 같은 인터페이스(`Component`)로 다룬다.
- 아직 안 한 것(4단계): 세트 라이브러리, 새 컴포넌트(조명·LED 모듈·몰딩·지주), 거울 `parts` 없애고 트리만 저장.

### 2단계 — 트리 순회 3D · 도형 · 그룹 (구현됨 2026-10-18)
- **3D 깊이 누적**: `renderSpecOf`→`composedOf` 가 펼친 parts 가 아니라 **레이어 트리**(`layersOf`)를 걷는다(`core/layers.ts` `placedItems(layers, depthOf)`): 내용 객체마다 (절대 좌표, 거둔 구성 요소, **z** = 자기 구성 요소를 뺀 조상 구성 요소 두께의 합). 채널 앞면 위 시트의 글자·그림·도형은 z = 채널 두께, 시트 위 시트는 0, 채널 글자는 0 에서 두께만큼 솟는다. `SignSpec.faceItems[].z`·`letterItems[].z`. `sim/signs.ts`: z ≤ 0.5mm 는 앞면 텍스처에 그대로 그리고, 올라선 것은 **그 높이의 얇은 판**(`facePlane`, 캔버스 텍스처 PlaneGeometry, 자리는 정점에 굽어 `warpToQuad`·`recessBox` 와 함께 움직임)으로. 그리기 공용 `drawFaceItem`(그림·글자·도형).
- **도형**(`PartItem.kind: 'shape'`, `shape: rect|ellipse|line`, `fill?`·`stroke?` #hex): 정면도 편집기·카드·전개도 SVG(`shapeSvg`)·3D 앞면 모두. 설정 창 구성 요소 카드의 [+ 도형](`add-item-shape`), 모양(`item-shape`)·채움(`item-fill`)·선(`item-stroke`)·가로. 채움·선이 둘 다 없으면 종류 색 점선 상자. 시트 면적 계산에는 크기가 있는 객체로 들어간다(그림과 같음). 요약에 "도형 n".
- **그룹**(`Layer.kind: 'group'`, `GROUP_KIND`): 자식을 묶어 함께 옮기는 레이어. 자기 spec·단가·3D 없음. `toParts`/`placedItems` 에서 **투명**(오프셋만 누적, 자식 내용 객체는 가장 가까운 구성 요소 조상이 거둠) — 펼친 거울 `parts` 에는 남지 않으므로 그룹은 **트리가 있는 사인물에서만** 산다(옛 클라이언트가 parts 만 고치면 풀린다). 만드는 UI 는 3단계 레이어 패널. 자식 규칙 `canHold(parentKind, childKind, ancestors)`: 프레임 = 구성 요소·그룹, 구성 요소 = 내용 객체·그룹·(올릴 수 있으면) 시트, 그룹 = 부모와 같음.
- 테스트: `tests/unit/layers.test.ts`(그룹 투명·도형 왕복·깊이 누적·canHold), `tests/unit/parts.test.ts`(3D z·도형 faceItems), `tests/unit/partsLayout.test.ts`(shapeSvg), E2E `partsLayout.spec.ts`(카드·전개도의 도형, 채널 위 시트가 있는 3D 합성), `frontEditor.spec.ts`([+ 도형]).

### 3단계 — 레이어 패널 (구현됨 2026-10-18)
- **편집 병합**(`core/layers.ts` `mergeParts(layers, parts)`): 정면도 끌기·카드 입력처럼 **펼친 parts 를 고치는 기존 편집**이 트리를 새로 만들지 않고 **기존 트리에 병합**된다 — 같은 id 는 자리에서 갱신(좌표는 부모 오프셋을 빼 로컬로), `on` 이 바뀌면 옮기고, 새것은 끝에, parts 에 없는 **보이는** 것만 지운다. 그래서 그룹·이름·보이기·잠금이 편집에도 남는다. `commitParts` 가 트리가 거울과 맞을 때 이 길을 탄다; 패널 편집은 `commitLayers`(트리 저장 + 거울 재생성).
- **숨김**(`visible: false`): `toParts`·`placedItems` 가 그 레이어(와 아래)를 건너뛴다 → 거울·정면도·카드·전개도·견적·3D 모두에서 빠진다(= 만들지 않는 것). 숨긴 레이어는 트리에만 남고 병합 때 지워지지 않는다. **잠금**(`locked`): 자기 또는 조상이 잠긴 내용 객체(`lockedItemIds`)는 정면도에서 고를 수는 있지만 끌기·방향키·정렬이 안 된다(`FrontEditor` `locked`).
- **패널**(`ui/LayerPanel.svelte`, `layer-panel`, 설정 창 [배치] 탭의 정면도 아래): 트리 행(`layer-row`, `data-kind`·`data-id`·`data-selected`·`data-hidden`) — 부모 행 아래 자식, 같은 형제는 **위가 맨 위 레이어**(일러스트레이터 손버릇), 맨 아래 프레임 행(`layer-frame`). 행을 누르면 정면도 선택과 같이(`sel` 양방향), 접기(▾/▸), 체크(`layer-check`) → [그룹](`layer-group`, 같은 부모 안에서만, `groupLayers`), 눈(`layer-eye`, `setLayerProps visible`), 자물쇠(`layer-lock`), 이름 더블클릭(`layer-name`→`layer-name-input`), ▲▼(`layer-up/down`, `moveLayer` — 같은 부모 안 한 칸), 그룹 [풀기](`layer-ungroup`, `ungroupLayer`: 오프셋을 자식에 더함), 내용 객체·그룹 ✕(`layer-remove`; 구성 요소는 카드에서 지운다). 행 이름: 구성 요소 = "채널 · 전광 채널", 글자 = 글 내용, 그림, "도형 · 원", 그룹 = 이름 또는 "그룹".
- 배치 탭은 숨긴 객체만 있어도 남는다(`anyItemLayer`).
- 테스트: `tests/unit/layers.test.ts`(병합·숨김·잠금·순서·그룹·풀기), E2E `frontEditor.spec.ts`(패널 ↔ 정면도 선택, 숨기기/보이기, 잠금 끌기 무시, 그룹 → 이름 → 끌어도 그룹 유지 → 풀기).

### 4단계 — 세트 라이브러리 (구현됨 2026-10-19) · 나머지는 보류
- **세트**(`core/setLibrary.ts` `SignSet{id, name, frame{w,h}, layers, thumb?, createdAt}`): 레이어 패널 [세트로 저장]이 체크한 레이어(없으면 전체)의 서브트리를 저장 시점 사인물 크기와 함께 계정 라이브러리(`/api/me/sets`, D1 `accounts.sets` JSON, 마이그레이션 0015; 기기 사본 `ganpanda.sets`)에 둔다. 구성 요소 카드의 [+ 세트…]로 넣으면 `insertSet`: 배율 = min(가로비, 세로비)(비율 유지), 모든 상자 좌표·크기에 곱하고 id 를 새로 만든다. 뿌리가 구성 요소뿐이면 프레임 아래에, 내용 객체가 섞였으면 그 카드의 구성 요소 아래에. 썸네일은 펼친 구성 요소의 작은 SVG(`thumbOf`).
- **보류**: 새 컴포넌트(조명·LED 모듈·몰딩·지주)는 공급사 단가·제작 규칙이 정해져야 모듈을 쓸 수 있어 사용자와 사양을 정한 뒤에. 거울 `parts` 제거는 읽는 곳이 40곳이 넘어 이득보다 위험이 커 당분간 유지(트리가 있으면 트리가 진실, 거울은 파생).
- 테스트: `tests/unit/setLibrary.test.ts`, `server/test/sets.test.ts`, E2E `frontEditor.spec.ts`(저장 → 절반 크기 사인물에 넣기 → 글자 높이 절반).

