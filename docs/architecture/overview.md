# 전체 구조

## 요약
Svelte 5 앱(화면)과 Cloudflare Worker 서버(API) 두 부분입니다. 같은 저장소에 있고, 따로 배포합니다.

```
ganpanda/
├─ src/                    앱 (Svelte 5 + Vite)
│  ├─ App.svelte           상단 바, 화면 전환, 오브젝트 패널
│  ├─ lib/core/            순수 로직 (DOM 없음, 단위 테스트 대상)
│  ├─ lib/ui/              공용 UI (무한 캔버스, 오브젝트 패널, 대화)
│  ├─ lib/views/           화면 (사진 보드, 사인물 리스트, UV 뷰)
│  ├─ lib/sim/             초기 3D 시뮬레이터 (보관, 4·5차에서 재사용)
│  ├─ lib/state.svelte.ts  앱 전역 상태 (Yjs 문서 ↔ Svelte 반응성)
│  └─ lib/assets.ts        이미지 에셋 저장 (IndexedDB)
├─ server/                 동기화 API 서버 (Cloudflare Worker + Durable Object + R2)
├─ tests/unit/             앱 단위 테스트 (Vitest)
├─ tests/e2e/              앱 E2E 테스트 (Playwright)
└─ docs/                   이 문서
```

## 핵심 모듈 (`src/lib/core/`)

| 파일 | 역할 |
|---|---|
| `homography.ts` | 4점 호모그래피, 카메라 포즈 복원, 초점거리·벽 높이 추정 |
| `perspective.ts` | 사각 영역 ↔ 정면 직사각형 변환, CSS `matrix3d`, 원근 속 타원, 다각형 면적 |
| `measure.ts` | 실측 판독 (기준 영역, 추정, 경고) |
| `catalog.ts` | 간판 종류·시트 종류와 예시 단가 |
| `quote.ts` | 오브젝트·프로젝트 견적 |
| `layout.ts` | 전개도 자동 배치 |
| `viewport.ts` | 무한 캔버스 뷰포트 계산 (이동, 확대, 맞춤) |
| `wheel.ts` | 휠 입력 판별 (확대 vs 이동), 플랫폼 판별 |
| `keymap.ts` | 단축키 조합 인식·기본값·충돌 검사 |
| `model.ts` | 데이터 타입 (Photo, SignObject, Message) |
| `project.ts` | Yjs 프로젝트 문서 조작 |
| `textShapes.ts` | 폰트 글리프 → 도형 (입체 글자용) |

## 데이터 흐름
1. 사용자 조작 → `app.project`(Yjs 문서) 변경
2. Yjs `update` 이벤트 → `app.version` 증가 → `$derived` 값 재계산 → 화면 갱신
3. Yjs 문서는 IndexedDB에 저장 (`y-indexeddb`, 방 이름 `ganpanda-<room>`)
4. (1차 예정) 같은 문서를 동기화 서버와 WebSocket으로 주고받음 → [sync.md](sync.md)

## 관련 문서
- [data-model.md](data-model.md), [coordinates.md](coordinates.md), [sync.md](sync.md), [../server/internals.md](../server/internals.md)
