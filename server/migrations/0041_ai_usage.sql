-- AI 사용 횟수 (2026-10-24 단가표 읽기, Claude API): 계정·날짜(한국)·종류별 — 하루 한도
CREATE TABLE ai_usage (
  account_id TEXT NOT NULL,
  day TEXT NOT NULL,
  kind TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (account_id, day, kind)
);
