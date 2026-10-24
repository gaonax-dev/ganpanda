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
  - [pricing.md](product/pricing.md) — 요금제(무료·베이직·프로)와 제한 규칙 — 고객 열람은 인원에 세지 않음
  - [decisions.md](product/decisions.md) — 사용자와 합의한 결정 기록 (날짜순)
  - [supplier-alida.md](product/supplier-alida.md) — 공급업체 알리다솔루션 단가표(2025년 3월 1호) 범위·해석·빠진 것
  - [supplier-hanwool.md](product/supplier-hanwool.md) — 발주처 한울상사 조사, 조합형 주문 구조, 3D 모델링 필요 요소, 품목 코드
- architecture
  - [overview.md](architecture/overview.md) — 앱·서버 구성, 폴더 구조, 데이터 흐름
  - [data-model.md](architecture/data-model.md) — Yjs 프로젝트 문서 스키마
  - [coordinates.md](architecture/coordinates.md) — 좌표계와 단위(px, mm, world)
  - [sync.md](architecture/sync.md) — 실시간 동기화·오프라인·에셋 저장 방식
  - [composition-layers.md](architecture/composition-layers.md) — 조합형 사인물의 레이어 구조: 컴포넌트 레지스트리(0단계 구현됨)·레이어 트리(1단계) (2026-10-18 결정)
- features
  - [photo-board.md](features/photo-board.md) — 사진 보드, 영역 그리기
  - [shortcuts.md](features/shortcuts.md) — 화면 조작(xlpop과 동일)과 단축키 설정
  - [measurement.md](features/measurement.md) — 카메라 설정(축 선·원점·기준 길이), 실측 판독과 경고 규칙
  - [sign-list-quote.md](features/sign-list-quote.md) — 사인물 리스트(전개도)와 견적
  - [supplier-prices.md](features/supplier-prices.md) — 공급 단가표(한울 꼬리표)와 내 단가표 연결, 업로드·API 형식
  - [order.md](features/order.md) — 주문 사양 옵션(스키마), 주문 정보, 주문서·JSON
  - [spec-vocabulary.md](features/spec-vocabulary.md) — 사양 글 사전: 못 알아본 글을 묻고 배우기, 개인 > 지역 > 전국 우선순위, 이의 (2026-10-18 설계)
  - [patent-bubble.md](product/patent-bubble.md) — 말풍선(지점·영역 지정 소통, 받는 사람, 마지막 상태) 특허 준비 자료 (발명 설명·청구항 초안·일정)
  - [color-library.md](features/color-library.md) — 색 라이브러리: 컬러 카드(페인트·시트·천·필름 + 이름·hex·공급사·코드), 계정 저장, 색 피커·사양 글에서 선택
  - [composition.md](features/composition.md) — 조합형 사인물: 간판 프레임 + 구성 요소(채널·스카시·시트) + 글자·그림 객체, 단계별 계획
  - [material-stack.md](features/material-stack.md) — 재료 조합 사인물: 2.5D 단면 쌓기(아래 접이 속성)·재료 카드·레시피 라이브러리 (설계, 2026-10-22)
  - [channel-library.md](features/channel-library.md) — 채널 라이브러리: 15종 사진으로 빠른 선택 → 세부는 편집기에서 (구현됨, 2026-10-23)
  - [sign-templates.md](features/sign-templates.md) — 완성품 퀵: 간판 → 완성품 사진 → 바꿀 칸(색 → 글자) 하나씩, 멈추면 거기까지 완성 (구현됨, 2026-10-23)
  - [confirm.md](features/confirm.md) — 컨펌: 표시 없는 사진보드(사인물·디자인이 사진 위에)·진행 동의 → 제작·완료 사진첩·참고 이미지(고객 AI 이미지) (설계, 2026-10-22)
  - [proposal.md](features/proposal.md) — 제안 링크(실사·치수·금액·질문)와 승인·재승인 (6차)
  - [requests.md](features/requests.md) — 요청판(9차): 고객 견적 요청 → 지역 간판사 → 제안 링크, 홍보자 코드
  - [communication.md](features/communication.md) — 톡(방별 대화·사인물 링크), 오브젝트별 대화·코멘트, 말풍선(숫자)
  - [accounts.md](features/accounts.md) — 이메일 매직링크 로그인, 계정 메뉴
  - [projects-invites.md](features/projects-invites.md) — 프로젝트 소유, 초대 링크 역할(owner/editor/viewer)
  - [auto-segment.md](features/auto-segment.md) — AI 자동 분리(SlimSAM), 모델 호스팅, 마스크→다각형
  - [uv-view.md](features/uv-view.md) — 디자인 소스 매핑 (계획)
  - [render-3d.md](features/render-3d.md) — 입체 간판(4차)·실사 보기(5차, 사진 속 합성)
- server
  - [api.md](server/api.md) — HTTP·WebSocket API 명세
  - [internals.md](server/internals.md) — Durable Object, 저장, 압축, 접속자 표시
  - [deploy.md](server/deploy.md) — 로컬 실행과 배포
  - [backup.md](server/backup.md) — 백업(매시간, 백업 버킷)·운영자 복원 절차·시험 복원 (2026-10-21)
- dev
  - [tdd.md](dev/tdd.md) — 테스트 주도 개발 절차와 명령
  - [conventions.md](dev/conventions.md) — 코드·문서 작성 규칙
  - [app.md](dev/app.md) — 데스크톱·모바일 앱 (Tauri 2): 방식·명령·준비물

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
