-- 톡 색인 (2026-10-22 사용자: "메인화면에서 모든 톡방을 열어서 확인하고 링크를 누르면 해당 프로젝트의 링크로 이동", "닉은 사용하는데 아이디로 연결하라는 거지").
-- 방 멤버(계정 아이디)마다 한 줄 — 메인 화면 톡 목록과 방 멤버의 프로젝트 접근(초대 링크 없이)에 쓴다. 방 원본은 프로젝트 문서(Yjs talks), 이 표는 서버가 다시 만든다.
CREATE TABLE talk_index (
  account_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  room_id TEXT NOT NULL,
  room_name TEXT NOT NULL,
  last_ts INTEGER NOT NULL DEFAULT 0,
  last_text TEXT NOT NULL DEFAULT '',
  last_author TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (account_id, project_id, room_id)
);
CREATE INDEX talk_index_project ON talk_index (project_id);
