-- 요청에 계정 (2026-10-21 "카카오톡으로 로그인하게해줘 인증이되야 할거 같아"): 소비자도 로그인(카카오 기본) 뒤 요청. 옛 행은 NULL(키로만)
ALTER TABLE requests ADD COLUMN account_id TEXT;
CREATE INDEX requests_account ON requests(account_id);
