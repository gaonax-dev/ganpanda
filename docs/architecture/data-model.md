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
| `pins` | `Y.Map<id, Y.Map>` | 사진 위 위치 코멘트(핀) |
| `sources` | `Y.Map<id, Y.Map>` | 디자인 소스(파일 + 페이지 이미지) → [uv-view.md](../features/uv-view.md) |
| `settings` | `Y.Map<키, JSON>` | 단가표(`prices`), 설치비(`installFee`), 추가 항목(`extras`) — [sign-list-quote.md](../features/sign-list-quote.md) |
| `messages` | `Y.Array<Message>` | 모든 사인물·핀의 대화·코멘트 (`objectId` = 사인물 또는 핀 id) |

### Photo
| 필드 | 설명 |
|---|---|
| `id`, `name` | |
| `assetId` | 이미지 에셋 ID (내용 SHA-256 앞 16바이트 hex) |
| `w`, `h` | 원본 픽셀 크기 |
| `x`, `y`, `width` | 사진 보드(world) 위 위치와 표시 폭 |

### SignObject
| 필드 | 설명 |
|---|---|
| `id`, `photoId`, `name`, `createdAt` | |
| `shape` | `rect` / `ellipse` / `polygon` |
| `quad` | 외곽 사각 영역 4점 (좌상, 우상, 우하, 좌하), **사진 원본 px**. 원근 반영 |
| `polygon?` | `shape = polygon`일 때 윤곽 (사진 px) |
| `widthMm?`, `heightMm?` | 사용자가 입력한 실제 치수 |
| `productId?` | 간판 종류 (`catalog.ts`의 보드·채널) |
| `sheetIds` | 시트 종류 (복수) |
| `text?` | 간판 문구 (채널 글자수 자동 산출, 견적서 표기) |
| `charCount?` | 채널 글자수 (수동, 문구보다 우선) |
| `refH?`, `refV?` | 실측 기준선: 가로(위·아래 변) / 세로(좌·우 변) |
| `letter3d?` | 입체 설정 `{depthMm, faceColor, sideColor, letterSpacing}` |
| `design?` | 입힌 디자인 `{sourceId, page, crop}` (페이지 px) |
| `designHistory?` | 디자인 변경 이력 (최신이 앞, 최대 20) |
| `listX?`, `listY?` | 사인물 리스트 전개도 위 위치 (mm). 없으면 자동 배치 |

### Pin
`{ id, photoId, x, y(사진 px), author, createdAt, resolved, number(사진 안 순번) }`

### 계정 쪽 (D1, 문서 아님)
`accounts`, `sessions`, `login_tokens`, `projects`, `invites`, `account_assets`, `identities`(공급자 계정 연결), `oauth_states` → `server/migrations/`

### Message
`{ id, objectId, author, text, kind: 'chat' | 'comment', ts }`

## 규칙
- **엔티티 하나 = 중첩 `Y.Map`**. 필드 단위로 병합되어, 두 사람이 같은 오브젝트의 다른 필드를 동시에 고쳐도 둘 다 남습니다. 엔티티를 JSON 하나로 통째로 저장하면 안 됩니다.
- **대화는 공유 `Y.Array` 하나**. 오브젝트별 배열을 따로 만들면, 두 사람이 동시에 첫 메시지를 보낼 때 배열이 두 번 생성되어 한쪽 메시지가 사라집니다. (테스트로 확인된 버그)
- 사진을 지우면 그 사진의 오브젝트·핀과 대화도 함께 지웁니다 (`removePhoto`). 사인물·핀을 지우면 그 대화도 지웁니다.
- 오브젝트 정렬: `createdAt`, 같으면 `id`.
- 이미지 바이트는 문서에 넣지 않습니다. 문서에는 `assetId`만 두고, 바이트는 에셋 저장소에 둡니다.

## 관련 테스트
- `tests/unit/project.test.ts` (동시 편집 수렴 포함)
