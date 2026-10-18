-- 세트 라이브러리 (2026-10-19 레이어 구조 4단계): 계정마다 레이어 묶음 JSON {version:1, sets:[{id, name, frame:{w,h}, layers, thumb?, createdAt}]}
ALTER TABLE accounts ADD COLUMN sets TEXT;
