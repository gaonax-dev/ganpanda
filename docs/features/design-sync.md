# 디자인 싱크 (2026-11-06)

> 사용자: "아이콘을 하나로 하고 디자인싱크로 버튼 하나 만들고 그안에 대화창으로 일러스트,svg, 코렐드로 선택하고 해당 파일을 보내기 받기
> 받은 다음 사진보드에서 연결상태 확인 후 확정 버튼으로 파일연결 누락이나 새로 생긴 경우 처리방안 필요 …
> 디자인파일은 디자인싱크로 편입 최종적으로 디자인 탭은 디자인싱크 컬러셋 만 남게"

## 디자인 탭 막대
**[⇄ 디자인 싱크]**(`design-sync-open`) · **[컬러셋]**(`colors-open`) 두 개만. 디자인 파일 화면에서는 앞에 [← 사진보드](`view-uv-back`).
예전 막대의 [＋ 일러스트·SVG 올리기] · [일러스트 대지 받기] · [SVG] · [디자인 파일 n] · [이 사인물에 연결]은 모두 대화창 안으로 옮겼다(대체됨).

## 대화창 (`ui/DesignSyncDialog.svelte`, `design-sync-dialog`)
위에서 프로그램을 고른다(`sync-program-illustrator|corel|svg`). 고객 컨펌 전 변경안이 있으면 경고(`unconfirmed-warning`, 10-0).

| 프로그램 | 보내기 (간판다 → 프로그램) | 받기 (프로그램 → 간판다, `sync-receive-input`) |
|---|---|---|
| 일러스트레이터 | [대지 받기 (zip)](`illustrator-download`) · [설치용 스크립트](`illustrator-script`) — [illustrator.md](illustrator.md) | 스크립트로 저장한 `.ai`(PDF 호환, XMP 짝) · [간판다로 보내기]의 `.ganpanda`(구성 요소 묶음) |
| 코렐드로우 | 전개도 SVG 실물 1:1(`svg-download`, 대지 레이어 포함 — 가져오기 Ctrl+I) · 칼선 SVG(`cut-download`) | 사인물마다 한 페이지로 내보낸 `PDF` — 짝 정보가 없어 **페이지 크기(1:1·1:10)로** 찾는다. 코렐 매크로는 다음 |
| SVG | 전개도 SVG(비율 1:1·1:10·A4, 글자 윤곽선) · 칼선 SVG — 금액·합계 없음 | SVG·그림 → 디자인 파일에만 (영역을 그려 연결) |

아래 줄: **[디자인 파일 n]**(`sync-design-files`, 올린 파일을 보고 영역을 그려 연결하는 화면) · 사인물을 고른 채면 [고른 사인물에 연결](`sync-link-selected`).

## 일러스트 기준 정의 (2026-11-06)
카드 = 실측(사진) · 2D(속성 내용) · 3D(속성 내용 + 3D) · 디자인(대지 이미지). 보내기 = 카드마다 최종 이미지(3D 제외 마지막 단계). 스크립트 = 크기대로 대지 + 레이어 받은 이미지·디자인·path. 가져오기 = 디자인은 대지 이름별 이미지로 카드에 바로, path 는 사용자가 구성물에 연결 → 자세히 [illustrator.md](illustrator.md#일러스트-기준-파일-싱크--정의-2026-11-06).

## 받기 → 사진보드에서 검토 → [확정]
받은 파일은 **바로 입히지 않는다**. 사진보드로 돌아가 오른쪽 위(휴대폰은 아래) **받은 디자인 검토** 패널(`ui/SyncReview.svelte`, `sync-review`)과 카드 표시로 확인하고 [확정](`sync-confirm`) 해야 바뀐다. [취소](`sync-cancel`)면 아무것도 입히지 않는다(올린 파일은 디자인 파일 목록에 남음).

상태(`core/designSync.ts`)와 고를 수 있는 처리(첫째가 기본):

| 상태 | 뜻 | 카드 표시 | 처리 |
|---|---|---|---|
| 연결 | 디자인 없던 사인물에 짝 | 초록 테두리·"연결" | 입히기 / 건너뛰기 |
| 바뀜 | 디자인이 있던 사인물에 새 디자인 | 파랑 테두리·"바뀜" | 입히기 / 기존 유지 — **짝 정보 없이 크기로만 맞은 것은 기본 "기존 유지"**(우연히 크기가 같은 파일이 덮지 않게) |
| 새로 생김 | 파일에만 있는 대지(짝 없음·지워진 사인물·같은 id 두 번째) | 카드 없음, 패널에만 "대지 n · 가로×세로mm" | **새 사인물로**(사진 없는 카드, 크기 = 대지 ÷ 짝지은 대지의 축척, 평면 구역 오른쪽에) / 건너뛰기 — 짝 정보 없이 남은 대지는 기본 "건너뛰기" |
| 누락 | 보낸(치수 있는) 사인물인데 파일에 없음 — 짝 정보가 있을 때만 판단 | 주황 점선·"누락" | 기존 유지 / 연결 해제 |

- 일러스트 묶음(.ganpanda): 사인물별 한 줄(디자인·path). 디자인은 확정하면 바로 바탕 디자인으로. path 는 줄 아래 **path → [구성물]**(`sync-path`)에서 채널·스카시 중 고른다 — 하나뿐이면 미리 골라 두고, 안 고르면 넣지 않는다. 간판다에 없는 사인물은 "새로 생김"이지만 건너뛰기만. 묶음에 없는 사인물은 누락(연결 해제 = 바탕 디자인 해제).
- 짝 정보도 크기 짝도 없는 PDF 는 검토 없이 디자인 파일에만 넣는다.
- 확정하면 알림 "디자인 싱크 확정 — 입힘 n · 새 사인물 n · 연결 해제 n". 입힘은 디자인 이력에 남아 되돌릴 수 있다.

## 코드
- `core/designSync.ts` — `planArtboards`(대지 ↔ 사인물), `planBundle`(묶음 ↔ 사인물), `SYNC_ACTIONS`
- `state.svelte.ts` — `syncOpen`, `syncReview`, `syncRowOf`, `addSourceFile` → `reviewArtboards`·`reviewIllustratorBundle`, `setSyncAction`, `confirmSync`, `cancelSync`
- `ui/DesignSyncDialog.svelte`, `ui/SyncReview.svelte`, `views/BoardCard.svelte`(`card-sync`, `data-sync`)
- 테스트: `tests/unit/designSync.test.ts`, `tests/e2e/illustrator.spec.ts`, `tests/e2e/workTabs.spec.ts`
