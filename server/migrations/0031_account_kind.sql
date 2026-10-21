-- 계정 종류 (2026-10-22 "사업자는 소비자 등록이 안된다. 소비자는 사업자로 변경하고 기존 데이터는 사업자로 이관된다"):
-- 'shop' = 간판집(프로젝트), 'consumer' = 가게 사장(견적 요청). null = 아직 안 정함 — 처음 프로젝트를 만들면 shop, 처음 견적 초안 방을 열면 consumer
ALTER TABLE accounts ADD COLUMN kind TEXT;
