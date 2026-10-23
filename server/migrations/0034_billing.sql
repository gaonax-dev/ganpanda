-- 결제 (2026-10-23 토스페이먼츠 자동결제): 계정마다 카드(빌링키, 암호화) · 구독 상태, 결제 기록
CREATE TABLE billing (
  account_id TEXT PRIMARY KEY,
  customer_key TEXT NOT NULL UNIQUE,
  billing_key_enc TEXT,
  card_label TEXT NOT NULL DEFAULT '',
  -- 구독 중인 요금제 (basic | pro), NULL = 구독 없음. 계정의 실제 요금제는 accounts.plan
  plan TEXT,
  -- 다음 결제일부터 바꿀 요금제
  next_plan TEXT,
  auto_renew INTEGER NOT NULL DEFAULT 0,
  -- 이번 기간 끝 = 다음 결제일 (ms), 기준일(한국 시각 날짜 1~31 — 말일 보정 뒤 되돌리기)
  period_end INTEGER,
  anchor_day INTEGER,
  -- 결제 실패 유예 끝 (7일), 재시도
  grace_until INTEGER,
  fail_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  last_try_at INTEGER,
  updated_at INTEGER NOT NULL
);
CREATE INDEX billing_due ON billing(period_end);
CREATE TABLE payments (
  order_id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  plan TEXT NOT NULL,
  amount INTEGER NOT NULL,
  -- first = 구독 시작 · renew = 매달
  kind TEXT NOT NULL,
  -- DONE | FAILED | CANCELED
  status TEXT NOT NULL,
  payment_key TEXT,
  receipt_url TEXT,
  error TEXT,
  created_at INTEGER NOT NULL,
  approved_at INTEGER
);
CREATE INDEX payments_account ON payments(account_id, created_at);
