-- 소셜 로그인 (1-2d): 공급자 계정 ↔ 간판다 계정 연결, OAuth 상태 토큰
CREATE TABLE identities (
  provider TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  account_id TEXT NOT NULL REFERENCES accounts(id),
  email TEXT,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (provider, provider_id)
);
CREATE INDEX identities_account ON identities(account_id);
-- CSRF 방지용 state (10분 유효, 1회용). next = 로그인 뒤 돌아갈 앱 경로
CREATE TABLE oauth_states (
  state TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  next TEXT NOT NULL DEFAULT '/',
  created_at INTEGER NOT NULL
);
