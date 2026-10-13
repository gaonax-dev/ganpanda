# 간판다 (ganpanda) — 사인물 협업·견적 도구

건물 사진 위에 사인물 영역을 지정하고, 실측·종류·시트를 정해 견적까지 뽑는 웹 앱. 이후 Tauri 데스크톱 앱으로 출시.

## 제품 구조 — 세 화면 모두 무한 캔버스 (`src/lib/ui/InfiniteCanvas.svelte` 공용)
1. **사진 보드** (`views/BoardView`, `PhotoZone`): 사진 = 구역. 사각·원형(이후 SAM 다각형) 영역을 그리고, 오브젝트별 치수·종류·시트·코멘트·대화(카톡형)로 소통.
2. **사인물 리스트** (`views/ListView`): 모든 사인물을 원근 보정해 실제 mm 축척 전개도로 배치. 견적은 여기서 산출.
3. **UV 뷰** (`views/UvView`, 예정): 디자인 파일 속 이미지를 골라 사인물 면에 매핑.

## 원칙
- **AI 최소화 / 결정론**: 원근·실측 판독은 호모그래피(`core/homography`, `core/measure`). AI는 SAM 호버 분리(브라우저 내장, 예정)에만.
- **실측 판독 규칙**: 사진마다 가로·세로가 모두 입력된 첫 영역이 "기준 영역". 다른 영역은 기준으로 크기를 추정하고 12% 넘게 어긋나면 경고. 기준이 없으면 단독 비율 검사.
- **문서 = Yjs CRDT** (`core/project`). 엔티티는 중첩 Y.Map(필드 단위 병합), 대화는 공유 Y.Array 하나. 지금은 IndexedDB 저장, 다음 단계에서 실시간 서버(Cloudflare Durable Objects) 연결.
- **단위**: 영역 좌표 = 사진 원본 px, 치수 = mm.
- **서버 비의존 UI**: Tauri 웹뷰에서 동작해야 함(외부 CDN 금지, 폰트 번들).
- 기존 3D 주야간 시뮬레이터는 `src/lib/sim`에 보관(이후 오브젝트 미리보기로 재연결).

## 개발 방식: TDD
1. 실패하는 테스트 → 2. 최소 구현 → 3. 리팩터링. 버그는 재현 테스트부터.
- 순수 로직: `tests/unit` (Vitest). DOM 의존 코드는 순수 함수로 분리해 테스트.
- 사용자 흐름: `tests/e2e` (Playwright, 시스템 Chrome). 테스트마다 `?room=` 로 문서를 분리.

## 명령
- `npm run dev` / `npm test` / `npm run e2e` / `npm run check` / `npm run build`
