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
| `viewer` | 초대 링크(보기·대화만) | 보기, 대화·코멘트. 문서 편집은 서버가 버림 |

- **등록되지 않은 방은 접속 거부(404)**. 세션도 초대 토큰도 없으면 401, 다른 프로젝트의 토큰이면 403.
- 초대 링크 형식: `https://ganpanda.co.kr/?room=<프로젝트ID>&invite=<토큰>`. 토큰은 서버에 해시로만 저장. 소유자가 폐기하면 즉시 무효.
- viewer의 대화는 Yjs 업데이트가 아니라 `POST /api/rooms/:id/messages`로 보내고 서버가 문서에 추가합니다(편집 차단과 대화 허용을 함께 만족).

## 앱 동작
- **홈(`/`)**: 로그인하면 내 프로젝트 목록 + 새 프로젝트 만들기(만들면 `?room=<id>`로 이동). 로그인 전에는 안내와 로그인 버튼. 서버 주소가 없는 빌드(오프라인·Tauri)는 예전처럼 `local-default` 방으로 바로 들어갑니다.
- **방 진입(`?room=`)**: 먼저 `GET /api/projects/:id/access`로 역할을 확인하고, 허용될 때만 문서 저장·동기화를 시작합니다. 거부되면 안내 화면(존재하지 않음 / 초대 링크 필요 / 권한 없음).
- **초대 링크로 진입(`?room=&invite=`)**: 토큰을 `localStorage`의 `ganpanda.invite.<room>`에 저장하고 주소에서 지웁니다. 새로고침해도 유지됩니다.
- **상단 바**: 프로젝트 이름, 역할 배지(소유자 / 편집 / 보기·대화), 소유자에게는 [초대 링크] 버튼(역할 선택 → 링크 복사 → 목록·폐기). 로고를 누르면 홈.
- **viewer 화면**: 그리기 도구·사진 추가 없음("보기·대화만 가능"), 영역 이동·모서리·삭제 불가, 패널 입력칸 비활성, 전개도 위치 이동 불가. 대화·코멘트는 `POST /api/rooms/:id/messages`로 보냅니다(`app.sendMessage`).
- **표시 이름 우선순위**: 계정 이름 > 기기에 정한 이름 > 이메일 앞부분.

## 프로젝트 그룹 · 상태 · 정산 (2026-10-15)
사용자: "프로젝트 그룹을 만들 수 있게 해 주고 계산서를 그룹에서 한번에 볼 수 있게, 세부사항은 프로젝트 리스트 뷰로, 상태 표시도 대기·진행중·완료, 정산 상태도 받은 금액/계약 금액으로 하고 다 받으면 총금액만 보이게. 해당 내역은 오너는 기본으로, 멤버는 오너가 설정해 준다."
- **홈**(`Home.svelte`): [그룹 만들기](`new-group-name/-submit`) → 그룹 카드(`group`)에 프로젝트 표: 이름(링크 `?room=&view=list` → 바로 **리스트 뷰(견적 세부)**), **상태**(`project-status`: 대기/진행중/완료, 오너만 바꿈), **정산**(`settle`: "받은 / 계약", 다 받으면 **"총 {계약}"** 만, 오너는 `paid-amount`/`contract-amount` 입력) + **계산서 합계**(`group-totals`: 건수, 미수, 받은/계약 또는 총). 그룹 없는 프로젝트 목록에는 [그룹에 넣기…](`project-group`). 그룹 삭제는 프로젝트를 남기고 그룹만 지움.
- **멤버**: 오너가 가입된 계정의 **이메일**로 추가(`member-email/-add`). 멤버는 그룹·프로젝트·상태를 보고, **정산 금액은 오너가 "정산 보기"(`member-billing`)를 켜 준 멤버만** 봅니다(서버가 금액을 빼고 보냄). 상태·금액·멤버 관리는 오너만. 멤버는 프로젝트를 여는 권한과는 별개(열려면 초대 링크).
- 데이터: D1 `groups`, `group_members(can_billing)`, `projects.group_id/status/contract_amount/paid_amount` (`server/migrations/0006_groups.sql`). API → [../server/api.md](../server/api.md). 테스트: `server/test/groups.test.ts`, `tests/e2e/groups.spec.ts`.
- `?view=list|board|uv` 로 들어가면 그 뷰로 시작(`app.view`).

## 새 배포 안내 (2026-10-15)
오래 열어 둔 탭이 옛 코드로 계속 동작해 "배포했는데 그대로"가 되던 문제. 운영 빌드에서 탭이 다시 보일 때·포커스 때(최대 1분에 한 번, 시작 30초 뒤 한 번) 서버 `index.html` 의 번들 이름(`/assets/index-<hash>.js`)과 실행 중인 번들을 비교(`core/version.ts`)해 다르면 상단 배너 `update-available` "새 버전이 배포되었습니다 [새로고침]". 개발 서버에서는 번들 이름이 없어 동작하지 않음. 단위 테스트 `tests/unit/version.test.ts`.

## API
→ [../server/api.md](../server/api.md) 프로젝트·초대 절

## 관련 코드·테스트
- 서버: `server/src/projects.ts`, `server/migrations/0002_projects.sql`, `server/test/projects.test.ts`
- 앱: `src/lib/projects.ts`(API), `src/lib/ui/Home.svelte`, `AccessDenied.svelte`, `InviteDialog.svelte`, `src/lib/state.svelte.ts`(`initRoom`, `canEdit`, `sendMessage`)
- E2E: `tests/e2e/projects.spec.ts` (모든 E2E 는 `tests/e2e/helpers.ts` 의 `openOwnedProject` / `openInvited` 로 접속)

## 남은 일
- 로그인한 고객의 참여 기록(멤버십), 프로젝트 삭제 시 방 데이터·에셋 정리
