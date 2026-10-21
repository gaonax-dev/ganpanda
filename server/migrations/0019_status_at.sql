-- 상태(정지·완료)가 된 시각 (2026-10-21 홈 "지난 프로젝트" 접기 기준). NULL = 옛 데이터 → 앱이 만든 날로 본다
ALTER TABLE projects ADD COLUMN status_at INTEGER;
