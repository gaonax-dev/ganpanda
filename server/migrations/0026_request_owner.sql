-- 사본 없이 직접 입력하는 검증 요소 (2026-10-21 "사본이 없으면 직접입력 필요한 우리가 필요한 검증 요소만 입력"): 대표자명·개업일 → 국세청 진위확인
ALTER TABLE requests ADD COLUMN owner_name TEXT;
ALTER TABLE requests ADD COLUMN start_date TEXT;
ALTER TABLE requests ADD COLUMN biz_verified INTEGER NOT NULL DEFAULT 0;
