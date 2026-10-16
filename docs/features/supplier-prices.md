# 공급 단가표 (거래업체 단가) + 내 단가표

## 요약
사용자 요청(2026-10-16): "한울 단가표이다. 해당 단가는 한울 꼬리표가 있어야 한다. 추후 거래업체에 단가표를 공급받아 제공하려한다. 현재는 사용자가 등록한 단가표로 구성해 해당 사용자만의 단가표이다. 지금은 개발중으로 둘다 구성하고 추후 업로드나 api로 단가를 공급받고 사용자가 입력가능하게".

- **공급 단가표**: 거래업체(지금은 한울상사)가 주는 원가표. 읽기 전용 참고값이며 품목마다 공급업체 **꼬리표**(예: `한울`)가 붙습니다.
- **내 단가표**: 사용자(제작자)가 정하는 판매 단가(`PriceTable`, [sign-list-quote.md](sign-list-quote.md)). 견적은 언제나 내 단가표로 냅니다.
- 둘을 잇는 것이 **연결(link)**: 내 단가 항목을 공급 품목에 연결하면 그 단가를 가져오고, 견적 줄에 `· 한울 단가` 꼬리표가 붙습니다. 직접 고치면 연결이 풀립니다(꼬리표 = 공급업체 단가 그대로라는 뜻).

## 상태
| 항목 | 상태 |
|---|---|
| 한울 단가표 2026-03-27(PDF 스캔 옮겨 적음, 8분류·113품목) | 구현됨 (2026-10-16) |
| 단가 설정 창: 공급 단가표 보기(펼침), 항목별 "공급 단가" 연결 선택, 꼬리표 | 구현됨 (2026-10-16) |
| 견적 줄 꼬리표(`QuoteLine.supplier`, 상세 문구 `· 한울 단가`) | 구현됨 (2026-10-16) |
| 업로드·API 형식 검증(`parseSupplierList`) | 구현됨 (함수만, 화면·서버 없음) |
| 단가표 업로드(엑셀·JSON)·거래업체 API 수신, 서버 보관, 버전(적용일) 관리 | 계획 |
| 단가 변경 알림(연결된 내 단가와 공급 단가가 달라졌을 때), 마진(공급가 × 배수)으로 내 단가 계산 | 계획 |
| 추가금(코팅·LG·마감)·폭 구간 자동 적용, 주문서에 공급 품목 표기 | 계획 |

## 데이터 (`src/lib/core/supplierPrices.ts`)
```ts
SupplierPriceList { supplier: { id, name, tag }, effectiveDate: 'YYYY-MM-DD', source: 'pdf' | 'upload' | 'api', items: SupplierItem[] }
SupplierItem { id /* '<공급업체>.<분류키>.<이름>[.<세부>]' */, group, name, option?, maxWidthMm?, unit: '회배' | '장' | '개' | 'm', price, surcharge?, note? }
PriceTable.links?: Record<단가 항목 id, '<공급업체 id>:<품목 id>'>
```
- **회배 = 1m × 1m = 1㎡** — ㎡ 단가 항목에는 회배 기본 품목만, m 은 m, 개 는 개 품목만 연결할 수 있습니다(`linkableItems`, 추가금 제외).
- `mergePrices` 는 알 수 없는 항목 id·없는 품목을 가리키는 연결을 버립니다. 서버(`/api/me/prices`)는 `links` 를 문자열 맵(100개, 200자 이하)으로만 검사합니다.
- `parseSupplierList(raw)`: 공급업체(id 소문자·숫자·-, 이름, 꼬리표)·적용일이 없으면 거부. 품목은 id 중복·이름 없음·모르는 단위·음수 단가를 이유와 함께 빼고 나머지를 받습니다.

## 한울 단가표 (2026-03-27)
분류: 수성 · UV · 솔벤 · 플렉스 · 플렉스 마감 · 라텍스 · UV시트평판 · 컷팅. 원본 표와 비고는 [../product/supplier-hanwool.md](../product/supplier-hanwool.md#단가표-2026-03-27).

## 화면 (`ui/PricesDialog.svelte`)
- 항목 줄: 이름(연결되면 꼬리표 `price-tag-<id>`) · 단가(`price-<id>`) · 단위 · 공급 단가(`price-link-<id>`: 직접 입력 / 공급업체·분류별 품목).
- 아래 **공급 단가표**(`supplier-lists`): 공급업체마다 꼬리표·이름·적용일·품목 수, 누르면(`supplier-toggle-<id>`) 분류별 표(이름·세부·최대폭·단가/단위, 추가금은 `+`).

## 관련 테스트
`tests/unit/supplierPrices.test.ts`, `server/test/prices.test.ts`, `tests/e2e/quote.spec.ts` (공급 단가표)
