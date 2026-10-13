# 테스트 주도 개발

## 요약
사용자 요청(2026-10-13)에 따라 모든 기능과 버그 수정은 TDD로 진행합니다.

## 절차
1. 🔴 **실패하는 테스트를 먼저** 작성하고, 실패하는 것을 실행해서 확인합니다.
2. 🟢 테스트를 통과시키는 최소 구현을 합니다.
3. 리팩터링합니다. 테스트는 계속 통과해야 합니다.
- 버그는 **재현 테스트부터** 씁니다.
- DOM·Canvas·WebGL에 의존하는 코드는 계산 부분을 순수 함수로 분리해 단위 테스트합니다 (예: `channelGeometry`, `ellipseInQuad`, `layoutList`).
- 테스트가 틀렸다면(기대값이 잘못됨) 테스트를 고치되, 왜 고쳤는지 설명합니다.

## 테스트 종류와 명령

| 종류 | 위치 | 실행 | 환경 |
|---|---|---|---|
| 앱 단위 | `tests/unit/` | `npm test` (`npm run test:watch`) | Vitest, node |
| 앱 E2E | `tests/e2e/` | `npm run e2e` | Playwright + 시스템 Chrome. 개발 서버(5199)와 동기화 서버(`wrangler dev`, 8787)를 자동 실행 |
| 서버 | `server/test/` | `cd server && npm test` | Workers 런타임 (`@cloudflare/vitest-plugin`) |
| 타입 | | `npm run check` | svelte-check |

## E2E 작성 규칙
- 테스트마다 `?room=e2e-<무작위>`로 문서를 분리합니다. 협업 테스트는 브라우저 컨텍스트 두 개를 같은 방에 접속시킵니다(`tests/e2e/realtime.spec.ts`).
- 요소는 `data-testid`로 찾습니다.
- 테스트 사진은 `tests/e2e/helpers.ts`의 `makePhoto`(1600×1000 정면 사진)를 씁니다. 원근 검증이 필요하면 `src/lib/sim/sample.ts`의 합성 사진을 씁니다.

## 완료 기준
- `npm test`, `npm run e2e`, `npm run check`, `cd server && npm test`가 모두 통과
- 화면 변경은 실제 브라우저 스크린샷으로 한 번 확인
- 관련 `docs/` 문서 갱신
