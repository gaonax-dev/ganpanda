-- 사업장 주소 (2026-10-24 "요청 지역설정을 사업자 주소로 먼저 설정"): 요청 받기 기본 지역
ALTER TABLE businesses ADD COLUMN address TEXT NOT NULL DEFAULT '';
