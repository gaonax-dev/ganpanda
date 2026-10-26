-- 신고·차단 (2026-10-26 "신고·차단 기능 진행해줘" — 앱스토어 1.2 사용자 생성 콘텐츠).
-- 신고: 메시지(말풍선·톡) 또는 사용자. excerpt = 신고 때 서버가 읽은 메시지 글(증거). 운영자가 hide(메시지 삭제) 또는 dismiss
CREATE TABLE content_reports (
  id TEXT PRIMARY KEY,
  project_id TEXT,
  message_id TEXT,
  target_id TEXT,
  target_name TEXT NOT NULL DEFAULT '',
  reason TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  excerpt TEXT NOT NULL DEFAULT '',
  reporter_id TEXT,
  reporter_name TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open',
  action TEXT,
  created_at INTEGER NOT NULL,
  resolved_at INTEGER
);
CREATE INDEX content_reports_status ON content_reports(status, created_at);
-- 차단: 계정이 다른 사람(계정 id 또는 손님 g:…)을 차단 — 그 사람의 메시지가 내 화면에서 사라진다
CREATE TABLE blocks (
  account_id TEXT NOT NULL,
  blocked_id TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  PRIMARY KEY (account_id, blocked_id)
);
