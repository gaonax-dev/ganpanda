-- 영구 정지된 회원이 탈퇴해도 1년 동안 같은 이메일로 다시 가입하지 못하게 (약관 개정안 제3조의2 제1항 제3호) — 이메일은 해시로만
CREATE TABLE banned_emails (
  email_hash TEXT PRIMARY KEY,
  until INTEGER NOT NULL
);
