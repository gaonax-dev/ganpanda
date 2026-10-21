-- 프로젝트 종류 (2026-10-22 "가게 사장님들 휴대폰에서 작성한 내용을 pc에서 확인을 못하는데"): 'estimate' = 소비자 견적 요청 초안(계정당 하나, 기기 간 동기화). NULL = 보통 프로젝트
ALTER TABLE projects ADD COLUMN kind TEXT;
CREATE INDEX projects_owner_kind ON projects(owner_id, kind);
