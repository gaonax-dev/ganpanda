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
- **상태 바꾸기·지난 프로젝트**(2026-10-21 사용자: "첫화면 리스트 아래에 폴딩으로 가린 정지, 완료 해당 일자가 6개월이 지난 프로젝트는 다시 연도별 폴딩 / 선택 후 나오는 메뉴에 상태변경 진행,정지, 완료 추가"): 상태는 **대기 · 진행중 · 정지(`paused`, 새로) · 완료**. 선택 탭에 **[진행] [정지] [완료]**(`bar-status-ongoing/paused/done`) — 고른 프로젝트를 한 번에. 서버는 상태가 **바뀔 때** `status_at`(상태가 된 시각)을 찍는다(`0019_status_at.sql`, 응답 `statusAt`; 개발 모드에서는 PATCH 에 `statusAt` 을 넣어 옛 날짜 흉내). 홈의 그룹 밖 카드 중 **정지·완료가 된 날이 6개월(달력) 넘게 지난 것**은 목록 아래 **"지난 프로젝트"** 접힘(`shelf`, `<details>`)으로 내려가고, 그 안에서 **연도별 접힘**(`shelf-year`, 최근 연도 먼저). 진행·대기는 오래돼도 보인다. 상태 시각이 없는 옛 데이터는 만든 날로. 카드 날짜는 정지·완료면 그날, 아니면 만든 날. 판단은 `core/projectShelf.ts`(`tests/unit/projectShelf.test.ts`), 화면은 `tests/e2e/projectShelf.spec.ts`.
- **카드 글자·만들기 폼·상세 내역**(2026-10-21 사용자: "프로젝트 카드는 실측 안내 없이 숫자만 날짜는 D-day 표시로 -숫자 지나면 +숫자 (그룹도) / 만들기 입력필드가 포커싱되면 하단에 연락처, 주소, 계약일, 시작일, 완료일, 메모 마지막에 x마크가 주루룩 나오고 제목빼고 다옵션 / 카드 하단글자부근 클릭은 상세내역 나머지는 프로젝트 오픈"):
  - **카드 아래 글자**(`project-meta`) = 상태 이름 · **실측 숫자만**(`project-count`: 미측정/전체 `1/3`, 다 재면 전체 수 `3`; 색 = 대기 회색·실측중 노랑·완료 초록, 마우스를 올리면 뜻) · **D-day**(`project-dday`, `core/dday.ts`): 기준일 = 완료일 → 시작일 → 계약일 → 정지·완료한 날 → 만든 날(그 뒤로 며칠), 앞이면 `D-3`, 오늘 `D-day`, 지났으면 `D+5`(주황). **그룹 카드**(`group-dday`)는 안의 프로젝트 중 앞으로 올 기준일 가운데 가장 가까운 것(다 지났으면 가장 최근에 지난 것, 없으면 그룹 만든 날).
  - **속성창**(2026-10-21 "카드 오른쪽끝에 상단에 매뉴버튼으로 속성창 열리고 수정 토글버튼으로 수정. 수정전 상태에는 전화걸기복사, 카톡, 주소복사 내용 없으면 안보이게"): 카드 오른쪽 위 **⋯**(`project-menu`) → `project-details`(`data-mode` view/edit). **보기**: 상태·실측, 연락처 줄(`details-contact-row`: [전화](`tel:`) [복사] [카톡] — 카톡은 번호로 대화를 여는 공개 주소가 없어 **번호를 복사하고 휴대폰이면 카카오톡을 연다**, PC 는 안내만), 주소 줄([복사]), 날짜(계약·시작·완료 + D-day), 메모 — **내용이 없는 줄은 안 보인다**. [수정](`details-edit`) 토글 → 입력 폼(이름·상태·연락처·주소·계약일·시작일·완료일·메모, [저장] `details-save` → 보기로 돌아감). 카드의 나머지를 누르면 프로젝트 열기, 선택 모드에서는 고르기(⋯ 없음). (처음엔 아래 글자 클릭이었음 → 대체)
  - **만들기 폼**(`new-project-form`): 이름 칸에 포커스하면 아래로 **연락처·주소·계약일·시작일·완료일·메모**(`new-contact/-address/-contract-date/-start-date/-due-date/-memo`)와 **✕**(`new-project-close`, 접고 선택 항목 지움)가 펼쳐진다(`new-project-details`). 제목만 필수. 서버 `POST /api/projects` 에 같이 보내고(`ProjectDetails`), 날짜는 `YYYY-MM-DD`(빈 값 = 없음), 글 길이 연락처 80·주소 200·메모 2000. `0021_project_details.sql`.
  - 테스트 `tests/unit/dday.test.ts`, `tests/e2e/projectCard.spec.ts`.
- **카드의 실측 상태**(2026-10-21 사용자: "프로젝트 카드에 사인물 사이즈가 입력되면 실측중으로 변경하고 미측정/전체사인물수를 표시해줘 미측정 없으면 실측완료 사인물수 이후 제작중과 완료는 추후에"): 소유자가 프로젝트를 열어 둔 동안 **사인물 수·미측정 수**(원본 사인물, 가로·세로 둘 다 없으면 미측정 — `app.unmeasuredCount`)가 바뀌면 1초 뒤 프로젝트 기록에 저장(`PATCH signTotal/signUnmeasured`, `0020_sign_counts.sql`, `App.svelte`). 카드 글자(`core/measureSummary.ts measureLabel`, `data-measure`): 사인물 없음 → 숫자 없음 / 미측정이 있으면 **`u/N`**(대기 회색·실측중 노랑) / 다 재면 **`N`**(초록) — 이어서 "실측 안내 없이 숫자만"으로 글자 없이 숫자만(위 항목). 저장된 `status` 는 바꾸지 않는다(표시만) — 제작중·완료 단계는 추후. 테스트 `tests/unit/measureSummary.test.ts`, `tests/e2e/measureStatus.spec.ts`.
- **그룹 카드**(`group`, 카드 두 장이 겹친 모양, 이름·개수·미수 또는 총액 `group-summary`): 누르면 **계산서**(`group-bill`)가 펼쳐지고 다시 누르면 접힘(`data-open`). 계산서: 프로젝트(링크 `?room=&view=list` → 리스트 뷰 세부) · **상태**(`project-status` 대기/진행중/정지/완료, 오너만) · **받은 금액 / 계약 금액**(각각 눌러서 입력 `paid`→`paid-input`, `contract`→`contract-input`). **계약 금액은 리스트 뷰 견적 합계가 자동**(`data-auto="true"`, "자동" 표시; 앱이 소유자가 열어 둔 동안 `quoteTotal` 을 1초 디바운스로 저장) — 직접 입력하면 그 금액이 되고 [자동 계산 복구](`contract-auto`)가 나타남. 다 받으면 **"총 {계약}"**(`settle`)만. 합계 줄(`group-totals`: 건수·미수·받은/계약 또는 총). [그룹 삭제](`group-delete`)는 프로젝트를 남김.
- **멤버는 설정에서**(`Settings.svelte` "멤버", 계정 단위 `team-section`): 이메일로 추가(`member-email/-add`). 가입된 이메일이면 바로 멤버, **아직 가입 안 한 이메일이면 가입 링크 메일**(2026-10-24 "맴버는 메일로 가입링크 들어오기로" — `/login?team=`, 7일·1회용, `member-sent`, 목록에 "가입 대기" `member-invite` + [다시 보내기] `member-invite-resend`·취소 `member-invite-cancel`). 링크를 열면 이메일이 정해진 가입 창(`invite-banner` "OO님이 팀 멤버로 초대") — **비밀번호만 정하면 사업자 확인·인증 메일 없이 바로 로그인 + 팀 멤버**(링크를 연 것 = 이메일 확인). 초대 뒤 그 이메일 계정으로 다른 길(카카오·기존 계정)로 로그인해도 자동으로 들어간다(`acceptTeamInvites` — 세션을 만들 때마다). 대기 중 초대도 멤버 한도에 센다. 링크 창의 **[카카오로 팀 들어가기]**(2026-10-24 "해당 링크에 카카오 로그인을 만들면 되지 않나?")는 초대 토큰을 카카오 로그인에 실어(`start?team=`, `oauth_states.team_token` 0037) **카카오 이메일이 달라도** 그 계정을 팀에 넣고, 돌아오면 "OO님의 팀에 들어왔습니다"(`next` 의 `joined=`). **[카카오톡으로 초대]**(`member-kakao`, 2026-10-24 "맴버 초대를 카카오톡으로 할수 있나?" → "진행해줘"): 이메일 없는 링크 초대(`POST /api/me/team/link`, 7일·한 사람, 목록에 "링크 초대 (카카오톡)" — 취소는 초대 id) → 휴대폰은 공유 창(카카오톡 고르기), 데스크톱은 복사(`member-link`·`member-link-note`). 받은 사람은 [카카오로 팀 들어가기](이메일 상관없이 합류)하거나, 이메일을 직접 적어 가입하면 **인증 메일**을 거친다(초대가 그 이메일에 묶이고 인증하면 합류 — 확인 안 된 이메일로 계정을 만들지 않게). 카카오 카드 메시지(JavaScript 키·도메인 등록)와 알림톡은 하지 않음. 데이터 `team_invites`(0036, 링크 초대는 email ''), **정산 보기**(`member-billing`), 제거. 멤버는 오너의 **모든 그룹**과 계산서(상태)를 보고, 정산 금액은 정산 보기를 켠 멤버만(서버가 금액을 빼고 보냄). 상태·금액 변경은 오너만. 프로젝트별·그룹별 멤버 관리는 없음. 프로젝트를 열려면 초대 링크. 정산 보기를 켠 멤버가 편집 초대로 열면 견적의 이익율·손해가 보인다(2026-10-16, [sign-list-quote.md](sign-list-quote.md#원가--이익율-2026-10-16)).
- **설정 "계정 · 구독"**(`account-section`): 이메일, 요금제(`plan`), 저장 용량(`usage-storage`, 막대), 멤버 수(`usage-members`, 소유자 제외 — 2026-10-21 전엔 동시 작업 인원), 이번 달 제안 링크(`usage-proposals`) → [../product/pricing.md](../product/pricing.md). **"견적 요청 받기"**(`requests-section`: 켜기·지역) → [requests.md](requests.md).
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

## 고칠 수 없는 화면 (2026-10-22)
사용자: "인터페이스 권한에 맞게 감추고 필드(잠금)는 텍스트로 조정해줘. 설정의 내용 그리고 사인물 속성등 각 역활에 맞게 정리해줘". 고칠 수 없는 사용자(보기 초대·요청 보드·잠긴 견적 보드 — `!app.canEdit`)의 사인물 패널·설정 창·빠른 막대는 `data-ro` 가 붙고(`ObjectPanel`·`ObjectSettingsDialog`·`QuickBar`), 전역 CSS(`style.css`)가 **잠긴 입력칸을 글자처럼**(테두리·배경·화살표 없음, 빈 칸은 비워 둠) 보이고 **고치는 단추(잠긴 `.btn`·아이콘 단추)는 감춘다**. 고른 상태를 보여 주는 칩·체크는 그대로. 테스트 `tests/e2e/accountKind.spec.ts`.

