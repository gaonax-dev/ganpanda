-- 멤버 초대 링크 → 카카오 로그인 (2026-10-24 "해당 링크에 카카오 로그인을 만들면 되지 않나?"): 소셜 로그인 동안 초대 토큰을 들고 간다
ALTER TABLE oauth_states ADD COLUMN team_token TEXT;
