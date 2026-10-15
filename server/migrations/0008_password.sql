-- 이메일·비밀번호 로그인 (2026-10-15 사용자: "oauth 는 유지하는데 기본 이메일 비밀번호 방식이 필요해")
-- password_hash = "pbkdf2$<반복>$<salt b64>$<hash b64>" (PBKDF2-SHA256). email_verified = 메일 링크·소셜로 이메일 소유가 확인됨
ALTER TABLE accounts ADD COLUMN password_hash TEXT;
ALTER TABLE accounts ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0;
-- 지금까지의 계정은 모두 메일 링크·소셜로 만들어졌으므로 확인된 것
UPDATE accounts SET email_verified = 1;
-- 로그인 실패 기록 (이메일별 잠금)
CREATE TABLE login_failures (
  email TEXT NOT NULL,
  at INTEGER NOT NULL
);
CREATE INDEX login_failures_email ON login_failures(email, at);
-- 비밀번호 재설정 링크로 만든 세션: 이 시각까지는 현재 비밀번호 없이 새 비밀번호를 정할 수 있다
ALTER TABLE sessions ADD COLUMN reset_until INTEGER;
ALTER TABLE login_tokens ADD COLUMN purpose TEXT;
