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
- 에셋 요청에는 프로젝트 자격(`?project=&session|invite`)이 붙습니다(`setAssetScope`, 방 진입 후 설정).
- 업로드(`putAsset`): 서버에 `HEAD`로 있는지 확인하고 없으면 `PUT`한 뒤 기기에 저장. 용량 한도 초과(413 `storage_limit`)면 저장하지 않고 `StorageLimitError` → 상단 알림. 네트워크 실패는 보관했다가 다시 연결될 때 재시도(`flushPendingUploads`) — **2026-10-17**: 재연결 때만이 아니라 5초→15초→45초→2분 간격으로도 다시 올리고(`schedulePendingFlush`), 자격(`setAssetScope`)이 늦게 오면 그때 올립니다. 연결이 끊긴 적 없이 한 번 실패한 사진이 휴대폰에만 남아 다른 기기에 안 보이던 경우를 막습니다.
- 동시접속 한도(429)로 접속이 거부되면 y-websocket 이 재시도하는 동안 앱은 3초마다 `/access`의 좌석 현황을 확인해 안내 배너를 보여 주고, 연결되면 지웁니다.
- 다운로드(`assetUrl`): 기기에 없으면 서버에서 받아 기기에 저장합니다. **2026-10-17**(사용자: "이미지가 기기에서 오는데 오래 걸리거나 모바일에서는 누락되는 경우도 있다"): 같은 에셋 동시 요청은 한 번만 받고(`inflight`), 서버 받기는 30초 제한 + 5회 재시도(0.7→8초), 브라우저가 오프라인이면 `online` 까지 기다렸다가 받습니다. 404/403 만 즉시 "없음". 끝내 못 받은 에셋은 `missing` 에 두었다가 다시 연결될 때 받고(`retryMissingAssets`, `whenOnline`), 받으면 `onAssetsRecovered` → `app.assetEpoch` 가 바뀌어 에셋을 쓰는 화면(보드 사진·리스트 카드·디자인·첨부·구성 요소 그림·제안 이미지)이 다시 요청합니다. IndexedDB 를 못 여는 환경(사생활 보호 모드·용량 부족)에서도 서버에서 바로 받아 보여 줍니다.
- **휴대폰 메모리**(2026-10-18 사용자: 아이폰 크롬 "이 페이지를 열 수 없음" = 웹 프로세스 크래시): 표시용 사진(`photoDisplay.displayUrl(assetId, {w,h})`)은 원본을 통째로 디코딩하지 않고 `createImageBitmap(blob, {resizeWidth})` 로 줄인 크기만 디코딩(크기를 모르거나 지원 안 하면 옛 경로), 사진 위·카드의 입힌 디자인(`DesignFace`)도 원본 페이지 대신 줄인 사본. **2D 겹침 층은 표시 px 크기**(`PhotoZone` `.designs`: 전에는 사진 원본 px 크기(예 4000×3000 CSS px)로 만들고 `transform: scale` 로 줄였는데, WebKit 은 그 층의 백킹 스토어를 원본 크기로 잡아 사진 여러 장이면 수백 MB → 핀볼 프로젝트에서 "이미지가 로딩 완료되고 다시 로딩 완료되고 에러 화면"). 진단용 `?safe=1`(`app.safeMode`): 2D 겹침(바탕·테·디자인·글자)과 카드 얼굴을 끈다 — 그래도 죽으면 겹침 레이어가 원인이 아님.
- **올리기 전 줄이기**(`photoPrep.ts` `prepareUpload`, 2026-10-17): 사진은 긴 변 **3200px**(`UPLOAD_MAX`) 로 줄여(JPEG 0.9, EXIF 회전 적용) 올립니다 — 휴대폰 12MP 사진 3~6MB 가 1MB 안팎으로. 사진 좌표는 올린 에셋 px 기준이라 올리기 전에만 줄이면 일관됩니다.
