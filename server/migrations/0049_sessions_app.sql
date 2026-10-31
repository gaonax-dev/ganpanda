-- 앱 세션 (2026-10-31 "로딩 스피너만 돌아"): 앱(User-Agent Ganpanda-App/)으로 만들거나 쓴 세션. 아이폰 WKWebView 는 WebSocket 핸드셰이크에 커스텀 UA 를 안 붙여
-- 실시간 동기화 소켓이 차단에 걸렸다 → 소켓은 ?session= 으로 오므로 세션의 이 표시로 통과시킨다
ALTER TABLE sessions ADD COLUMN app INTEGER NOT NULL DEFAULT 0;
