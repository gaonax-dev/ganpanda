# 간판다 (ganpanda)

간판 제작자와 고객이 건물 사진 위에서 사인물을 함께 정하고 견적까지 내는 협업 도구입니다. 웹을 먼저 만들고 이후 Tauri 앱으로 출시합니다.

## 문서 — 작업 전 반드시 확인
상세 내용은 모두 `docs/`에 있습니다. **작업 전에 [docs/README.md](docs/README.md)와 작업 영역의 문서를 읽습니다.**

| 작업 | 먼저 읽을 문서 |
|---|---|
| 무엇을 만들지 판단, 범위 결정 | `docs/product/roadmap.md`, `docs/product/decisions.md` |
| 데이터·동기화 변경 | `docs/architecture/data-model.md`, `docs/architecture/sync.md` |
| 원근·치수 관련 | `docs/architecture/coordinates.md`, `docs/features/measurement.md` |
| 특정 기능 | `docs/features/<기능>.md` |
| 서버 | `docs/server/` |
| 모든 개발 | `docs/dev/tdd.md`, `docs/dev/conventions.md` |

## 문서 갱신 규칙
- **코드를 바꾸면 같은 커밋에서 관련 문서도 고칩니다.** 동작·규칙·상수·상태(구현됨/계획)가 코드와 어긋나면 안 됩니다.
- 사용자와 새로 합의한 결정은 `docs/product/decisions.md`에 날짜와 함께 추가합니다. 바뀐 결정은 지우지 않고 "대체됨"으로 표시합니다.
- 새 기능은 `docs/features/`에 문서를 만들고 `docs/README.md` 목록에 추가합니다.
- 단계가 끝나거나 범위가 정해지면 `docs/product/roadmap.md`의 상태를 고칩니다.

## 개발 방식: TDD
실패하는 테스트 → 최소 구현 → 리팩터링. 버그는 재현 테스트부터. 상세 → `docs/dev/tdd.md`

## 명령
- 앱: `npm run dev` / `npm test` / `npm run e2e` / `npm run check` / `npm run build`
- 서버: `cd server && npm run dev` / `npm test` / `npm run types`
