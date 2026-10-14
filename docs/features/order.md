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
| 분류 | 종류 (`productId`) | 옵션 |
|---|---|---|
| 간판 | 후렉스 간판 `board-flex` | 단면/양면 · 내부 조명(LED/형광등/비조명) |
| 간판 | 갈바 간판 `board-galva` | 돌출형/일체형(전면) · 간접조명(없음/T5 LED 주백색/전구색/측면 LED 바) · 도색 컬러코드(PANTONE/RAL/KCC + 코드) |
| 간판 | 돌출 간판 `board-protrude` (2026-10-15 사용자: "간판에 돌출간판이 없다") | 면(**양면** 기본/단면) · 몸체(갈바 도색/후렉스/아크릴) · 내부 조명(LED/비조명) · 갈바 도색일 때만 컬러코드 · 브라켓(기본 포함/별도 제작/기존 사용). 단가 ㎡(양면 기준, 기본 320,000) |
| 간판 | 알루미늄 복합판 `board-acp` · 포맥스 `board-foamex` · 아크릴 `board-acrylic` | 단면/양면 · 마감(실사 출력/시트 컷팅/도색) · 도색일 때만 컬러코드 |
| 간판 | 채널 간판 전광 `ch-front` · 후광 `ch-halo` · 전후광 `ch-both` · 갈바 에폭시(비조명) `ch-galva` | 채널 종류(캡/오싸이/일체형) · LED 색(비조명은 없음) · 알루미늄·측면·프레임 도색 컬러코드 |
| 스카시 | 고무 스카시 `ch-rubber` | 두께 10/20/30/50T · 전면판 종류(시트 부착/아크릴 전면판/없음) · 전면 색상(없음이 아닐 때) |
| 스카시 | 티타늄 스카시 `sc-titan` | 색상(골드/실버/로즈골드/블랙/브론즈) · 표면 마감(헤어라인·무광 / 미러·유광) |
| 스카시 | 아크릴 스카시 `ch-scashi` | 두께 2/3/5/8/10T · 색상(색상 코드/지정 도색) · 코드 |
| 스카시 공통 | | 시공용 1:1 종이 도안 · 아크릴 가다 · 전면 시트 컷팅(부착 출고/미부착) |
| 시트 | 원웨이 `sh-perf` · 돔보 컷팅 `sh-print` · 시트 컷팅 `sh-cut` · 반사 · 안개 · 투명 | 공통: 보조시트(어플리케이션 테이프) 포함 · 코팅(없음/유광/무광). 시트 컷팅: 반컷팅 |
- 규격(가로×세로 mm)·문구·디자인(UV 매핑)은 기존 치수·문구·소스 기능 그대로. 사인물별 **요청사항**(`note`)은 설정 창의 "요청사항".
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
