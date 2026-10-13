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

## API
→ [../server/api.md](../server/api.md) 프로젝트·초대 절

## 관련 코드·테스트
- 서버: `server/src/projects.ts`, `server/migrations/0002_projects.sql`, `server/test/projects.test.ts`
- 앱: `src/lib/projects.ts`(API), `src/lib/ui/Home.svelte`, `AccessDenied.svelte`, `InviteDialog.svelte`, `src/lib/state.svelte.ts`(`initRoom`, `canEdit`, `sendMessage`)
- E2E: `tests/e2e/projects.spec.ts` (모든 E2E 는 `tests/e2e/helpers.ts` 의 `openOwnedProject` / `openInvited` 로 접속)

## 남은 일
- 로그인한 고객의 참여 기록(멤버십), 프로젝트 삭제 시 방 데이터·에셋 정리
