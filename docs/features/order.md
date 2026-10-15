# 주문 사양과 주문서

## 요약
사인물마다 **주문 사양 옵션**(종류별 세부 옵션)을 넣고, 프로젝트에 **주문 정보**(주문자·연락처·배송/시공·납기·요청사항)를 적으면 **주문서**(인쇄)와 **주문 JSON**이 나옵니다. 사용자 요청(2026-10-14): "사인물 주문까지 가능하게… 요소가 많고 조합도 해야 하는 상황".

## 상태
구현됨 (2026-10-14). 옵션별 가격 차등은 아직 없음(단가는 종류·㎡·글자 기준 그대로).

## 설계 원칙: 옵션은 데이터(스키마)
항목마다 폼을 손으로 만들지 않고 `src/lib/core/options.ts` 의 **스키마**가 폼을 정합니다. 종류를 고르면 그 종류의 옵션만 보이고, 조합 규칙은 필드의 `when`(다른 옵션 값 조건)으로 처리합니다. 새 품목·옵션은 스키마에 한 줄 추가.

```ts
OptionField { key, label, kind: 'select' | 'toggle' | 'text', values?, placeholder?, when?(opts, obj) }
PRODUCT_OPTIONS[productId]  // 제품별
SCASHI_ACCESSORY_OPTIONS     // 스카시 공통 (시공 보조 부속품)
SHEET_COMMON_OPTIONS + SHEET_OPTIONS[sheetId]  // 시트 공통 + 시트별
```
- `optionGroupsFor(obj)`: 이 사인물에 보여 줄 묶음(제목 + 필드, 조건부 필드는 현재 값으로 거름)
- `optionValue(field, opts)`: 값 또는 기본값(select 첫 값 / toggle false / text '')
- `normalizeOptions(obj)`: 종류를 바꿔 안 보이게 된 키는 버림 (저장 전 정리)
- `describeOptions(obj, {defaults})`: 요약 문구 목록. 패널 요약은 고른 것만, 주문서·JSON 은 기본값까지
- `effectiveOptions(obj)`: 보이는 필드 전부의 실제 값 (JSON 용)

## 품목과 옵션 (스키마 내용)
**2026-10-15 분류 재정리** (사용자: "간판,시트,스카시,포맥스,현수막,라이트패널,액자,어닝 / 프레임스타일:후렉스,갈바,트러스트,파이프간접 / 후렉스: 단면,양면 / 프레임 재질(후렉스제외):스텐,알루미늄,철,천 / 스카시: 고무, 티타늄, 아크릴 (두께,재질, 도색컬러코드) / 시트: uv실사(흰색,회색), 단색(재질)시트,안개 / 시트커팅: 돔보(uv실사), 커팅(단색,재질시트) / 포멕스:uv시트부착 / 어닝: 고정형,접이식(수동,자동, 펼침, 제작사, 천코드,핸들좌우,핸들길이)" + 답 "채널은 간판 옵션, 스카시도 부착", "돌출·알루미늄 복합판·몸통 없음·지주·전광판은 간판, 사인미러는 따로", "트러스트 = 채널을 잡는 프레임보다 가는 프레임(→ 트러스), 천 = 텐션 천", "펼침 = 벽에서 나오는 길이, 직접 입력", "액자에 나무틀 패브릭도"). 발주처 조사·3D 모델링 목록은 [../product/supplier-hanwool.md](../product/supplier-hanwool.md).

| 분류 (`Group`) | 종류 (`productId`, 목록 순서) | 옵션 |
|---|---|---|
| **간판** `sign` | 후렉스 `board-flex` · 갈바 `board-galva` · 트러스(얇은 프레임) `board-truss` · 파이프 간접 `board-pipe` · 돌출 `board-protrude` · 알루미늄 복합판 `board-acp` · 지주 `board-pole`(개) · 전광판 `board-ledsign`(개) · 천갈이 `board-reface` · 에어간판 `board-air`(개) · 몸통 없음 `body-none` | 후렉스: 면(단면/양면) · 내부 조명 · 프레임 구조(일반 텐션/카바) · 플렉스 출력. 갈바·트러스·파이프 간접: **프레임 재질(스텐/알루미늄/철/텐션 천)** + 형태·간접조명·도색(종류별). 돌출: 면·모양·몸체·조명·도색·브라켓. **간판 옵션(`takesLetters`)**: 채널(입체 글자) + **스카시 부착**(고무/티타늄/아크릴 → 두께·재질·도색·글자 높이). 천갈이·전광판·에어간판은 채널·스카시 없음 |
| **시트** `sheet` (제품 없이 `sheetIds`) | UV 실사 (돔보 커팅) `sh-print` · 단색·재질 시트 (커팅) `sh-cut` · 안개 시트 (커팅) `sh-frost` | 공통: 보조시트·코팅. UV 실사: 바탕(흰색/회색)·잉크. 단색·재질: 재질(단색/반사/투명/메탈/홀로그램)·반컷팅. 커팅 방식은 종류로 정해져 이름에 표시. 옛 원웨이·반사·투명 시트는 붙어 있을 때만 보임(`sheetsForPicker`) |
| **스카시** `scashi` | 고무 `ch-rubber` · 티타늄 `sc-titan` · 아크릴 `ch-scashi` | **두께 · 재질 · 도색(체계: 도색 없음/PANTONE/RAL/KCC + 코드)** (+ 티타늄 표면 마감, 아크릴 문자) + 시공 보조 부속품 |
| **포맥스** `foamex` | 포맥스 `board-foamex` | 두께 · **UV 시트 부착** |
| **현수막** `banner` | 현수막 `banner` | 출력(일반/솔벤) · 줄미싱 · 양끝미싱 · 장폭이음·사방미싱 · 밴드미싱 |
| **라이트패널** `lightpanel` | 라이트패널 `board-lightpanel` · 패브릭 라이트박스 `board-fabric` | 면 · SMPS 내장/외장 · 실내/옥외 방수형 · 프레임 색 / 확산바 · 설치 |
| **액자** `frame` | 아크릴 액자·현판 `board-acrylic` · 프레임 액자 `frame-plain` · **나무틀 패브릭 액자** `frame-wood` | 아크릴: 형태·아크릴·두께·판재 출력·전처리·부착 / 프레임 색·출력 / 나무틀(원목/화이트/블랙/월넛)·패브릭 출력 |
| **어닝** `awning` | 어닝 `board-awning` | 형태(고정형/접이식) · 접이식: 작동(수동/자동) · 수동: 핸들 위치(좌/우)·핸들 길이 · 공통: **펼침(벽에서 나오는 길이 mm)** · 제작사 · 천 코드 (직접 입력, 추후 목록) |
| **사인미러** `mirror` | LED 사인미러 `board-mirror`(개) | 거울 · 프레임 · 프레임 색 · LED 빛 |

- 제품 id·채널 값은 그대로라 기존 프로젝트는 새 분류로 자동으로 읽힙니다(분류 = 제품 id 로 정함, `groupOfProduct`). 분류가 바뀐 종류(아크릴 → 액자, 포맥스 → 포맥스)는 더는 안 보이는 옵션이 저장 시 정리됩니다(`normalizeOptions`).
- **상단 조명** (간판 옵션, 2026-10-16 사용자: "간판에 상단에 돌출 조명, 트러스트바형식의 간접조명, 트러스트 타공조명 등을 자동 모델링"): `topLight` 없음 / 돌출 투광등 / 트러스 바 간접조명 / 트러스 타공 조명. 투광등은 개수(`topCount`, 비우면 가로 1.2m 마다 하나·최소 1)·팔 길이(300/450/600mm), 공통 빛 색(주광 5700K/주백 4000K/전구 3000K). 견적(`core/topLight.ts`): 투광등 = 개수 × 원/개(`tl-arm`), 트러스 = 간판 가로 m × 원/m(`tl-bar`·`tl-perf`, 단가 단위 `m` 추가, 단가 설정의 "상단 조명 (옵션)"). 3D 자동 모델 → [render-3d.md](render-3d.md)
- **조합형 (2026-10-16)**: 간판 분류의 채널·스카시·시트는 구성 요소 카드로 옮겼습니다(글자·그림 객체 여러 개, 구성 요소별 견적·요약·JSON `parts`) → [composition.md](composition.md). 아래 채널·스카시 부착 옵션은 옛 데이터를 읽을 때 구성 요소로 바뀝니다.
- 스카시 부착은 견적에 스카시 줄(자·cm, 글자 높이 = 스카시 글자 높이 > 간판 높이), 3D 에 비조명 입체 글자(두께 = 스카시 두께 T=mm).
- 분류의 기본 종류 = 목록 첫 종류(`defaultProductFor`).
- 2026-10-15 한울 조합형(이 재정리 전)의 채널 조합은 그대로: 채널 종류 · 방식 · 제작 방식 · 입체 두께 · 양면 · LED 색 · 서체 · 도색 · 글자 높이 · 알루미늄 채널 프레임 · 까치발.
- 규격(가로×세로 mm)·문구·디자인(UV 매핑)은 기존 치수·문구·소스 기능 그대로. **두께**(`depthMm`, 2026-10-15 사용자 "두께가 필요해"): 보드 종류(후렉스·갈바·돌출 등)의 두께·돌출 깊이 mm. 설정 창 치수 칸(`depth-mm`)과 휴대폰 빠른 막대 사이즈 줄(`quick-depth`)에서 입력, 요약·제안·주문서에 `가로×세로×두께`, JSON `size.depth_mm`, 3D 상자 깊이에 반영, 연결된 사인물이 공유하는 규격 필드, 승인 해시에 포함. 채널 글자 두께는 입체 설정(`letter3d.depthMm`) 그대로. 사인물별 **요청사항**(`note`)은 설정 창의 "요청사항".
- 제품 id 는 바꾸지 않고 **이름만 재편**해서 기존 프로젝트·단가표가 그대로 호환됩니다(예: `board-flex` "플렉스" → "후렉스 간판", `ch-scashi` → "아크릴 스카시"). 새 종류: `ch-both`(전후광), `sc-titan`(티타늄 스카시) — 단가표 기본값 추가.
- 분류 기본 제품: 간판 → 후렉스, 스카시 → 고무 스카시.

## 데이터
- `SignObject.options?: Record<string, string | boolean>`, `SignObject.note?` — 규격 필드(연결된 사인물은 원본 것) → [../architecture/data-model.md](../architecture/data-model.md)
- `settings.order?: OrderInfo { customer, company, phone, delivery('install'|'ship'|'pickup'), address, dueDate(YYYY-MM-DD), notes }` (`core/order.ts`)

## 화면
- **사인물 설정 창**: 종류 아래에 옵션 묶음이 자동으로 나옵니다(`option-group`, 필드 `option-<key>`: select/checkbox/text). 시트를 고르면 시트 옵션. "요청사항"(`sign-note`).
- **패널 요약**: 고른 옵션이 종류 뒤에 붙습니다(예: "갈바 간판 · 일체형(전면) · RAL · 도색 컬러코드 9005 · 반컷팅 · 3,000×600mm").
- **사인물 리스트** 오른쪽: [주문 정보](`open-order` → `OrderDialog.svelte`, `app.orderOpen`), [주문서·견적서](`open-quote-sheet`).
- **주문서**(`QuoteSheet.svelte`): 주문 정보가 하나라도 있으면 제목이 "주 문 서", 머리에 주문자·연락처·배송/시공·납기(`order-info`). 항목마다 사양 문구(기본값 포함)·문구·디자인 파일·요청사항. 아래에 추가 요청사항, 첨부 파일(UV 소스) 목록, **작업 파일 체크**(CMYK, 윤곽선, 칼선 레이어, 벡터 원본). [JSON 내보내기](`order-json`) → `orderJson()` 구조:
  ```json
  { "project", "created_at", "order_info": {…, "delivery_label"}, "items": [{ "id","name","category","type","sheets","options","option_summary","size":{"width_mm","height_mm","estimated"},"text","design_file","amount","note" }], "files": [{"name","pages"}], "file_check": […], "totals": {…}, "notes" }
  ```

## 관련 코드·테스트
- `src/lib/core/options.ts`, `src/lib/core/order.ts`, `src/lib/core/catalog.ts`, `src/lib/ui/ObjectSettingsDialog.svelte`, `src/lib/ui/OrderDialog.svelte`, `src/lib/ui/QuoteSheet.svelte`
- `tests/unit/options.test.ts`(종류별 필드·조건부·요약·정리), `tests/unit/order.test.ts`(JSON), `tests/e2e/order.spec.ts`(옵션 폼 → 요약 → 주문 정보 → 주문서 → JSON 다운로드)

## 남은 일
- 옵션별 가격 차등(양면·조명·두께 추가금)을 단가표에, 수량, 사업자 정보, 주문 상태(접수→제작→시공) — 6차 제안 링크 + 승인과 합쳐서 "고객 승인 = 주문 접수"
- 현장 용어·옵션 값은 사용자가 알려 주는 대로 스키마에 반영
