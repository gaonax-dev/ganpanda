-- 2026-10-15 사용자: "멤버 관리는 설정에서 하고 프로젝트별·그룹별 관리는 하지 않는다. 리스트 뷰의 계산값이 계약 금액이다(사용자가 입력하면 그 금액, 자동 계산 복구)"
-- 팀 멤버: 계정(오너) 단위. can_billing = 정산 금액을 볼 수 있음
CREATE TABLE team_members (
  owner_id TEXT NOT NULL REFERENCES accounts(id),
  account_id TEXT NOT NULL REFERENCES accounts(id),
  can_billing INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (owner_id, account_id)
);
CREATE INDEX team_members_account ON team_members(account_id);
DROP TABLE group_members;
-- 계약 금액 = 프로젝트 리스트 뷰 견적 합계(quote_total, 앱이 저장) 또는 사용자가 입력한 값(contract_override, NULL = 자동)
ALTER TABLE projects ADD COLUMN quote_total INTEGER NOT NULL DEFAULT 0;
ALTER TABLE projects ADD COLUMN contract_override INTEGER;
