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
- **주인 추적**: y-websocket 클라이언트는 다른 사람의 상태를 받으면 서버에 그대로 되돌려 보냅니다(echo). 그래서 "소켓이 보낸 상태 = 그 소켓의 상태"로 보면 안 됩니다. 서버는 SQLite `awareness` 테이블(client_id, sock, clock, state)에 **처음 보낸 소켓을 주인**으로 기록하고, 주인이 살아 있는 clientID를 다른 소켓이 보내면 무시합니다.
- 소켓마다 접속 시 무작위 `sid`를 만들어 attachment와 WebSocket 태그에 둡니다. `getWebSockets(sid)`로 살아 있는지 확인합니다.
- 주인 소켓이 죽었는데(재연결 등) 같은 clientID가 다른 소켓에서 오면 그 소켓이 새 주인이 됩니다.
- 받아들인 항목만 다른 접속자에게 다시 보냅니다(echo 는 전달하지 않음).
- 연결이 끊기면 그 소켓이 주인인 clientID 전부에 대해 퇴장(clock + 1, `null`)을 보내고 행을 지웁니다. 깨끗한 종료든 갑작스러운 끊김이든 서버가 처리합니다(로컬 wrangler dev 에서 1초 안에 확인).
- 잠들었다 깨어나면(생성자) 이미 죽은 소켓의 행을 정리하고 남은 접속자에게 알립니다.
- 새 접속자에게는 살아 있는 소켓의 상태만 보냅니다.
- 상태 JSON 은 4KB(`MAX_STATE`)까지만 받습니다.

## 좌석 (Account DO, `server/src/account.ts`)
- 계정 ID로 `getByName`. SQLite `seats(sid, person, updated_at)`. `acquire(person, sid, limit)`: 이미 앉은 사람은 한도와 무관하게 허용, 아니면 `COUNT(DISTINCT person) < limit`일 때만.
- Room 은 소켓 메시지가 올 때 30초(`SEAT_RENEW`)마다 `renew`, 닫히면 `release`. Account 는 90초(`SEAT_TTL`) 넘은 좌석을 정리합니다.
- Worker 가 접속 시 `x-sid`·`x-owner`·`x-role` 헤더로 Room 에 넘깁니다.

## 테스트 환경
- `@cloudflare/vitest-plugin`(이전 이름 `vitest-pool-workers`)으로 실제 Workers 런타임에서 실행합니다.
- 테스트용 클라이언트 `server/test/client.ts`: 이 런타임에서는 바이너리 메시지가 Blob으로 들어오므로, 순서를 지키며 ArrayBuffer로 바꿔 처리합니다. 실제 브라우저의 `y-websocket`은 ArrayBuffer로 받습니다. `echo = true`로 두면 y-websocket처럼 남의 상태를 되돌려 보내는 동작을 흉내 냅니다.
