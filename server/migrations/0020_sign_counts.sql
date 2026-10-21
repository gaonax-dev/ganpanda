-- 홈 카드의 실측 상태 (2026-10-21): 앱이 프로젝트를 열어 둔 동안 저장하는 사인물 수·미측정 수
ALTER TABLE projects ADD COLUMN sign_total INTEGER NOT NULL DEFAULT 0;
ALTER TABLE projects ADD COLUMN sign_unmeasured INTEGER NOT NULL DEFAULT 0;
