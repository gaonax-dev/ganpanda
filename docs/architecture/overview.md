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
│  ├─ lib/sim/             3D 글자·박스 생성, 사진 합성 뷰어(5차용)
│  ├─ lib/state.svelte.ts  앱 전역 상태 (Yjs 문서 ↔ Svelte 반응성)
│  ├─ lib/sync.ts          동기화 서버 연결 (y-websocket, 접속자 상태)
│  ├─ lib/auth.ts          계정 API 클라이언트 (세션 토큰)
│  ├─ lib/projects.ts      프로젝트·초대·방 접근 API 클라이언트
│  ├─ lib/segment/         AI 자동 분리 (워커 + 메인 스레드 래퍼)
│  ├─ lib/design/          디자인 파일 → 페이지 이미지 (pdf.js)
│  └─ lib/assets.ts        이미지 에셋 저장 (IndexedDB + 서버 R2)
├─ server/                 API 서버 (Cloudflare Worker + Durable Object + R2 + D1)
├─ tests/unit/             앱 단위 테스트 (Vitest)
├─ tests/e2e/              앱 E2E 테스트 (Playwright)
└─ docs/                   이 문서
```

## 번들 나누기와 로딩 표시 (2026-10-15 사용자: "화면 로딩 표시해줘, 모바일에서는 무겁다")
- **메인 번들 ≈ 380KB**(전에는 1.28MB): three.js·폰트 파서·렌더링(`sim/`, `render/`, `core/textShapes.ts`)은 **필요할 때 따로 내려받습니다** — 렌더링 창·원근 창·입체 보기·제안 도구는 `App.svelte` 에서 `import()` 로, 보드 3D 단계의 합성기는 `BoardView` 에서 처음 켤 때. `core/letter3d.ts` 는 three 를 쓰지 않도록 폭 계산(`sim/letterWidth.ts`)을 분리. 디자인 PDF 변환(`pdf-*.js`, `pdf.worker`)과 AI 분리 워커도 이미 별도.
- **로딩 표시**: `index.html` 의 정적 스플래시(앱 코드가 내려올 때까지, `main.ts` 가 제거) → 방 확인 "프로젝트 확인 중…" → 문서 "프로젝트 불러오는 중…"(`app.ready` 전) → 무거운 창은 "… 불러오는 중…"(`Loading.svelte`, `data-testid="loading"`). 사진은 `PhotoZone` "불러오는 중…", 3D 단계는 "3D 합성 중…". E2E `tests/e2e/loading.spec.ts`.

## 휴대폰 메모리 (2026-10-15 사용자: "마지막에 죽어버린다. 사진이 많아서인지")
- 휴대폰 사진(12MP)은 풀면 장당 ~48MB. 보드의 사진마다 원본, 그리고 **평면도·리스트 카드마다 원본 전체를 `matrix3d` 로 겹치던 것**(카드 수만큼 큰 GPU 레이어)이 메모리를 넘겨 탭이 죽었습니다.
- **표시용 사진**(`src/lib/photoDisplay.ts` `displayUrl`): 긴 변을 휴대폰 1600 / 그 외 2400px 로 줄인 JPEG 사본(blob URL)을 한 장씩 차례로 만들어 보드에 씁니다. 원본은 렌더링·원근 창·제안 이미지에서만.
- **카드 얼굴**(`faceUrl`, `core/warpPixels.ts`): 사진 영역을 정면 직사각형으로 펼친 작은 그림(보드 카드 긴 변 360px, 리스트 640px)을 만들어 그대로 `<img>` 로. 변형 레이어 없음. 줄인 사진 픽셀은 최근 1장만 들고 있음. **사진 줄이기와 카드 그림은 대기열을 따로** 씁니다(같은 대기열이면 카드 작업이 사진 작업을 기다리며 교착 → 2026-10-15 운영에서 사진이 안 뜸, 롤백 후 수정). 줄이기에 실패하면 원본으로 보이고, 실패는 기억하지 않아 다음에 다시 시도.
- 테스트: `tests/unit/warpPixels.test.ts`, `tests/e2e/memory.spec.ts`(4000×3000 사진 → 표시 ≤ 2400, 카드 얼굴 360px·변형 없음·색 일치).

## 핵심 모듈 (`src/lib/core/`)

| 파일 | 역할 |
|---|---|
| `homography.ts` | 4점 호모그래피, 카메라 포즈 복원, 초점거리·벽 높이 추정 |
| `perspective.ts` | 사각 영역 ↔ 정면 직사각형 변환, CSS `matrix3d`, 원근 속 타원, 다각형 면적 |
| `measure.ts` | 실측 판독 (기준선 보정 또는 자동 기준, 추정, 경고) |
| `camera.ts` | 사진별 카메라 설정 솔버(축 선 두 쌍·원점·기준 길이 → 초점거리·회전·위치·벽면), 축 선 자동 제안(`lines.ts`), 모서리 붙이기 |
| `lines.ts` | 선분 검출(LSD 식)·동일선 병합·RANSAC 소실점·축 선 제안 |
| `calibration.ts` | 벽면 보정 결과(`Calibration`)로 사각 영역 측정, 모서리 붙이기(`snapEdge`) |
| `wallPlane.ts` | 실사 합성용 벽면 좌표계 (px ↔ mm, 카메라 포즈) |
| `render.ts` | 사인물 → 3D 간판 사양 (3D 뷰) |
| `catalog.ts` | 간판·스카시 종류·시트 종류 (이름·단위), 분류 간판/스카시/시트 (`categoryOf`) |
| `optionSchema.ts` | 주문 사양 옵션 **표**(종류별 필드·조건부) — 잎 모듈 (2026-10-18 레이어 구조 0단계) |
| `options.ts` | 옵션을 사인물에 적용하는 함수 (묶음·요약·실제 값·정리) |
| `components/` | **구성 요소 레지스트리**(채널·스카시·시트 모듈: 이름·세부 종류·옵션·단가·구성내역·3D 규칙·층·올릴 곳). 코어·UI·3D 는 종류 이름으로 분기하지 않고 `componentOf(kind)` 만 본다 → [composition-layers.md](composition-layers.md) |
| `charCount.ts` · `priceFormat.ts` · `shapeArea.ts` | 견적·구성 요소가 함께 쓰는 잎 모듈 (글자수·금액 문구·도형 면적) |
| `order.ts` | 주문 정보 형식, 주문 JSON |
| `pricing.ts` | 단가표(기본값·합치기) |
| `quote.ts` | 오브젝트·프로젝트 견적 (단가표·설치비·추가 항목·부가세) |
| `layout.ts` | 전개도 자동 배치 |
| `viewport.ts` | 무한 캔버스 뷰포트 계산 (이동, 확대, 맞춤) |
| `wheel.ts` | 휠 입력 판별 (확대 vs 이동), 플랫폼 판별 |
| `keymap.ts` | 단축키 조합 인식·기본값·충돌 검사 |
| `presence.ts` | 접속자 색·목록 계산 |
| `unread.ts` | 안 읽은 메시지 계산·알림 여부 |
| `format.ts` | 용량 표시 |
| `attachments.ts` | 첨부 종류 판별·요약 |
| `history.ts` | 실행 취소·다시 실행 (내 편집만) |
| `mask.ts` | 분리 마스크 → 다각형, 후보 마스크 선택 |
| `design.ts` | 디자인 영역 정규화, 소스 히스토리, 파일 종류 |
| `letter3d.ts` | 입체 간판 사양·조명·폰트 기준 폭 |
| `zone.ts` | 작업 존 꼭짓점 추가·삭제·가까운 변 |
| `zoneMask.ts` | 존 외곽 사각형, 다각형 래스터화, 마스크 자르기 (AI 분석 범위) |
| `syncUrl.ts` | 동기화 서버 주소 규칙 |
| `model.ts` | 데이터 타입 (Photo, SignObject, Message) |
| `project.ts` | Yjs 프로젝트 문서 조작 |
| `textShapes.ts` | 폰트 글리프 → 도형 (입체 글자용) |

## 데이터 흐름
1. 사용자 조작 → `app.project`(Yjs 문서) 변경
2. Yjs `update` 이벤트 → `app.version` 증가 → `$derived` 값 재계산 → 화면 갱신
3. Yjs 문서는 IndexedDB에 저장 (`y-indexeddb`, 방 이름 `ganpanda-<room>`)
4. 같은 문서를 동기화 서버와 WebSocket으로 주고받음 (서버 주소가 있을 때) → [sync.md](sync.md)

## 관련 문서
- [data-model.md](data-model.md), [coordinates.md](coordinates.md), [sync.md](sync.md), [../server/internals.md](../server/internals.md)
