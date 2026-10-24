-- 간판다 밖 거래 신고 (2026-10-24): 요청을 연 간판집 기록(신고 근거), 가게 사장의 신고, 위약금(크레딧 3배·최대 15만원) + 요청 받기 정지
CREATE TABLE request_views (
  request_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  first_at INTEGER NOT NULL,
  PRIMARY KEY (request_id, account_id)
);
CREATE TABLE request_reports (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL,
  -- 가게 사장이 적은 업체(이름·전화)와 사정
  shop_text TEXT NOT NULL,
  text TEXT NOT NULL DEFAULT '',
  -- open | penalized | dismissed
  status TEXT NOT NULL DEFAULT 'open',
  created_at INTEGER NOT NULL,
  resolved_at INTEGER,
  penalized_account TEXT,
  amount INTEGER,
  -- 위약금 결제됨(1) / 미납(0)
  paid INTEGER
);
CREATE INDEX request_reports_status ON request_reports(status, created_at);
ALTER TABLE accounts ADD COLUMN requests_blocked INTEGER NOT NULL DEFAULT 0;
