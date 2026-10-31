# 색 라이브러리 (컬러 카드)

사용자 요청(2026-10-17): "색상관리가 중요하다. 해당 컬러 카드를 놓고 컬러 생성 대화창으로 만들고 페인트, 시트, 천, 필름 선택하고 컬러이름(버건디) 컬러피커로 컬러선택해주고 공급사명 해당코드 입력. 해당 컬러는 라이브러리에 저장해서 꺼내쓴다. 프로젝트내에서(그룹포함) 컬러대화창에서 바로 선택"

## 컬러 카드 (`core/colorLibrary.ts`) — 구현됨
| 칸 | 뜻 |
|---|---|
| `kind` | 페인트 · 시트 · 천 · 필름 (`COLOR_KINDS`) |
| `name` | 읽는 이름 (버건디) — 칩·요약·사양 글에서 이 이름 |
| `hex` | `#rrggbb` (컬러 피커) — 2D 바탕·3D·카드 색 |
| `supplier`, `code` | 공급사(3M, 삼화페인트…)와 그 색 코드(1080-G13, KCC 7520…) — 발주용 |

- **저장 위치**: 계정 라이브러리 `/api/me/colors`(`accounts.colors` JSON, 300개·60KB, [server/api.md](../server/api.md)) + 기기 사본(`localStorage ganpanda.colors`). 로그인 전에는 기기 사본만 쓰고, 로그인하면 서버 값이 우선(서버에 없고 기기에만 있으면 올린다). 프로젝트·그룹에 무관하게 **내 모든 프로젝트**에서 같은 라이브러리.
- **사인물에 들어가는 방식 = 스냅샷**(`paintPatch(prefix, card)`): 도색 객체에 `<prefix>System='라이브러리'` · `<prefix>Code=이름` · `<prefix>Hex` · `<prefix>Ref="시트 · 3M · 1080-G13"` · `<prefix>CardId`. 고객(열람)·다른 멤버는 라이브러리가 없어도 색과 출처를 본다. 라이브러리에서 카드를 지워도 이미 쓴 사인물은 그대로. `paintHex`는 Hex, `paintLabel`은 이름, `paintRef`는 출처.

## 화면
- **색 피커**(`ui/ColorField.svelte`, 색이 필요한 모든 곳, 2026-10-18 사용자: "컬러선택을 색상 ㅁ 상자로 바꾸고 현재 진열된 컬러들은 대화상자에서 보여줘 컬러 피커와 같이"): 필드에는 **색 상자 ■**(`…-box`, 지금 색; 없으면 ✕ 점선)와 지금 값(`…-now`, 이름·출처 `…-ref`)만. 상자를 누르면 **색 고르기 창**. 확장 모드(`…-expand`)는 그대로(체계·코드·광택·투명도, `라이브러리` 체계면 카드 선택).
- **색 고르기 창**(`ui/ColorCardDialog.svelte`, `color-dialog`) 한 창에 위에서 아래로: ① **기본색** 견본(`…-swatch-<색>`, 전체 30여 색, 기본 11개는 크게) · ✕ 도색 없음(`…-none`) · 🎨 직접(브라우저 컬러 피커 `…-picker`, 고르면 바로 반영) — 견본을 누르면 적용하고 닫힘. ② **라이브러리**: 검색창(`color-search`: 이름·태그·공급사·코드·종류, 글자마다 바로 거름) + 종류 필터(`color-filter-<종류>`) + 카드(`…-lib-<id>`, `data-name`, 누르면 적용하고 닫힘). 카드의 **⋯ 메뉴**(`color-menu-<id>`) → **수정**(`color-edit-<id>`: 아래 폼에 채워짐, `color-form[data-editing]`) / **삭제**(`color-delete-<id>`, 확인) — 2026-10-18 "x 마크 대신 메뉴 나오게 하고 수정 삭제로". ③ **새 색 만들기 / 색 수정**: **태그**(`color-tags`: 입력창이자 검색창 — 글자를 치면 아래에 기존 태그 목록 `color-tag-suggest-<태그>`가 바로 뜨고(비어 있으면 전부), Enter·쉼표·클릭으로 더함, 없는 글이면 `color-tag-new`; 고른 태그는 칩 `color-tag-<태그>`) → 종류 `color-kind` · 색 이름 `color-name` · 색(■ 상자 `color-hex` + `color-hex-text`) · 공급사 `color-supplier` · 코드 `color-code` → [저장하고 적용](`color-save`) / 수정이면 [저장]·[취소](`color-edit-cancel`); 지금 필드가 그 카드면 스냅샷도 갱신. 태그는 `ColorCard.tags`(≤10개, 20자, 서버도 검사).
- **사양 글**(`core/specText.ts`): `parseSpecText(text, obj, app.colorLibrary)` — 내 카드 이름을 기본색 어휘보다 **먼저** 알아본다("갈바 딥레드 채널 …" → 몸통 색: 딥레드, 스냅샷으로 적용). 기본색과 이름이 같으면(버건디) 내 카드가 이긴다.
- 빠른 설정 `applyQuick`: `bodyCard`/`channelCard`가 있으면 스냅샷으로, 채널은 3D 옆면 색(letter3d)도 카드 hex.

## 테스트
`tests/unit/colorLibrary.test.ts`, `server/test/colors.test.ts`, `tests/e2e/colorLibrary.spec.ts`

## 후속 (계획)
- 팀 공유(멤버가 소유자의 라이브러리 사용), 공급사 카탈로그(3M 1080·오라칼·KCC 컬러칩) 미리 넣기, 카드 수정, 견적서·주문서에 공급사 코드 표기.
- **프로젝트 컬러 (2026-10-31)**: 사인물이 함께 쓰는 프로젝트 칸(메인·배경·포인트…)·컬러셋 → [sign-props.md](sign-props.md). 컬러 카드(이 문서)와 잇는 것은 남은 일.
