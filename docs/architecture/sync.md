# 동기화와 저장

## 요약
프로젝트 문서는 기기(IndexedDB)에 항상 저장되고, 서버가 연결되면 실시간으로 합쳐집니다. 이미지는 문서와 따로, 내용 해시를 키로 저장합니다.

## 상태
- 기기 저장: 구현됨 (`y-indexeddb`, `src/lib/assets.ts`)
- 서버: 구현됨 (`server/`) → [../server/api.md](../server/api.md)
- 앱 ↔ 서버 연결: 구현됨 (`src/lib/sync.ts`, 1차 1-1)

## 앱 연결 (`src/lib/sync.ts`)
- 서버 주소: `VITE_SYNC_URL`. 없으면 개발 중에는 `http://localhost:8787`, 운영 빌드에서는 **서버 없이 로컬 모드**(`core/syncUrl.ts`).
- 공식 `y-websocket` 클라이언트로 `${서버}/api/rooms/<room>`에 접속합니다. 끊기면 자동 재접속합니다.
- 연결 상태 `app.sync`: `local`(서버 없음) / `connecting` / `online` / `offline`(재연결 중). 상단 바에 표시(`data-testid="sync-status"`).
- 접속자 상태(awareness): `{ name, color, cursor? }`. 색은 이름으로 정해집니다(`core/presence.ts`). 같은 이름의 탭 여러 개는 한 사람으로 합쳐 상단 바에 표시하고, 커서는 탭마다 사진 보드에 보여 줍니다(world 좌표, 50ms 간격 전송).
- 접속자 목록은 `name`이 없는(아직 상태를 보내지 않은) 접속을 제외합니다. 이름이 빈 문자열이면 "손님"으로 표시합니다.

## 방(room)
- 프로젝트 하나 = 방 하나. URL `?room=<id>`. 서버가 있는 빌드에서는 **등록된 프로젝트만** 접속되고(`/api/projects/:id/access`), 자격은 WebSocket 쿼리 `?session=` 또는 `?invite=`로 넘깁니다 → [../features/projects-invites.md](../features/projects-invites.md). 서버 주소가 없는 빌드는 `local-default`.
- 방 ID 형식(서버 검사): `^[A-Za-z0-9_-]{6,64}$`
- E2E 테스트는 테스트마다 다른 방을 써서 서로 섞이지 않게 합니다.

## 동기화 프로토콜
- **y-websocket 호환**입니다. 앱은 공식 `y-websocket` 클라이언트를 그대로 씁니다(1차 예정).
- 메시지 첫 값(varUint): `0` 동기화, `1` 접속자 상태(awareness), `3` 접속자 상태 요청
- 연결 직후 서버가 자신의 상태 벡터(sync step 1)를 보내고, 클라이언트도 step 1을 보내 서로 빠진 부분을 교환합니다.
- 오프라인 편집은 다시 연결될 때 자동으로 올라갑니다(서버 테스트로 확인).

## 에셋
- 에셋 ID = 내용 SHA-256 앞 16바이트(32자 hex). 클라이언트와 서버가 같은 방식으로 계산합니다.
- 기기에서는 IndexedDB(`ganpanda-assets`)에 둡니다.
- 서버에서는 R2에 두고, 업로드할 때 해시를 검증합니다.
- 업로드(`putAsset`): 기기에 저장한 뒤 서버에 `HEAD`로 있는지 확인하고 없으면 `PUT`. 실패하면 보관했다가 다시 연결될 때 재시도(`flushPendingUploads`).
- 다운로드(`assetUrl`): 기기에 없으면 서버에서 받아 기기에 저장합니다.
