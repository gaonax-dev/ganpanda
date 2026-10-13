# 서버 내부 구조

## 요약
방(프로젝트) 하나 = Durable Object `Room` 하나. Yjs 문서를 SQLite에 업데이트 로그로 저장하고, WebSocket Hibernation API로 접속자 사이를 중계합니다.

## 상태
구현됨 — `server/src/room.ts`, `server/src/protocol.ts`

## Room
- **시작**: `blockConcurrencyWhile` 안에서 `updates` 테이블을 만들고, 저장된 업데이트를 모두 적용해 문서를 복원합니다.
- **변경 처리 순서**: 저장 먼저(`INSERT INTO updates`), 그다음 다른 접속자에게 전달합니다.
- **압축**: 업데이트가 `COMPACT_AT`(200)개를 넘으면 전체 상태 하나로 바꿉니다. 삭제와 삽입을 같은 동기 블록에서 실행해 원자적으로 반영됩니다.
- **Hibernation**: 접속이 있어도 메시지가 없으면 메모리에서 내려갈 수 있습니다. 다시 깨어나면 생성자가 SQLite에서 문서를 다시 읽습니다. 메모리에만 있는 상태에 의존하지 않습니다.

## 접속자 표시 (awareness)
- 클라이언트가 보낸 마지막 awareness 메시지를 해당 WebSocket의 attachment에 보관합니다(2KB 제한 때문에 1,800바이트 이하만, `MAX_AWARENESS`). 메모리가 아니라 소켓에 붙어 있어 Hibernation 뒤에도 남습니다.
- 새 접속자에게 다른 사람들의 보관된 상태를 보냅니다.
- 연결이 끊기면 보관된 상태로 "퇴장" 메시지(같은 clientID, clock + 1, `null`)를 만들어 알립니다 (`awarenessRemoval`).

## 테스트 환경
- `@cloudflare/vitest-plugin`(이전 이름 `vitest-pool-workers`)으로 실제 Workers 런타임에서 실행합니다.
- 테스트용 클라이언트 `server/test/client.ts`: 이 런타임에서는 바이너리 메시지가 Blob으로 들어오므로, 순서를 지키며 ArrayBuffer로 바꿔 처리합니다. 실제 브라우저의 `y-websocket`은 ArrayBuffer로 받습니다.
