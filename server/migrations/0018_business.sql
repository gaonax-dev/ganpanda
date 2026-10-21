-- 사업자 확인 (2026-10-21 결정): 계정 하나 = 사업자 하나, 사업자번호는 계정 사이에 유일 (체험·요금은 사업자당 1번)
CREATE TABLE businesses (
  b_no TEXT PRIMARY KEY,
  account_id TEXT NOT NULL UNIQUE REFERENCES accounts(id),
  owner_name TEXT NOT NULL,
  start_dt TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  -- 국세청 상태: active(계속) / suspended(휴업) / closed(폐업)
  status TEXT NOT NULL DEFAULT 'active',
  verified_at INTEGER NOT NULL,
  checked_at INTEGER NOT NULL
);
