# 데이터 모델 (Yjs 프로젝트 문서)

## 요약
프로젝트 하나 = Yjs 문서 하나(`Y.Doc`)입니다. 오프라인 편집과 실시간 협업이 같은 모델로 동작합니다.

## 상태
구현됨 — `src/lib/core/model.ts`, `src/lib/core/project.ts`

## 문서 구조

| 최상위 키 | 타입 | 내용 |
|---|---|---|
| `photos` | `Y.Map<id, Y.Map>` | 사진(구역) |
| `objects` | `Y.Map<id, Y.Map>` | 사인물 오브젝트 |
| `pins` | `Y.Map<id, Y.Map>` | 사진 위 위치 코멘트(말풍선, 옛 핀). `to` = 받는 사람 이름(없으면 모두, 2026-10-17), `bx`·`by` = 풍선 몸통 오프셋(사진 px, 2026-10-18) |
| `sources` | `Y.Map<id, Y.Map>` | 디자인 소스(파일 + 페이지 이미지) → [uv-view.md](../features/uv-view.md) |
| `settings` | `Y.Map<키, JSON>` | 단가표(`prices`), 설치비(`installFee`), 추가 항목(`extras`), 주문 정보(`order`), 제안(`proposal`: 실사 에셋·해시·한마디), 승인 기록(`approvals[]`: 이름·시각·해시·스냅샷, 서버가 추가) — [sign-list-quote.md](../features/sign-list-quote.md), [order.md](../features/order.md), [proposal.md](../features/proposal.md) |
| `messages` | `Y.Array<Message>` | 모든 사인물·핀의 대화·코멘트 (`objectId` = 사인물 또는 핀 id) |

### Photo
| 필드 | 설명 |
|---|---|
| `id`, `name` | |
| `assetId` | 이미지 에셋 ID (내용 SHA-256 앞 16바이트 hex) |
| `w`, `h` | 원본 픽셀 크기 |
| `x`, `y`, `width` | 사진 보드(world) 위 위치와 표시 폭 |
| `zones?` | 작업 존 다각형들 (사진 px) |
| `camera?` | **카메라 설정** `{x, y, z?, origin, ref?, principal?}` — 축 선 두 쌍·원점·기준 길이 → 벽면 평면 (`core/camera.ts`). 사인물과 무관 → [../features/measurement.md](../features/measurement.md) |

### SignObject
| 필드 | 설명 |
|---|---|
| `id`, `photoId`, `name`, `createdAt` | `photoId: ''` = 사진 없이 보드에 직접 만든 사인물(2026-10-15, `quad: []`) |
| `shape` | `rect` / `ellipse`(옛 형식, 새 원형은 rect + corner) / `polygon` |
| `quad` | 외곽 사각 영역 4점 (좌상, 우상, 우하, 좌하), **사진 원본 px**. 원근 반영 |
| `polygon?` | `shape = polygon`일 때 윤곽 (사진 px) |
| `corner?` | 사각형 모서리 둥글기 (짧은 변 대비 반지름 비율 0~0.5, 0.5 = 원·알약). 원형 도구가 0.5 로 만듦. 규격 필드(연결 시 원본 것) |
| `turn?` | 벽에서 돌려 세움 `{deg 0~90, hinge left\|right}` (사진마다의 배치, quad 는 그 투영) |
| `widthMm?`, `heightMm?` | 사용자가 입력한 실제 치수 |
| `productId?` | 간판 종류 (`catalog.ts`의 보드·채널) |
| `sheetIds` | 시트 종류 (복수) |
| `text?` | 간판 문구 (채널 글자수 자동 산출, 견적서 표기) |
| `charCount?` | 채널 글자수 (수동, 문구보다 우선) |
| `letter3d?` | 입체 설정 `{depthMm, faceColor, sideColor, letterSpacing}` |
| `design?` | 입힌 디자인 `{sourceId, page, crop}` (페이지 px) |
| `designHistory?` | 디자인 변경 이력 (최신이 앞, 최대 20) |
| `listX?`, `listY?` | 평면도 위치 (mm) — 리스트 뷰와 보드 평면 구역이 같은 배치를 씀. 없으면 자동 배치 |
| `depthMm?` | 보드 두께·돌출 깊이 (규격 필드) |
| `options?` | 주문 사양 옵션 (`core/options.ts` 스키마 키 → 값). 규격 필드 → [../features/order.md](../features/order.md) |
| `note?` | 사인물별 요청사항 (규격 필드) |
| `parts?` | 조합형 구성 요소(채널·스카시·시트 + 글자·그림·**도형**(`kind: 'shape'`, `shape` rect/ellipse/line, `fill?`·`stroke?` — 2026-10-18 2단계), 간판 중심 기준 mm; `on` = 올린 곳). 2026-10-18 부터 `layers` 의 **거울**(펼친 형식) → `core/parts.ts`, [../features/composition.md](../features/composition.md) |
| `layers?` | **레이어 트리**(2026-10-18 레이어 구조 1단계): 프레임(= 사인물 자체)의 자식들 `Layer{id, kind, spec, box(부모 중심 기준 mm), children, visible?, locked?, opacity?, face?}`. 시트는 올린 것의 자식, 글자·그림은 구성 요소의 자식. `parts` 와 함께 저장하고 둘이 같을 때만 트리를 믿는다 → `core/layers.ts`, [composition-layers.md](composition-layers.md) |
| `sameAs?` | **다른 사진의 같은 사인물**(원본 id). 연결된 영역은 규격을 원본에서 읽고 위치만 자기 것 → `core/link.ts` |

### Pin
`{ id, photoId, x, y(사진 px), author, createdAt, resolved, number(사진 안 순번) }`

### 계정 쪽 (D1, 문서 아님)
`accounts`, `sessions`, `login_tokens`, `projects`, `invites`, `account_assets`, `identities`(공급자 계정 연결), `oauth_states`, `spec_samples`(퀵입력이 못 알아본 글 표본, 2026-10-18), `spec_rules`(사양 글 개인 사전, 2026-10-18), `accounts.sets`(세트 라이브러리 JSON, 2026-10-19) → `server/migrations/`, [../features/spec-vocabulary.md](../features/spec-vocabulary.md)

### Message
`{ id, objectId, author, text, kind: 'chat' | 'comment' | 'approval' | 'voice', ts, attachments? }` — `approval` 은 서버가 승인 때 남기는 알림(`objectId: 'project'`), `voice` 는 음성 메모(2026-10-18, 말풍선 창에 안 나옴 → [features/communication.md](../features/communication.md))

## 규칙
- **엔티티 하나 = 중첩 `Y.Map`**. 필드 단위로 병합되어, 두 사람이 같은 오브젝트의 다른 필드를 동시에 고쳐도 둘 다 남습니다. 엔티티를 JSON 하나로 통째로 저장하면 안 됩니다.
- **대화는 공유 `Y.Array` 하나**. 오브젝트별 배열을 따로 만들면, 두 사람이 동시에 첫 메시지를 보낼 때 배열이 두 번 생성되어 한쪽 메시지가 사라집니다. (테스트로 확인된 버그)
- 사진을 지우면 그 사진의 오브젝트·핀과 대화도 함께 지웁니다 (`removePhoto`). 사인물·핀을 지우면 그 대화도 지웁니다.
- 오브젝트 정렬: `createdAt`, 같으면 `id`.
- **같은 사인물 연결** (`sameAs`, 2026-10-14): 규격 필드(`SPEC_FIELDS` = name·productId·sheetIds·widthMm·heightMm·text·charCount·letter3d·design·designHistory·listX·listY·corner·options·note)는 원본에서 읽고, 위치 필드(photoId·quad·shape·polygon)는 자기 것. `updateObject` 가 규격 변경을 원본으로 보냅니다. 연결된 영역에 연결하면 그 원본으로(사슬 없음). 해제하면 그 시점 규격을 복사해 독립. 원본을 지우면 첫 연결 영역이 승계(규격·대화·나머지 연결). 원본이 없는 연결은 독립 영역으로 봅니다(`resolveLinks`). 대화는 원본 id 로만 쌓입니다.
- 이미지 바이트는 문서에 넣지 않습니다. 문서에는 `assetId`만 두고, 바이트는 에셋 저장소에 둡니다.

## 관련 테스트
- `tests/unit/project.test.ts` (동시 편집 수렴 포함)
