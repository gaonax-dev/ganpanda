-- 프로젝트 상세 (2026-10-21 "만들기 입력필드가 포커싱되면 하단에 연락처, 주소, 계약일, 시작일, 완료일, 메모"): 모두 선택. 날짜는 'YYYY-MM-DD'
ALTER TABLE projects ADD COLUMN contact TEXT NOT NULL DEFAULT '';
ALTER TABLE projects ADD COLUMN address TEXT NOT NULL DEFAULT '';
ALTER TABLE projects ADD COLUMN contract_date TEXT;
ALTER TABLE projects ADD COLUMN start_date TEXT;
ALTER TABLE projects ADD COLUMN due_date TEXT;
ALTER TABLE projects ADD COLUMN memo TEXT NOT NULL DEFAULT '';
