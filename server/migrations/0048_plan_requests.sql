-- 유료 버전 신청 (2026-10-30): 정식 결제 전 — 신청하면 서버가 1시간 뒤(매시간 작업) 요금제를 올린다, 결제 없음
CREATE TABLE plan_requests (
  account_id TEXT PRIMARY KEY,
  plan TEXT NOT NULL,
  requested_at INTEGER NOT NULL,
  granted_at INTEGER
);
CREATE INDEX plan_requests_pending ON plan_requests (granted_at, requested_at);
