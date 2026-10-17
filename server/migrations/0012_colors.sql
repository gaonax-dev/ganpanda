-- 계정 색 라이브러리 (2026-10-17): JSON {version:1, colors:[{id, kind, name, hex, supplier?, code?, createdAt}]}
ALTER TABLE accounts ADD COLUMN colors TEXT;
