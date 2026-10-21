-- 간판집의 외주 요청 (2026-10-22 "프로젝트 카드 선택에 다른업체에 외주요청 버튼을 누르면 외주폴더로 이동한다 … 해당 건은 b2b로 표시"):
-- projects.outsource = 외주 폴더, requests.b2b = 간판집이 다른 업체에 보낸 요청
ALTER TABLE projects ADD COLUMN outsource INTEGER NOT NULL DEFAULT 0;
ALTER TABLE requests ADD COLUMN b2b INTEGER NOT NULL DEFAULT 0;
