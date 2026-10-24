-- 요청 크레딧 결제 (2026-10-24): 어느 요청의 크레딧인지 (payments.kind = 'credit')
ALTER TABLE payments ADD COLUMN request_id TEXT;
CREATE INDEX payments_credit ON payments(account_id, kind, created_at);
