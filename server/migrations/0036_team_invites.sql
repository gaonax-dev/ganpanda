-- 멤버 초대 메일 (2026-10-24 "맴버는 메일로 가입링크 들어오기로"): 가입 안 한 이메일 → 가입 링크(/login?team=), 7일·1회용
CREATE TABLE team_invites (
  token_hash TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  email TEXT NOT NULL,
  can_billing INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at INTEGER
);
CREATE INDEX team_invites_owner ON team_invites(owner_id);
CREATE INDEX team_invites_email ON team_invites(email);
