-- 사양 글 사전 지역 힌트 (2026-10-19 V3): 규칙을 정한 계정의 지역(시·도) — 추천 정렬에만 쓴다(강제 범위 아님)
ALTER TABLE spec_rules ADD COLUMN region TEXT;
