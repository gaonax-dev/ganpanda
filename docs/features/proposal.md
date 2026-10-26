# 제안 링크와 승인 (6차 "한 장으로 결정하기")

## 요약
간판집이 고객에게 **링크 하나**를 보냅니다: 가게 사진 위에 간판이 이렇게(주간/야간) 달립니다 · 사인물 치수·사양 · 총 금액 · 질문 · **[이걸로 할게요]**. 고객은 로그인 없이 휴대폰에서 보고, 다른 사람에게 그대로 전달하고, 승인합니다. 승인 시점의 내용이 기록되고, 그 뒤 내용이 바뀌면 "재승인 필요"가 됩니다. 니즈 배경 → [../product/roadmap.md](../product/roadmap.md) 6차.

## 상태
구현됨 (2026-10-14): 6-1 제안 페이지, 6-2 승인·기록, 6-3 제안 만들기. 6-4 카카오 로그인은 운영 키 대기.

## 흐름
1. **제작자**: 상단 바 **[제안 보내기]**(`proposal-button`) → `ProposalDialog.svelte`(`app.proposalOpen`).
   - 준비 점검(`proposalProblems`): 사진·사인물 없음, 분류 없는 사인물, 치수 없는 사인물, 사인물이 있는 사진의 3D(원근) 미준비 → 안내 목록(`proposal-problems`), 만들기 비활성.
   - "고객에게 한마디"(`proposal-note`) 선택.
   - **[실사 이미지 만들고 링크 발급]**(`proposal-build`): 사인물이 있는 사진마다 화면 없이 3D 합성(`render/scene.ts` `renderPhotoPngs`, 3D 뷰와 같은 규칙, 격자 없음)해 주간·야간 PNG 를 에셋으로 올리고(`putAsset`), `settings.proposal = { id, createdAt, author, renders[{photoId, day, night}], hash, note? }` 저장. viewer 초대 토큰(`kind: 'proposal'`)을 만들어 링크 **`https://sync.ganpanda.co.kr/p/<project>/<token>`**(`proposal-link`) 표시·복사. **무료 요금제는 한 달 3건**(계정 합산) — 넘으면 서버 402 와 안내(`proposal-error`) → [../product/pricing.md](../product/pricing.md). 요청판에서 만든 프로젝트면 이때 응답이 기록되고 고객 연락처가 열린다 → [requests.md](requests.md). [고객이 보는 제안 페이지 미리보기](`proposal-preview`)로 제작자도 같은 화면을 봅니다(`app.proposalMode`, 하단 [← 작업 화면으로]).
2. **링크**: 서버 `GET /p/:project/:token` 이 OG 메타(제목 = 프로젝트 이름, 이미지 = 첫 사진 주간 렌더 `/p/:project/:token/image.png`)를 담은 HTML 을 주고 앱 `/?room=…&invite=…&proposal=1` 로 넘깁니다 → 카카오톡·문자에서 미리보기가 보입니다. 토큰이 틀리면 404. → [../server/api.md](../server/api.md)
3. **고객**: `?proposal=1` 이면 `ProposalView.svelte`(`proposal-page`)만 보입니다(작업용 상단 바·뷰 메뉴 숨김, 휴대폰 폭). 제목·한마디·제작자·날짜, 주간/야간 토글(`proposal-night`)과 사진마다 렌더(`proposal-render`), 사인물 카드(`proposal-sign`: 이름·종류·시트·옵션(기본값 포함)·치수(추정 표시)·문구·금액)와 **[질문하기]**(`proposal-ask` → 기존 `Chat`, viewer REST 로 기록, 제작자에게 알림), 총 금액(`proposal-total`, 부가세·설치비 포함, [금액 자세히]로 항목), 승인 칸(`proposal-approve`, `data-status`). 소유자가 무료 요금제면 맨 아래 "간판다로 만든 제안 · 간판집이라면 무료로 시작하세요"(`proposal-branding`, 2026-10-17).
4. **승인**: [이걸로 할게요](`proposal-approve-button`) → 이름(`proposal-approver`, 별명 기본) → [네, 이 내용으로 승인합니다](`proposal-approve-confirm`) → `app.approve(name)` → `POST /api/rooms/:id/approvals`(초대 토큰/세션) → 서버 Room DO `addApproval` 이 `settings.approvals` 에 `{ id, at, by, hash, snapshot, proposalId }` 를 추가하고 대화에 `kind: 'approval'`, `objectId: 'project'` 메시지를 남깁니다 → 제작자에게 토스트("홍길동 님이 제안을 승인했습니다 (합계 …원)"), 상단 바에 **✅ 승인됨 · 이름**(`approval-status`).

## 내용 해시와 재승인 (`core/proposal.ts`)
- `canonicalContent(signs, sizeOf, quote)`: 사인물(원본만)의 id·이름·제품·시트·옵션·문구·치수(입력 또는 추정, 정수)·모서리·디자인(소스/페이지/영역)·금액과 견적 합계·부가세 방식을 id 순으로 정렬한 JSON. 위치·사진 같은 규격 외 필드는 무관.
- `contentHash` = FNV-1a 32비트 hex(동기, 변경 감지용). `app.contentHash` 가 실시간으로 바뀝니다.
- `approvalState(approvals, hash)`: 승인 없음 `none` / 최신 승인의 해시 = 현재 `approved` / 다름 `changed`(재승인 필요). 승인 기록은 지우지 않고 쌓입니다(버전) — 승인 당시 스냅샷(`snapshotOf`: 품목·사양·치수·디자인·금액·합계)이 그대로 남습니다.
- ~~고객 페이지는 `changed` 면 "승인한 뒤 내용이 바뀌었습니다. 다시 확인하고 승인해 주세요"와 버튼, 제작자 상단 바는 "⚠ 변경됨 · 재승인 필요".~~ **대체됨 (2026-10-26)**: 고객 페이지는 발행본만 보이고, 사장이 고친 내용은 다시 발행해야 "변경 견적"으로 간다(계약 견적과 비교해 동의·거절) → [quote-issue.md](quote-issue.md). 제작자 상단 바의 "⚠ 변경됨"은 그대로.

## 데이터
- `settings.proposal: ProposalInfo`, `settings.approvals: Approval[]` → [../architecture/data-model.md](../architecture/data-model.md)
- `Message.kind` 에 `'approval'` 추가 (서버만 기록, 앱의 대화 보내기는 chat/comment 만).

## 관련 코드·테스트
- `src/lib/core/proposal.ts`, `src/lib/render/scene.ts`, `src/lib/ui/ProposalDialog.svelte`, `src/lib/ui/ProposalView.svelte`, `src/lib/projects.ts`(`postApproval`), `server/src/room.ts`(`addApproval`, `proposalImageAsset`), `server/src/index.ts`(`postApproval`, `proposalLanding`)
- `tests/unit/proposal.test.ts`(해시·스냅샷·상태·준비 점검), `server/test/proposal.test.ts`(승인 기록·메시지·거절·버전, OG 랜딩·이미지), `tests/e2e/proposal.spec.ts`(제안 만들기 → 고객 페이지 → 질문 → 승인 → 제작자 표시 → 변경 시 재승인)

## 남은 일
- 카카오톡 공유 버튼(JavaScript 키), 승인 시 제작자 이메일·카카오 알림, 승인 기록 목록 화면(버전 비교), 제안 여러 안(A/B), 고객용 질문을 사인물이 아닌 전체에도

## 색 (2026-10-22)
사용자: "견적제안은 블루컬러로". 제안 화면(`app.proposalMode` — 고객이 여는 제안 링크와 간판집의 미리보기)은 강조색이 **파랑**(`:root.proposal { --accent: #3b82f6 }`). 간판집 작업 화면은 노랑, 가게 사장 화면은 청록, 외주(B2B)는 핫핑크.

## 진행 동의 (2026-10-22)
제안 페이지의 [이걸로 할게요]는 **[진행 동의]**가 되었다 — 사인물을 빼고 동의할 수 있고(`excluded`), 동의하면 프로젝트가 진행중(제작)으로. 간판집 쪽은 작업 탭 [컨펌](표시 없는 사진보드 + 진행 동의 줄). → [confirm.md](confirm.md)

## 링크 발급만 (2026-10-24)
사용자: "제안에 실사 이미지 만들고 링크 발급으로 되어 있는데 실사이미지 만들필요가 없고 링크발급으로".
- 제안 창 단추는 **[링크 발급]**(다시 보내면 [새 링크 발급]) — 사진마다 실사(주간·야간) PNG 를 합성해 올리던 단계를 없앴다(`renders: []`). 링크가 바로 나온다.
- 준비 점검에서 **3D(원근) 준비는 묻지 않는다** — 사진·사인물·분류·치수만.
- 고객 제안 페이지는 실사 이미지 대신 **가게 사진 위에 사인물 외곽선·이름**을 바로 그린다(`proposal-photo`·`proposal-photo-sign`). 예전에 실사 이미지를 만든 제안은 그 이미지(주간/야간)를 그대로 보여 준다.
