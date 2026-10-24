-- 앱(Tauri)에서 시작한 소셜 로그인 (2026-10-24 "카카오 앱으로 로그인 해야지"): 끝나면 웹 주소 대신 ganpanda://login#session= 으로 돌려보낸다
ALTER TABLE oauth_states ADD COLUMN app INTEGER NOT NULL DEFAULT 0;
