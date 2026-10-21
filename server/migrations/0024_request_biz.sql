-- 소비자 요청에 주소·사업자번호 (2026-10-21 "둘다 작성하는 걸로"): 둘 다 선택. 사업자번호는 국세청 상태조회로 확인 → biz_status(active/suspended/null)
ALTER TABLE requests ADD COLUMN address TEXT NOT NULL DEFAULT '';
ALTER TABLE requests ADD COLUMN biz_no TEXT;
ALTER TABLE requests ADD COLUMN biz_status TEXT;
