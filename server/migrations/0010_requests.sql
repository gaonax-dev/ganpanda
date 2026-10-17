-- 요청판 (2026-10-17): 가게 사장의 견적 요청 → 지역의 "요청 받기" 간판사 → 제안 링크. 결정 docs/product/decisions.md
ALTER TABLE accounts ADD COLUMN receive_requests INTEGER NOT NULL DEFAULT 0;
-- 지역: 쉼표 구분 (예 "경기 광주시,성남시 분당구")
ALTER TABLE accounts ADD COLUMN regions TEXT NOT NULL DEFAULT '';
-- 요청에서 만든 프로젝트
ALTER TABLE projects ADD COLUMN request_id TEXT;
-- 요청: 고객 키는 해시만. photos = JSON [{n, type, size}] (R2 키 requests/<id>/<n>)
CREATE TABLE requests (
  id TEXT PRIMARY KEY,
  key_hash TEXT NOT NULL,
  store TEXT NOT NULL,
  region TEXT NOT NULL,
  text TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL,
  email TEXT,
  ref TEXT,
  photos TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'open',
  created_at INTEGER NOT NULL,
  approved_at INTEGER,
  approved_by TEXT
);
CREATE INDEX requests_region ON requests(region, status);
CREATE INDEX requests_phone ON requests(phone, status);
-- 간판사의 답(제안 링크 발급 시점) = 요금 발생·홍보자 정산 근거. 간판사당 요청 하나에 한 줄
CREATE TABLE request_responses (
  request_id TEXT NOT NULL REFERENCES requests(id),
  account_id TEXT NOT NULL REFERENCES accounts(id),
  project_id TEXT NOT NULL,
  proposal_url TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (request_id, account_id)
);
