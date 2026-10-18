# 조합형 사인물의 레이어 구조 — 제안 (2026-10-18, 미결정)

사용자: "사인물 구성의 모듈화와 클래스화가 아직 부족해 보인다. 조합형을 위한 레이어 형태의 자유로운 구성이 필요하다. 제안해 줄 수 있나"

상태: **제안**. 결정되면 [../product/decisions.md](../product/decisions.md)에 적고 이 문서를 설계 문서로 바꾼다. 현재 구현은 [../features/composition.md](../features/composition.md).

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

0~1 을 먼저 하면 겉모습은 그대로인 채 내부가 모듈화되어, 이후 종류 추가·레이어 UI 가 모두 "모듈 하나" 단위로 쪼개진다.

## 6. 결정이 필요한 것

1. **범위**: 0~1 부터 시작할지(권장), 3(레이어 패널)까지 한 번에 갈지.
2. **좌표계 전환**: 부모 기준 로컬 mm 로 바꾸면 기존 정면도 위치는 변환으로 보존된다. 외부로 나가는 값(주문 JSON 의 객체 위치)은 절대 mm 유지.
3. **프레임도 레이어로**: 몸통 옵션(프레임 색·테두리·판 두께·상단 조명)을 `frame` 레이어의 spec 으로 옮기는 데 동의하는지. 옵션 패널 모양은 유지 가능.
4. **컴포넌트 정의 방식**: 코드 모듈(권장, 타입 검사·테스트 용이) vs JSON(코드 없이 추가 — 2차).
5. **옛 형식 병행 기간**: 저장을 새 형식으로만 할 시점.
