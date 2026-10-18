-- 사양 글 표본 (2026-10-18 사용자: "메모로 전환하는 글만 모아서 ai로 전환하는 방식으로"): 퀵입력에서 못 알아보고 요청사항(메모)으로 넘어간 글.
-- 사용자가 확인 창에서 "보내기"를 켠 것만. 개발 때 파서 어휘·테스트 말뭉치로 쓴다 (프로젝트 내용과 연결되지 않음)
CREATE TABLE IF NOT EXISTS spec_samples (
  id TEXT PRIMARY KEY,
  account_id TEXT,
  product_id TEXT,
  text TEXT NOT NULL,
  leftover TEXT NOT NULL,
  recognized TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS spec_samples_created ON spec_samples (created_at);
