-- 가게 사장의 사업자 (2026-10-22 "사업자 추가도 있어야한다. 선택가능하게"): 계정 하나에 여럿, 국세청 진위확인을 통과한 것만 verified.
-- 간판사 자신의 사업자(businesses, 계정당 하나·번호 유일)와 따로 — 가게 사장은 같은 번호를 다른 계정에서도 쓸 수 있다
CREATE TABLE stores (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id),
  b_no TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  owner_name TEXT NOT NULL,
  start_dt TEXT NOT NULL,
  address TEXT NOT NULL DEFAULT '',
  status TEXT,
  verified INTEGER NOT NULL DEFAULT 0,
  -- 사업자등록증 사본 메타 JSON {type,size}, R2 stores/<id>/doc
  doc TEXT,
  created_at INTEGER NOT NULL,
  UNIQUE (account_id, b_no)
);
-- 요청: 고른 사업자, 일반 주문(사업자 없음), 재요청이면 앞 요청, 취소 시각 (status 'cancelled')
ALTER TABLE requests ADD COLUMN store_id TEXT;
ALTER TABLE requests ADD COLUMN general INTEGER NOT NULL DEFAULT 0;
ALTER TABLE requests ADD COLUMN prev_id TEXT;
ALTER TABLE requests ADD COLUMN cancelled_at INTEGER;
-- (쓰지 않음 — 2026-10-22 같은 날 "환불 재요청 빼줘"로 환불·재요청을 뺐다. 운영에 이미 적용되어 열은 남는다: requests.prev_id, invites.refunded_at)
ALTER TABLE invites ADD COLUMN refunded_at INTEGER;
