-- 소비자가 그린 사인물 (2026-10-21 "소비자는 … 도형그리기 사이즈 그리고 메모로 견적을 요청"): 요청 사진 번호 + 영역 + 치수 + 종류 + 메모 JSON
ALTER TABLE requests ADD COLUMN signs TEXT NOT NULL DEFAULT '[]';
