-- 가게 사장이 다른 간판집을 확정했을 때 떨어진 간판집 프로젝트 표시 (2026-10-22 "탈락한 업체의 복제된 프로젝트에 배지를 달아 다른 곳에서 진행하게 된것을 알린다").
-- 마음을 바꿔 그 간판집을 다시 고르면 지운다. 요청에는 고른 프로젝트
ALTER TABLE projects ADD COLUMN lost_at INTEGER;
ALTER TABLE requests ADD COLUMN chosen_project TEXT;
