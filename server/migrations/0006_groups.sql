-- 프로젝트 그룹 + 상태·정산 (2026-10-15 사용자: "프로젝트 그룹을 만들고 계산서를 그룹에서 한번에, 상태 대기/진행중/완료, 정산 받은 금액/계약 금액")
CREATE TABLE groups (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES accounts(id),
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX groups_owner ON groups(owner_id);
-- 멤버: 오너가 계정(이메일)으로 추가. can_billing = 정산 금액을 볼 수 있음 (오너는 기본, 멤버는 오너가 설정)
CREATE TABLE group_members (
  group_id TEXT NOT NULL REFERENCES groups(id),
  account_id TEXT NOT NULL REFERENCES accounts(id),
  can_billing INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (group_id, account_id)
);
CREATE INDEX group_members_account ON group_members(account_id);
ALTER TABLE projects ADD COLUMN group_id TEXT;
ALTER TABLE projects ADD COLUMN status TEXT NOT NULL DEFAULT 'waiting';
ALTER TABLE projects ADD COLUMN contract_amount INTEGER NOT NULL DEFAULT 0;
ALTER TABLE projects ADD COLUMN paid_amount INTEGER NOT NULL DEFAULT 0;
