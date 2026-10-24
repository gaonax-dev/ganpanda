-- 요청 크레딧 (2026-10-24): 층(요청마다 한 번), 보낸 순간의 자동 견적, 크레딧 금액(자동 견적 × 0.3%, 3,000~50,000원)
ALTER TABLE requests ADD COLUMN floor TEXT NOT NULL DEFAULT '';
ALTER TABLE requests ADD COLUMN estimate_total INTEGER;
ALTER TABLE requests ADD COLUMN fee INTEGER;
