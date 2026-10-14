# 간판다 문서

간판다(ganpanda)의 제품·설계·기능·서버·개발 문서입니다. 사람과 Claude가 모두 참조합니다.
**코드가 바뀌면 같은 커밋에서 관련 문서도 고칩니다.**

## 구성

| 폴더 | 내용 | 언제 읽나 |
|---|---|---|
| [`product/`](product/) | 제품 비전, 로드맵, 요금제, 결정 기록 | 무엇을 왜 만드는지 판단할 때 |
| [`architecture/`](architecture/) | 전체 구조, 데이터 모델, 좌표·단위, 동기화 | 여러 모듈에 걸친 변경 전 |
| [`features/`](features/) | 기능별 동작 규칙과 관련 코드 | 해당 기능을 고치거나 확장할 때 |
| [`server/`](server/) | API, 서버 내부 구조, 배포 | `server/` 작업 시 |
| [`dev/`](dev/) | TDD 절차, 테스트, 코드 규칙 | 모든 개발 작업 전 |

## 문서 목록

- product
  - [vision.md](product/vision.md) — 제품 개념, 세 개의 무한 캔버스, AI 최소화 원칙
  - [roadmap.md](product/roadmap.md) — 1~5차 개발 단계와 진행 상태
  - [pricing.md](product/pricing.md) — 요금제(무료·스타터·프로)와 제한 규칙
  - [decisions.md](product/decisions.md) — 사용자와 합의한 결정 기록 (날짜순)
- architecture
  - [overview.md](architecture/overview.md) — 앱·서버 구성, 폴더 구조, 데이터 흐름
  - [data-model.md](architecture/data-model.md) — Yjs 프로젝트 문서 스키마
  - [coordinates.md](architecture/coordinates.md) — 좌표계와 단위(px, mm, world)
  - [sync.md](architecture/sync.md) — 실시간 동기화·오프라인·에셋 저장 방식
- features
  - [photo-board.md](features/photo-board.md) — 사진 보드, 영역 그리기
  - [shortcuts.md](features/shortcuts.md) — 화면 조작(xlpop과 동일)과 단축키 설정
  - [measurement.md](features/measurement.md) — 카메라 설정(축 선·원점·기준 길이), 실측 판독과 경고 규칙
  - [sign-list-quote.md](features/sign-list-quote.md) — 사인물 리스트(전개도)와 견적
  - [communication.md](features/communication.md) — 오브젝트별 대화·코멘트
  - [accounts.md](features/accounts.md) — 이메일 매직링크 로그인, 계정 메뉴
  - [projects-invites.md](features/projects-invites.md) — 프로젝트 소유, 초대 링크 역할(owner/editor/viewer)
  - [auto-segment.md](features/auto-segment.md) — AI 자동 분리(SlimSAM), 모델 호스팅, 마스크→다각형
  - [uv-view.md](features/uv-view.md) — 디자인 소스 매핑 (계획)
  - [render-3d.md](features/render-3d.md) — 입체 간판(4차)·실사 보기(5차, 사진 속 합성)
- server
  - [api.md](server/api.md) — HTTP·WebSocket API 명세
  - [internals.md](server/internals.md) — Durable Object, 저장, 압축, 접속자 표시
  - [deploy.md](server/deploy.md) — 로컬 실행과 배포
- dev
  - [tdd.md](dev/tdd.md) — 테스트 주도 개발 절차와 명령
  - [conventions.md](dev/conventions.md) — 코드·문서 작성 규칙

## 문서 작성 규칙

각 문서는 아래 순서를 따릅니다. 해당 없는 항목은 생략합니다.

1. **요약** — 2~3줄
2. **상태** — `구현됨` / `일부 구현` / `계획`
3. **규칙·동작** — 코드가 지켜야 하는 것
4. **관련 코드** — 경로 (`src/lib/core/measure.ts` 처럼)
5. **관련 테스트**
6. **남은 일 / 알려진 한계**

- 결정이 바뀌면 [decisions.md](product/decisions.md)에 새 항목을 추가합니다. 이전 항목은 지우지 않고 "대체됨"으로 표시합니다.
- 계획 단계의 내용은 "계획"이라고 분명히 적어, 구현된 것처럼 읽히지 않게 합니다.
- 숫자(단가, 한도, 허용 오차)는 코드의 상수 이름과 함께 적어 둡니다.
