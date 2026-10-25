-- 요청 크레딧은 고객이 제안을 열 때 결제 (2026-10-25 "고객이 견적을 확인하면 그때 결제하는 건 어떤가? 간판집은 예약하고"):
-- 제안 링크 = 예약(paid_at NULL), 고객이 처음 열면 viewed_at → 등록 카드로 결제 → paid_at. 실패하면 charge_error (간판집이 [다시 결제])
ALTER TABLE request_responses ADD COLUMN paid_at INTEGER;
ALTER TABLE request_responses ADD COLUMN viewed_at INTEGER;
ALTER TABLE request_responses ADD COLUMN charging_at INTEGER;
ALTER TABLE request_responses ADD COLUMN charge_error TEXT;
-- 지금까지의 제안은 이미 결제했거나(제안 때 결제) 무료였다 → 열린 것으로
UPDATE request_responses SET paid_at = created_at;
