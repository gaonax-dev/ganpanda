-- 약관 동의 기록 · 운영자 계정 조치 · 이의 신청 · 들어간 프로젝트 기록 (2026-10-27 "전부 진행해줘" — 이용약관 개정안 제3조·제3조의3·제5조의2)
ALTER TABLE accounts ADD COLUMN terms_version TEXT;
ALTER TABLE accounts ADD COLUMN terms_at INTEGER;
-- 이용 정지: suspended_until > 지금 이면 기간 정지, banned = 1 이면 영구 정지(이용계약 해지)
ALTER TABLE accounts ADD COLUMN suspended_until INTEGER;
ALTER TABLE accounts ADD COLUMN banned INTEGER NOT NULL DEFAULT 0;
ALTER TABLE accounts ADD COLUMN suspend_reason TEXT;
-- 조치 이력: warn | suspend | ban | lift
CREATE TABLE account_actions (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  action TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  until INTEGER,
  by_email TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
CREATE INDEX account_actions_account ON account_actions(account_id, created_at);
-- 이의 신청 (통지 후 14일)
CREATE TABLE appeals (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  text TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  reply TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  resolved_at INTEGER
);
CREATE INDEX appeals_status ON appeals(status, created_at);
-- 남의 프로젝트에 들어간 기록 — 탈퇴할 때 거기 남긴 대화를 익명화 (제3조의3)
CREATE TABLE project_seen (
  account_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  PRIMARY KEY (account_id, project_id)
);
