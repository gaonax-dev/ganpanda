# 프로젝트와 초대 링크 (권한)

## 요약
방(room) = 프로젝트입니다. 로그인한 사람이 만들어 소유하고, **초대 링크마다 역할**을 정해 고객을 부릅니다. 역할은 서버가 강제합니다.

## 상태
구현됨 (1-2b, 2026-10-13).

## 역할
| 역할 | 얻는 방법 | 할 수 있는 것 |
|---|---|---|
| `owner` | 프로젝트를 만든 계정의 세션 | 모든 편집, 초대 링크 만들기·폐기, 이름 변경·삭제 |
| `editor` | 초대 링크(편집 가능) | 모든 편집 (사진·영역·치수·대화) |
| `viewer` | 초대 링크(고객: 보기·대화만) | **사진 보드만** 보기, 대화·코멘트. 문서 편집은 서버가 버림. 금액은 제안 링크에서 |

- **등록되지 않은 방은 접속 거부(404)**. 세션도 초대 토큰도 없으면 401, 다른 프로젝트의 토큰이면 403.
- 초대 링크 형식: `https://ganpanda.co.kr/?room=<프로젝트ID>&invite=<토큰>`. 자격 검사는 토큰 해시로. 소유자가 폐기하면 즉시 무효. 2026-10-17 부터 **다시 복사**할 수 있게 원문도 저장(`invites.token`) — 초대 창 "만든 링크"마다 [복사](`invite-copy`, 입력칸에도 띄움). 그 전에 만든 링크는 "복사 불가"(새로 만들어 보냄). 제안 링크는 "제안"으로 표시.
- viewer의 대화는 Yjs 업데이트가 아니라 `POST /api/rooms/:id/messages`로 보내고 서버가 문서에 추가합니다(편집 차단과 대화 허용을 함께 만족).

## 앱 동작
- **홈(`/`)**: 로그인하면 내 프로젝트 목록 + 새 프로젝트 만들기(만들면 `?room=<id>`로 이동). 로그인 전에는 안내와 로그인 버튼. 서버 주소가 없는 빌드(오프라인·Tauri)는 예전처럼 `local-default` 방으로 바로 들어갑니다.
- **방 진입(`?room=`)**: 먼저 `GET /api/projects/:id/access`로 역할을 확인하고, 허용될 때만 문서 저장·동기화를 시작합니다. 거부되면 안내 화면(존재하지 않음 / 초대 링크 필요 / 권한 없음).
- **초대 링크로 진입(`?room=&invite=`)**: 토큰을 `localStorage`의 `ganpanda.invite.<room>`에 저장하고 주소에서 지웁니다. 새로고침해도 유지됩니다.
- **상단 바**: 프로젝트 이름, 역할 배지(소유자 / 편집 / 보기·대화), 소유자에게는 [초대 링크] 버튼(역할 선택 → 링크 복사 → 목록·폐기). 로고를 누르면 홈.
- **viewer 화면 = 고객 화면** (2026-10-16 사용자: "고객에게 보여지는 것은 사진보드만 보인다."): 상단 보기 전환(사인물 리스트·디자인 파일)이 없고 사진 보드만(`app.isCustomer`). 사인물 요약·설정 창에 금액 없음. 견적·금액은 제안 링크(`?proposal=1`)에서만. 단, 프로젝트 문서(단가표 포함)는 그대로 받으므로 화면에서만 가린 것 — 서버에서 거르기는 계획.
- **viewer 화면**: 그리기 도구·사진 추가 없음("보기·대화만 가능"), 영역 이동·모서리·삭제 불가, 패널 입력칸 비활성, 전개도 위치 이동 불가. 대화·코멘트는 `POST /api/rooms/:id/messages`로 보냅니다(`app.sendMessage`).
- **표시 이름 우선순위**: 계정 이름 > 기기에 정한 이름 > 이메일 앞부분.

## 프로젝트 그룹 · 상태 · 정산 · 멤버 (2026-10-15)
사용자: "프로젝트 그룹을 만들 수 있게 해 주고 계산서를 그룹에서 한번에, 세부사항은 프로젝트 리스트 뷰로, 상태 대기·진행중·완료, 정산은 받은 금액/계약 금액, 다 받으면 총금액만. 오너는 기본으로, 멤버는 오너가 설정해 준다." 이어서: "복잡해 보인다. 프로젝트를 Shift 로 두 개 잡고 오른쪽 마우스로 그룹 만들기. 리스트 뷰의 계산값이 계약 금액. 입금액은 표시를 클릭하면 입력란, 계약 금액도 직접 입력하면 그 금액 + 자동 계산 복구. 그룹은 두 프로젝트가 겹쳐진 것같이, 클릭 시 폴딩. 멤버 관리는 설정에서. 설정에 계정 구독 상태와 사용량."
- **홈**(`Home.svelte`): 프로젝트는 **카드**(`project-item`). 상단 **[○ 선택]**(`select-mode`) 토글 → 카드를 눌러 고르고(`.sel`, 계산서 행은 체크 `row-select`) **하단 탭**(`select-bar`): [그룹](`bar-group` → 이름 `group-name` → `group-create`, 새 그룹에 바로 넣음) · 기존 그룹에 넣기(`bar-add-to-group`) · 그룹에서 빼기(`bar-ungroup`) · [삭제](`bar-delete`, 확인 뒤 `DELETE /api/projects/:id`) · 취소. 2026-10-15 사용자: "시프트 대신 상단에 선택 버튼으로 토글하면 하단 탭에 기능 버튼 그룹, 삭제"(Shift·오른쪽 클릭 안 씀 — 휴대폰에서도 됨). 보통 클릭은 프로젝트로 이동.
- **그룹 카드**(`group`, 카드 두 장이 겹친 모양, 이름·개수·미수 또는 총액 `group-summary`): 누르면 **계산서**(`group-bill`)가 펼쳐지고 다시 누르면 접힘(`data-open`). 계산서: 프로젝트(링크 `?room=&view=list` → 리스트 뷰 세부) · **상태**(`project-status` 대기/진행중/완료, 오너만) · **받은 금액 / 계약 금액**(각각 눌러서 입력 `paid`→`paid-input`, `contract`→`contract-input`). **계약 금액은 리스트 뷰 견적 합계가 자동**(`data-auto="true"`, "자동" 표시; 앱이 소유자가 열어 둔 동안 `quoteTotal` 을 1초 디바운스로 저장) — 직접 입력하면 그 금액이 되고 [자동 계산 복구](`contract-auto`)가 나타남. 다 받으면 **"총 {계약}"**(`settle`)만. 합계 줄(`group-totals`: 건수·미수·받은/계약 또는 총). [그룹 삭제](`group-delete`)는 프로젝트를 남김.
- **멤버는 설정에서**(`Settings.svelte` "멤버", 계정 단위 `team-section`): 가입된 계정의 이메일로 추가(`member-email/-add`, 없으면 `member-error`), **정산 보기**(`member-billing`), 제거. 멤버는 오너의 **모든 그룹**과 계산서(상태)를 보고, 정산 금액은 정산 보기를 켠 멤버만(서버가 금액을 빼고 보냄). 상태·금액 변경은 오너만. 프로젝트별·그룹별 멤버 관리는 없음. 프로젝트를 열려면 초대 링크. 정산 보기를 켠 멤버가 편집 초대로 열면 견적의 이익율·손해가 보인다(2026-10-16, [sign-list-quote.md](sign-list-quote.md#원가--이익율-2026-10-16)).
- **설정 "계정 · 구독"**(`account-section`): 이메일, 요금제(`plan`), 저장 용량(`usage-storage`, 막대), 동시 작업 인원(`usage-seats`, 고객 열람 제외), 이번 달 제안 링크(`usage-proposals`) → [../product/pricing.md](../product/pricing.md). **"견적 요청 받기"**(`requests-section`: 켜기·지역) → [requests.md](requests.md).
- 데이터: D1 `groups`, `team_members(owner_id, account_id, can_billing)`, `projects.group_id/status/paid_amount/quote_total/contract_override`(NULL = 자동) (`server/migrations/0006_groups.sql`, `0007_team.sql`). API → [../server/api.md](../server/api.md). 테스트: `server/test/groups.test.ts`, `tests/e2e/groups.spec.ts`.
- `?view=list|board|uv` 로 들어가면 그 뷰로 시작(`app.view`).

## 새 배포 안내 (2026-10-15)
오래 열어 둔 탭이 옛 코드로 계속 동작해 "배포했는데 그대로"가 되던 문제(2026-10-15 사용자: "아이폰 크롬이 이전 데이터를 계속 물고 있다").
- **HTML 은 저장하지 않음**: `public/_headers` — `/`, `/index.html`, `/login` 은 `Cache-Control: no-store`, `/assets/*`(해시 이름)는 1년 immutable. 새로 열면 항상 최신 번들.
- **열려 있던 탭**: 시작 3초 뒤·탭이 다시 보일 때·뒤로가기/탭 복원(`pageshow`)·포커스 때(최대 10초에 한 번) 서버 `index.html` 의 번들 이름과 실행 중인 번들을 비교(`core/version.ts`). 다르면 **돌아온 순간(백그라운드 복귀·복원)이거나 홈이면 바로 새로고침**(`shouldAutoReload`), 입력 중이거나 창이 열려 있으면 상단 배너 `update-available` [새로고침]. **되풀이 방지**(2026-10-18 사용자: "모바일 재로딩으로 이 페이지를 열 수 없음" — 휴대폰 브라우저가 no-store 를 무시하고 옛 index.html 을 계속 주면 옛 코드→새 버전 감지→새로고침→옛 코드… 가 끝없이 돌았음): 같은 번들에 대해 1회차는 보통 새로고침, 2회차는 주소에 `v=<번들>` 을 붙여 캐시 우회(`bustedUrl`, 앱은 모르는 검색어를 무시), 3회차부터는 배너만(`reloadPlan`, 세션 저장소 `ganpanda.reloadFor`). 문서는 실시간 동기화로 이미 저장되어 있어 새로고침해도 잃는 것이 없음. 개발 서버에서는 동작하지 않음. 단위 테스트 `tests/unit/version.test.ts`.

## API
→ [../server/api.md](../server/api.md) 프로젝트·초대 절

## 관련 코드·테스트
- 서버: `server/src/projects.ts`, `server/migrations/0002_projects.sql`, `server/test/projects.test.ts`
- 앱: `src/lib/projects.ts`(API), `src/lib/ui/Home.svelte`, `AccessDenied.svelte`, `InviteDialog.svelte`, `src/lib/state.svelte.ts`(`initRoom`, `canEdit`, `sendMessage`)
- E2E: `tests/e2e/projects.spec.ts` (모든 E2E 는 `tests/e2e/helpers.ts` 의 `openOwnedProject` / `openInvited` 로 접속)

## 남은 일
- 로그인한 고객의 참여 기록(멤버십), 프로젝트 삭제 시 방 데이터·에셋 정리
